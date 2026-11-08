
import mongoose from 'mongoose'

import Team from '@/models/Team'
import User from '@/models/User'
import Tournament from '@/models/Tournament'

import type { TeamRole } from '@/types/team'
import type { TournamentTeamMember } from '@/types/tournament'

import { isBlacklisted } from '@/services/blacklist'

type EditableRole = Exclude<TeamRole, 'leader'>
type TeamDocument = InstanceType<typeof Team>

function countActiveMembers(team: TeamDocument) {
  return team.members.filter(member => member.role !== 'substitute').length
}

function isLeader(
  team: TeamDocument,
  userId: mongoose.Types.ObjectId
) {
  return team.members.some(
    member => member.userId.equals(userId) && member.role === 'leader'
  )
}

/**
 * Actualiza la copia de un equipo en todos los torneos abiertos
 * donde esté inscrito.
 *
 * Se ejecuta dentro de la misma transacción que la modificación
 * del equipo original.
 */
export async function syncTeamSnapshots(
  team: TeamDocument,
  session: mongoose.ClientSession
) {
  const tournaments = await Tournament.find({
    status: 'open',
    'teams.teamId': team._id
  }).session(session)

  if (!tournaments.length) return

  if (countActiveMembers(team) < 3) {
    throw new Error('Un equipo inscrito necesita al menos 3 titulares.')
  }

  const users = await User.find({
    _id: { $in: team.members.map(member => member.userId) }
  }).session(session)

  if (users.length !== team.members.length) {
    throw new Error('No se han encontrado todos los integrantes del equipo.')
  }

  const userMap = new Map(
    users.map(user => [user._id.toString(), user])
  )

  const members: TournamentTeamMember[] = team.members.map(member => {
    const user = userMap.get(member.userId.toString())

    if (!user) {
      throw new Error('No se ha encontrado un integrante del equipo.')
    }

    if (!user.brawlId) {
      throw new Error(
        `El usuario ${user.discordId} debe vincular su cuenta de Brawl Stars.`
      )
    }

    return {
      userId: user._id,
      discordId: user.discordId,
      brawlId: user.brawlId,
      role: member.role
    }
  })

  for (const tournament of tournaments) {
    const otherTeams = tournament.teams.filter(
      registeredTeam => !registeredTeam.teamId.equals(team._id)
    )

    const registeredUsers = new Set(
      otherTeams.flatMap(registeredTeam =>
        registeredTeam.members.map(member => member.userId.toString())
      )
    )

    if (members.some(member => registeredUsers.has(member.userId.toString()))) {
      throw new Error(
        'Un integrante ya está inscrito en otro equipo de este torneo.'
      )
    }

    const snapshot = tournament.teams.find(
      registeredTeam => registeredTeam.teamId.equals(team._id)
    )

    if (!snapshot) continue

    snapshot.name = team.name
    snapshot.members = members

    await tournament.save({ session })
  }
}

export async function getTeam(teamId: string) {
  return Team.findById(teamId)
}

export async function getUserTeam(discordId: string) {
  const user = await User.findOne({ discordId })

  if (!user?.teamId) return null

  return Team.findById(user.teamId)
}

export async function createTeam(discordId: string, name: string) {
  if (!name.trim()) {
    throw new Error('El nombre del equipo no puede estar vacío.')
  }

  const session = await mongoose.startSession()
  const result: TeamDocument[] = []

  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ discordId }).session(session)

      if (!user) throw new Error('No se ha encontrado al usuario.')
      if (user.teamId) throw new Error('Ya perteneces a un equipo.')

      const [team] = await Team.create([{
        name: name.trim(),
        members: [{
          userId: user._id,
          role: 'leader'
        }]
      }], { session })

      user.teamId = team._id

      await user.save({ session })

      result.push(team)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function addTeamMember(
  teamId: string,
  leaderDiscordId: string,
  memberDiscordId: string,
  role: EditableRole = 'member'
) {
  const session = await mongoose.startSession()
  const result: TeamDocument[] = []

  try {
    await session.withTransaction(async () => {
      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      const leader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      const member = await User.findOne({
        discordId: memberDiscordId
      }).session(session)

      if (!leader || !member) {
        throw new Error('No se ha encontrado alguno de los usuarios.')
      }

      if (!isLeader(team, leader._id)) {
        throw new Error('Solo el líder puede gestionar el equipo.')
      }

      if (leader._id.equals(member._id)) {
        throw new Error('No puedes añadirte a ti mismo.')
      }

      if (member.teamId) {
        throw new Error('Este usuario ya pertenece a un equipo.')
      }

      if (team.members.length >= 5) {
        throw new Error('El equipo ya tiene 5 integrantes.')
      }

      if (team.members.some(m => m.userId.equals(member._id))) {
        throw new Error('Este usuario ya forma parte del equipo.')
      }

      if (
        role === 'substitute' &&
        team.members.filter(m => m.role === 'substitute').length >= 2
      ) {
        throw new Error('El equipo ya tiene 2 suplentes.')
      }

      // Si el equipo ya está inscrito en un torneo abierto,
      // el nuevo integrante debe cumplir sus requisitos.
      const registeredTournament = await Tournament.exists({
        status: 'open',
        'teams.teamId': team._id
      }).session(session)

      if (registeredTournament) {
        if (!member.brawlId) {
          throw new Error(
            'El nuevo integrante debe vincular su cuenta de Brawl Stars.'
          )
        }

        if (await isBlacklisted(memberDiscordId, 'tournaments', session)) {
          throw new Error('Este usuario está en la blacklist de torneos.')
        }
      }

      team.members.push({
        userId: member._id,
        role
      })

      member.teamId = team._id

      await team.save({ session })
      await member.save({ session })

      await syncTeamSnapshots(team, session)

      result.push(team)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

/**
 * Expulsa a un integrante del equipo.
 *
 * Si expulsar a un titular deja menos de 3 titulares:
 * - Promociona automáticamente si solo hay un suplente.
 * - Si hay varios, exige promoteUserId.
 * - Si no hay suplentes, rechaza la operación.
 *
 * promoteUserId debe ser el ObjectId del suplente elegido.
 */
export async function removeTeamMember(
  teamId: string,
  leaderDiscordId: string,
  memberDiscordId: string,
  promoteUserId?: string
) {
  const session = await mongoose.startSession()
  const result: TeamDocument[] = []

  try {
    await session.withTransaction(async () => {
      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      const leader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      const member = await User.findOne({
        discordId: memberDiscordId
      }).session(session)

      if (!leader || !member) {
        throw new Error('No se ha encontrado alguno de los usuarios.')
      }

      if (!isLeader(team, leader._id)) {
        throw new Error('Solo el líder puede gestionar el equipo.')
      }

      const memberIndex = team.members.findIndex(
        m => m.userId.equals(member._id)
      )

      if (memberIndex === -1) {
        throw new Error('El usuario no pertenece al equipo.')
      }

      if (team.members[memberIndex].role === 'leader') {
        throw new Error('No puedes expulsar al líder del equipo.')
      }

      const removedRole = team.members[memberIndex].role

      if (removedRole !== 'substitute' && countActiveMembers(team) <= 3) {
        const substitutes = team.members.filter(
          m => m.role === 'substitute'
        )

        if (substitutes.length === 0) {
          throw new Error(
            'No puedes expulsar a este jugador: el equipo necesita al menos 3 titulares y no tiene suplentes.'
          )
        }

        let selectedSubstitute: (typeof substitutes)[number] | undefined

        if (promoteUserId) {
          if (!mongoose.isValidObjectId(promoteUserId)) {
            throw new Error('El ID del suplente seleccionado no es válido.')
          }

          selectedSubstitute = substitutes.find(
            substitute => substitute.userId.equals(promoteUserId)
          )

          if (!selectedSubstitute) {
            throw new Error(
              'El suplente seleccionado no pertenece al equipo o no tiene el rol de suplente.'
            )
          }
        } else if (substitutes.length === 1) {
          selectedSubstitute = substitutes[0]!
        } else {
          const availableIds = substitutes.map(
            substitute => substitute.userId.toString()
          )

          throw new Error(
            `PROMOTION_REQUIRED:${availableIds.join(',')}`
          )
        }

        selectedSubstitute.role = 'member'
      }

      team.members.splice(memberIndex, 1)
      member.teamId = null

      await team.save({ session })
      await member.save({ session })

      await syncTeamSnapshots(team, session)

      result.push(team)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function changeMemberRole(
  teamId: string,
  leaderDiscordId: string,
  memberDiscordId: string,
  role: EditableRole
) {
  const session = await mongoose.startSession()
  const result: TeamDocument[] = []

  try {
    await session.withTransaction(async () => {
      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      const leader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      const member = await User.findOne({
        discordId: memberDiscordId
      }).session(session)

      if (!leader || !member) {
        throw new Error('No se ha encontrado alguno de los usuarios.')
      }

      if (!isLeader(team, leader._id)) {
        throw new Error('Solo el líder puede gestionar el equipo.')
      }

      const target = team.members.find(
        m => m.userId.equals(member._id)
      )

      if (!target) {
        throw new Error('El usuario no pertenece al equipo.')
      }

      if (target.role === 'leader') {
        throw new Error('No puedes cambiar el rol del líder.')
      }

      if (
        role === 'substitute' &&
        target.role !== 'substitute' &&
        countActiveMembers(team) <= 3
      ) {
        throw new Error('El equipo necesita al menos 3 titulares.')
      }

      if (
        role === 'substitute' &&
        target.role !== 'substitute' &&
        team.members.filter(m => m.role === 'substitute').length >= 2
      ) {
        throw new Error('El equipo ya tiene 2 suplentes.')
      }

      target.role = role

      await team.save({ session })
      await syncTeamSnapshots(team, session)

      result.push(team)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function transferTeamLeader(
  teamId: string,
  leaderDiscordId: string,
  newLeaderDiscordId: string
) {
  const session = await mongoose.startSession()
  const result: TeamDocument[] = []

  try {
    await session.withTransaction(async () => {
      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      const currentLeader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      const newLeader = await User.findOne({
        discordId: newLeaderDiscordId
      }).session(session)

      if (!currentLeader || !newLeader) {
        throw new Error('No se ha encontrado alguno de los usuarios.')
      }

      const oldMember = team.members.find(
        m => m.userId.equals(currentLeader._id)
      )

      const newMember = team.members.find(
        m => m.userId.equals(newLeader._id)
      )

      if (!oldMember || oldMember.role !== 'leader') {
        throw new Error('No eres el líder del equipo.')
      }

      if (!newMember) {
        throw new Error('El nuevo líder no pertenece al equipo.')
      }

      oldMember.role = 'member'
      newMember.role = 'leader'

      await team.save({ session })
      await syncTeamSnapshots(team, session)

      result.push(team)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function renameTeam(
  teamId: string,
  leaderDiscordId: string,
  name: string
) {
  if (!name.trim()) {
    throw new Error('El nombre del equipo no puede estar vacío.')
  }

  const session = await mongoose.startSession()
  const result: TeamDocument[] = []

  try {
    await session.withTransaction(async () => {
      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      const leader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      if (!leader || !isLeader(team, leader._id)) {
        throw new Error('Solo el líder puede cambiar el nombre del equipo.')
      }

      team.name = name.trim()

      await team.save({ session })
      await syncTeamSnapshots(team, session)

      result.push(team)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function deleteTeam(
  teamId: string,
  leaderDiscordId: string
) {
  const session = await mongoose.startSession()

  try {
    await session.withTransaction(async () => {
      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      const leader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      if (!leader || !isLeader(team, leader._id)) {
        throw new Error('Solo el líder puede eliminar el equipo.')
      }

      // No permitimos dejar una inscripción abierta sin equipo original.
      const registered = await Tournament.exists({
        status: 'open',
        'teams.teamId': team._id
      }).session(session)

      if (registered) {
        throw new Error(
          'Primero debes retirar el equipo de los torneos abiertos.'
        )
      }

      await User.updateMany(
        {
          _id: { $in: team.members.map(member => member.userId) },
          teamId: team._id
        },
        { $set: { teamId: null } },
        { session }
      )

      await Team.deleteOne({ _id: team._id }, { session })
    })
  } finally {
    await session.endSession()
  }
}

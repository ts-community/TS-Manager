import mongoose from 'mongoose'
import Tournament from '@/models/Tournament'
import Team from '@/models/Team'
import User from '@/models/User'
import type { TournamentStatus, TournamentTeam } from '@/types/tournament'
import { isBlacklisted } from '@/services/blacklist'

const MAX_TEAMS_OPTIONS = [8, 12, 16, 24, 32]

export async function createTournament(
  name: string,
  startTime: Date,
  maxTeams: number
) {
  if (!name.trim()) {
    throw new Error('El torneo debe tener un nombre.')
  }

  if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
    throw new Error('La fecha de inicio debe ser futura.')
  }

  if (!MAX_TEAMS_OPTIONS.includes(maxTeams)) {
    throw new Error('El máximo de equipos debe ser 8, 12, 16, 24 o 32.')
  }

  return Tournament.create({
    name: name.trim(),
    startTime,
    maxTeams,
    status: 'open',
    teams: []
  })
}

export async function getTournament(tournamentId: string) {
  return Tournament.findById(tournamentId)
}

export async function getTournaments() {
  return Tournament.find().sort({ startTime: -1 })
}

export async function getActiveTournament() {
  return Tournament.findOne({
    status: 'open',
    startTime: { $gt: new Date() }
  }).sort({ startTime: 1 })
}

export async function registerTeam(
  tournamentId: string,
  teamId: string,
  leaderDiscordId: string
) {
  const session = await mongoose.startSession()
  const result: InstanceType<typeof Tournament>[] = []

  try {
    await session.withTransaction(async () => {
      const tournament = await Tournament.findById(tournamentId).session(session)

      if (!tournament) throw new Error('No se ha encontrado el torneo.')
      if (tournament.status !== 'open') {
        throw new Error('El torneo no está aceptando inscripciones.')
      }
      if (tournament.startTime <= new Date()) {
        throw new Error('El torneo ya ha comenzado.')
      }
      if (tournament.teams.length >= tournament.maxTeams) {
        throw new Error('El torneo está completo.')
      }

      const team = await Team.findById(teamId).session(session)

      if (!team) throw new Error('No se ha encontrado el equipo.')

      if (tournament.teams.some(t => t.teamId.equals(team._id))) {
        throw new Error('Este equipo ya está inscrito.')
      }

      const leader = await User.findOne({
        discordId: leaderDiscordId
      }).session(session)

      if (!leader || !team.members.some(
        member => member.userId.equals(leader._id) && member.role === 'leader'
      )) {
        throw new Error('Solo el líder puede inscribir al equipo.')
      }

      const activeMembers = team.members.filter(
        member => member.role !== 'substitute'
      )

      if (activeMembers.length < 3) {
        throw new Error('El equipo necesita al menos 3 titulares.')
      }

      const users = await User.find({
        _id: { $in: team.members.map(member => member.userId) }
      }).session(session)

      if (users.length !== team.members.length) {
        throw new Error('No se han encontrado todos los integrantes.')
      }

      const userMap = new Map(
        users.map(user => [user._id.toString(), user])
      )

      const members: TournamentTeam['members'] = []

      for (const member of team.members) {
        const user = userMap.get(member.userId.toString())

        if (!user) {
          throw new Error('No se ha encontrado un integrante del equipo.')
        }

        if (!user.teamId?.equals(team._id)) {
          throw new Error('La pertenencia al equipo no es válida.')
        }

        if (!user.brawlId) {
          throw new Error(
            `El usuario ${user.discordId} debe vincular su cuenta de Brawl Stars.`
          )
        }

        if (await isBlacklisted(user.discordId, 'tournaments', session)) {
          throw new Error(
            `El usuario ${user.discordId} está en la blacklist de torneos.`
          )
        }

        members.push({
          userId: user._id,
          discordId: user.discordId,
          brawlId: user.brawlId,
          role: member.role
        })
      }

      const registeredUsers = new Set(
        tournament.teams.flatMap(t =>
          t.members.map(member => member.userId.toString())
        )
      )

      if (members.some(member => registeredUsers.has(member.userId.toString()))) {
        throw new Error('Uno o varios integrantes ya están inscritos en otro equipo.')
      }

      const snapshot: TournamentTeam = {
        teamId: team._id,
        name: team.name,
        members,
        registeredAt: new Date()
      }

      tournament.teams.push(snapshot)

      await tournament.save({ session })
      result.push(tournament)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function unregisterTeam(
  tournamentId: string,
  leaderDiscordId: string
) {
  const session = await mongoose.startSession()
  const result: InstanceType<typeof Tournament>[] = []

  try {
    await session.withTransaction(async () => {
      const tournament = await Tournament.findById(tournamentId).session(session)

      if (!tournament) throw new Error('No se ha encontrado el torneo.')
      if (tournament.status !== 'open') {
        throw new Error('Ya no se pueden retirar equipos de este torneo.')
      }

      const teamIndex = tournament.teams.findIndex(team =>
        team.members.some(
          member => member.discordId === leaderDiscordId &&
            member.role === 'leader'
        )
      )

      if (teamIndex === -1) {
        throw new Error('No tienes un equipo inscrito en este torneo como líder.')
      }

      tournament.teams.splice(teamIndex, 1)

      await tournament.save({ session })
      result.push(tournament)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function updateTournamentStatus(
  tournamentId: string,
  status: TournamentStatus
) {
  const allowedTransitions: Record<TournamentStatus, TournamentStatus[]> = {
    open: ['started', 'cancelled'],
    started: ['finished', 'cancelled'],
    finished: [],
    cancelled: []
  }

  const tournament = await Tournament.findById(tournamentId)

  if (!tournament) {
    throw new Error('No se ha encontrado el torneo.')
  }

  if (!allowedTransitions[tournament.status].includes(status)) {
    throw new Error(
      `No se puede cambiar el estado de ${tournament.status} a ${status}.`
    )
  }

  tournament.status = status

  await tournament.save()

  return tournament
}

export async function deleteTournament(tournamentId: string) {
  const tournament = await Tournament.findById(tournamentId)

  if (!tournament) {
    throw new Error('No se ha encontrado el torneo.')
  }

  if (tournament.status === 'started') {
    throw new Error('No se puede eliminar un torneo que ya ha comenzado.')
  }

  await tournament.deleteOne()

  return tournament
}
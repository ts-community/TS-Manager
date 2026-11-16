import mongoose from 'mongoose'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Guild
} from 'discord.js'

import Tournament, { type TournamentDocument } from '@/models/Tournament'
import Team, { type TeamDocument } from '@/models/Team'
import User from '@/models/User'
import type {
  TournamentMode,
  TournamentPlayer,
  TournamentStatus,
  TournamentTeam
} from '@/types/tournament'
import { isBlacklisted } from '@/services/blacklist'
import logger from '@/utils/logger'
import { formatSpainDateTime } from '@/utils/datetime'

export const MAX_TEAMS_OPTIONS = [8, 12, 16, 24, 32]
export const MAX_PLAYERS_OPTIONS = MAX_TEAMS_OPTIONS

export const TOURNAMENT_COLOR = 0xf59e0b
export const TEAM_COLOR = 0x3b82f6

export const TEAM_ROLE_EMOJI = {
  leader: '👑',
  member: '⚔️',
  substitute: '🔄'
} as const

export interface TournamentV2Payload {
  flags: number
  components: ContainerBuilder[]
}

const ROLE_LABEL = {
  leader: 'Líder',
  member: 'Titular',
  substitute: 'Suplente'
} as const

function separator(): SeparatorBuilder {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small)
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

export function buildInscriptionsPanel(
  tournament: TournamentDocument | null
): TournamentV2Payload {
  const container = new ContainerBuilder().setAccentColor(TOURNAMENT_COLOR)

  const isSolo = tournament?.mode === 'solo'

  container.addTextDisplayComponents(
    text(
      tournament
        ? `## 🏆 ${tournament.name}\n-# Inscripciones · ${isSolo ? 'Jugadores' : 'Por equipos'}`
        : '## 🏆 Inscripciones\n-# Torneos de la comunidad'
    )
  )
  container.addSeparatorComponents(separator())

  if (tournament) {
    const timestamp = Math.floor(tournament.startTime.getTime() / 1000)
    const count = isSolo
      ? `${tournament.players.length}/${tournament.maxPlayers}`
      : `${tournament.teams.length}/${tournament.maxTeams}`

    container.addTextDisplayComponents(
      text([
        `📅 **Inicio:** ${formatSpainDateTime(tournament.startTime)} (<t:${timestamp}:R>)`,
        `${isSolo ? '👤' : '👥'} **${isSolo ? 'Jugadores' : 'Equipos'}:** **${count}**`
      ].join('\n'))
    )
    container.addSeparatorComponents(separator())
    container.addTextDisplayComponents(
      text(
        isSolo
          ? 'Pulsa **Inscribirme** para participar. No necesitas equipo.'
          : 'Crea tu equipo o inscríbete con el equipo que ya tienes.'
      )
    )
  } else {
    container.addTextDisplayComponents(
      text([
        'No hay ningún torneo abierto ahora mismo.',
        '',
        '-# Cuando se abra uno, aparecerá aquí con toda la información.'
      ].join('\n'))
    )
  }

  if (tournament) {
    container.addSeparatorComponents(separator())

    if (isSolo) {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('torneo:inscribirse')
            .setLabel('Inscribirme')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('torneo:retirarse')
            .setLabel('Retirarme')
            .setEmoji('🚪')
            .setStyle(ButtonStyle.Danger)
        )
      )
    } else {
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('torneo:inscribirse')
            .setLabel('Inscribirse')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('torneo:crear-equipo')
            .setLabel('Crear equipo')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('torneo:ver-equipo')
            .setLabel('Ver equipo')
            .setEmoji('👀')
            .setStyle(ButtonStyle.Secondary)
        )
      )
    }
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  }
}

export async function buildTeamView(
  team: TeamDocument,
  viewerId: string,
  guildId: string
): Promise<TournamentV2Payload> {
  const users = await User.find({
    _id: { $in: team.members.map(member => member.userId) }
  })

  const userMap = new Map(users.map(user => [user._id.toString(), user]))
  const viewer = users.find(user => user.discordId === viewerId)
  const isLeader = Boolean(
    viewer &&
    team.members.some(
      member => member.userId.equals(viewer._id) && member.role === 'leader'
    )
  )

  const activeMembers = team.members.filter(
    member => member.role !== 'substitute'
  ).length
  const substituteCount = team.members.length - activeMembers
  const activeTournament = await getActiveTournament()
  const isRegistered = Boolean(
    activeTournament?.teams.some(entry => entry.teamId.equals(team._id))
  )

  const memberLines = team.members.map(member => {
    const user = userMap.get(member.userId.toString())
    const mention = user ? `<@${user.discordId}>` : 'Usuario desconocido'
    const tag = user?.brawlId ? ` · \`#${user.brawlId}\`` : ''
    return `${TEAM_ROLE_EMOJI[member.role]} ${mention} · ${ROLE_LABEL[member.role]}${tag}`
  })

  const alerts: string[] = []

  if (activeMembers < 3) {
    alerts.push('⚠️ Tu equipo debe tener al menos 3 titulares para poder inscribirse.')
  }

  for (const member of team.members) {
    const user = userMap.get(member.userId.toString())

    if (!user) {
      alerts.push('⚠️ Uno de los integrantes ya no existe en la base de datos.')
      continue
    }

    if (await isBlacklisted(user.discordId, 'tournaments')) {
      alerts.push(`⚠️ <@${user.discordId}> está en la blacklist de torneos.`)
    }
  }

  const container = new ContainerBuilder().setAccentColor(TEAM_COLOR)

  container.addTextDisplayComponents(
    text([
      `## 🛡️ ${team.name}`,
      `-# ${team.members.length}/5 miembros · ${activeMembers}/3 titulares · ${substituteCount}/2 suplentes`,
      activeTournament
        ? activeTournament.mode === 'solo'
          ? '-# El torneo activo es individual y no admite equipos.'
          : isRegistered
            ? `-# ✅ Inscrito en **${activeTournament.name}**`
            : `-# 📝 Aún no inscrito en **${activeTournament.name}**`
        : '-# No hay ningún torneo abierto ahora mismo.'
    ].join('\n'))
  )
  container.addSeparatorComponents(separator())
  container.addTextDisplayComponents(
    text([
      '**Integrantes**',
      memberLines.length ? memberLines.join('\n') : '-# El equipo no tiene integrantes.'
    ].join('\n'))
  )
  if (alerts.length) {
    container.addSeparatorComponents(separator())
    container.addTextDisplayComponents(
      text(alerts.map(alert => `-# ${alert}`).join('\n'))
    )
  }

  if (isLeader) {
    const managementButtons: ButtonBuilder[] = []

    if (team.members.length > 1) {
      managementButtons.push(
        new ButtonBuilder()
          .setCustomId(`torneo:remove:${team._id}`)
          .setLabel('Expulsar miembro')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`torneo:role:${team._id}`)
          .setLabel('Cambiar rol')
          .setEmoji('🔁')
          .setStyle(ButtonStyle.Secondary)
      )
    }

    managementButtons.push(
      new ButtonBuilder()
        .setCustomId(`torneo:disband:${team._id}`)
        .setLabel('Disolver equipo')
        .setEmoji('💥')
        .setStyle(ButtonStyle.Danger)
    )

    container.addSeparatorComponents(separator())
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`torneo:add:titular:${team._id}`)
          .setLabel('Añadir titular')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`torneo:add:suplente:${team._id}`)
          .setLabel('Añadir suplente')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`torneo:rename:${team._id}`)
          .setLabel('Cambiar nombre')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Secondary)
      )
    )
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(...managementButtons)
    )
  } else {
    container.addTextDisplayComponents(
      text('-# Puedes salir del equipo cuando quieras.')
    )
    container.addSeparatorComponents(separator())
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`torneo:leave:${team._id}`)
          .setLabel('Salir del equipo')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Danger)
      )
    )
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  }
}

export async function createTournament(
  name: string,
  startTime: Date,
  mode: TournamentMode,
  limit: number
) {
  if (!name.trim()) throw new Error('El torneo debe tener un nombre.')
  if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
    throw new Error('La fecha de inicio debe ser futura.')
  }
  if (mode !== 'teams' && mode !== 'solo') {
    throw new Error('La modalidad del torneo no es válida.')
  }
  if (!MAX_TEAMS_OPTIONS.includes(limit)) {
    throw new Error(
      mode === 'solo'
        ? 'El máximo de jugadores debe ser 8, 12, 16, 24 o 32.'
        : 'El máximo de equipos debe ser 8, 12, 16, 24 o 32.'
    )
  }

  return Tournament.create({
    name: name.trim(),
    startTime,
    mode,
    maxTeams: mode === 'teams' ? limit : 0,
    maxPlayers: mode === 'solo' ? limit : 0,
    status: 'open',
    teams: [],
    players: []
  })
}

export async function getTournament(tournamentId: string) {
  return Tournament.findById(tournamentId)
}

export async function getTournaments(includeCancelled = false) {
  const filter = includeCancelled ? {} : { status: { $ne: 'cancelled' } }
  return Tournament.find(filter).sort({ startTime: -1 })
}

export async function getActiveTournament() {
  return Tournament.findOne({
    status: 'open',
    startTime: { $gt: new Date() }
  }).sort({ startTime: 1 })
}

export async function getCurrentTournament() {
  const openTournament = await getActiveTournament()
  if (openTournament) return openTournament

  return Tournament.findOne({ status: 'started' }).sort({ startTime: -1 })
}

export async function getTournamentByName(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase()
  if (!normalizedName) throw new Error('Indica el nombre del torneo.')

  const tournaments = await Tournament.find()
  const matches = tournaments.filter(
    tournament => tournament.name.trim().toLocaleLowerCase() === normalizedName
  )

  if (!matches.length) throw new Error(`No se ha encontrado el torneo "${name}".`)
  if (matches.length > 1) {
    throw new Error('Hay varios torneos con ese nombre. Usa un nombre más específico.')
  }

  return matches[0]
}

export async function cancelTournament(
  guild: Guild,
  tournamentName?: string | null
): Promise<{ tournament: TournamentDocument; eventDeleted: boolean; eventFound: boolean }> {
  const tournament = tournamentName?.trim()
    ? await getTournamentByName(tournamentName)
    : await getCurrentTournament()

  if (!tournament) throw new Error('No hay ningún torneo activo para cancelar.')

  if (tournament.status !== 'open' && tournament.status !== 'started') {
    throw new Error('Solo se pueden cancelar torneos abiertos o en curso.')
  }

  tournament.status = 'cancelled'
  await tournament.save()

  const eventName = `Torneo: ${tournament.name}`.slice(0, 100)

  try {
    await guild.scheduledEvents.fetch()
    const event = guild.scheduledEvents.cache.find(item => item.name === eventName)

    if (!event) {
      return { tournament, eventDeleted: false, eventFound: false }
    }

    await event.delete()
    return { tournament, eventDeleted: true, eventFound: true }
  } catch (error) {
    logger.warn(`No se pudo eliminar el evento del torneo ${tournament.name}`, {
      reason: error instanceof Error ? error.message : 'Unknown error'
    })
    return { tournament, eventDeleted: false, eventFound: true }
  }
}

export async function registerTeam(
  tournamentId: string,
  teamId: string,
  leaderDiscordId: string
) {
  const session = await mongoose.startSession()
  const result: TournamentDocument[] = []

  try {
    await session.withTransaction(async () => {
      const tournament = await Tournament.findById(tournamentId).session(session)

      if (!tournament) throw new Error('No se ha encontrado el torneo.')
      if (tournament.mode === 'solo') {
        throw new Error('Este torneo es individual y no admite equipos.')
      }
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

      if (tournament.teams.some(item => item.teamId.equals(team._id))) {
        throw new Error('Este equipo ya está inscrito.')
      }

      const leader = await User.findOne({ discordId: leaderDiscordId }).session(session)

      if (!leader || !team.members.some(
        member => member.userId.equals(leader._id) && member.role === 'leader'
      )) {
        throw new Error('Solo el líder puede inscribir al equipo.')
      }

      const activeMembers = team.members.filter(member => member.role !== 'substitute')
      if (activeMembers.length < 3) {
        throw new Error('El equipo necesita al menos 3 titulares.')
      }

      const users = await User.find({
        _id: { $in: team.members.map(member => member.userId) }
      }).session(session)

      if (users.length !== team.members.length) {
        throw new Error('No se han encontrado todos los integrantes.')
      }

      const userMap = new Map(users.map(user => [user._id.toString(), user]))
      const members: TournamentTeam['members'] = []

      for (const member of team.members) {
        const user = userMap.get(member.userId.toString())
        if (!user) throw new Error('No se ha encontrado un integrante del equipo.')

        if (!user.teamId?.equals(team._id)) {
          throw new Error('La pertenencia al equipo no es válida.')
        }
        if (await isBlacklisted(user.discordId, 'tournaments', session)) {
          throw new Error(`El usuario ${user.discordId} está en la blacklist de torneos.`)
        }

        members.push({
          userId: user._id,
          discordId: user.discordId,
          brawlId: user.brawlId ?? '',
          role: member.role
        })
      }

      const registeredUsers = new Set(
        tournament.teams.flatMap(item =>
          item.members.map(member => member.userId.toString())
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
  const result: TournamentDocument[] = []

  try {
    await session.withTransaction(async () => {
      const tournament = await Tournament.findById(tournamentId).session(session)

      if (!tournament) throw new Error('No se ha encontrado el torneo.')
      if (tournament.mode === 'solo') {
        throw new Error('Este torneo es individual y no admite equipos.')
      }
      if (tournament.status !== 'open') {
        throw new Error('Ya no se pueden retirar equipos de este torneo.')
      }

      const teamIndex = tournament.teams.findIndex(team =>
        team.members.some(
          member => member.discordId === leaderDiscordId && member.role === 'leader'
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

export async function registerSoloPlayer(
  tournamentId: string,
  discordId: string
) {
  const session = await mongoose.startSession()
  const result: TournamentDocument[] = []

  try {
    await session.withTransaction(async () => {
      const tournament = await Tournament.findById(tournamentId).session(session)

      if (!tournament) throw new Error('No se ha encontrado el torneo.')
      if (tournament.mode !== 'solo') {
        throw new Error('Este torneo es por equipos y no admite inscripciones individuales.')
      }
      if (tournament.status !== 'open') {
        throw new Error('El torneo no está aceptando inscripciones.')
      }
      if (tournament.startTime <= new Date()) {
        throw new Error('El torneo ya ha comenzado.')
      }
      if (tournament.players.length >= tournament.maxPlayers) {
        throw new Error('El torneo está completo.')
      }

      const user = await User.findOneAndUpdate(
        { discordId },
        { $setOnInsert: { discordId, teamId: null } },
        { upsert: true, new: true, runValidators: true, session }
      )

      if (!user) throw new Error('No se ha encontrado tu cuenta.')
      if (await isBlacklisted(discordId, 'tournaments', session)) {
        throw new Error('Estás en la blacklist de torneos.')
      }

      const alreadyRegistered = tournament.players.some(
        player => player.userId.equals(user._id)
      ) || tournament.teams.some(team =>
        team.members.some(member => member.userId.equals(user._id))
      )

      if (alreadyRegistered) {
        throw new Error('Ya estás inscrito en este torneo.')
      }

      const player: TournamentPlayer = {
        userId: user._id,
        discordId: user.discordId,
        brawlId: user.brawlId ?? '',
        registeredAt: new Date()
      }

      tournament.players.push(player)
      await tournament.save({ session })
      result.push(tournament)
    })

    return result[0]
  } finally {
    await session.endSession()
  }
}

export async function unregisterSoloPlayer(
  tournamentId: string,
  discordId: string
) {
  const session = await mongoose.startSession()
  const result: TournamentDocument[] = []

  try {
    await session.withTransaction(async () => {
      const tournament = await Tournament.findById(tournamentId).session(session)

      if (!tournament) throw new Error('No se ha encontrado el torneo.')
      if (tournament.mode !== 'solo') {
        throw new Error('Este torneo es por equipos y no admite retiradas individuales.')
      }
      if (tournament.status !== 'open') {
        throw new Error('Ya no puedes retirarte de este torneo.')
      }

      const playerIndex = tournament.players.findIndex(
        player => player.discordId === discordId
      )

      if (playerIndex === -1) {
        throw new Error('No estás inscrito en este torneo.')
      }

      tournament.players.splice(playerIndex, 1)
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
  if (!tournament) throw new Error('No se ha encontrado el torneo.')

  if (!allowedTransitions[tournament.status].includes(status)) {
    throw new Error(`No se puede cambiar el estado de ${tournament.status} a ${status}.`)
  }

  tournament.status = status
  await tournament.save()
  return tournament
}

export async function deleteTournament(tournamentId: string) {
  const tournament = await Tournament.findById(tournamentId)
  if (!tournament) throw new Error('No se ha encontrado el torneo.')
  if (tournament.status === 'started') {
    throw new Error('No se puede eliminar un torneo que ya ha comenzado.')
  }

  await tournament.deleteOne()
  return tournament
}

export async function updateTournament(
  tournamentId: string,
  updates: { startTime?: Date; maxTeams?: number; maxPlayers?: number }
) {
  const tournament = await Tournament.findById(tournamentId)
  if (!tournament) throw new Error('No se ha encontrado el torneo.')
  if (tournament.status !== 'open') {
    throw new Error('Solo se pueden editar torneos abiertos.')
  }

  if (updates.startTime) {
    if (Number.isNaN(updates.startTime.getTime()) || updates.startTime <= new Date()) {
      throw new Error('La fecha de inicio debe ser futura.')
    }
    tournament.startTime = updates.startTime
  }

  if (updates.maxTeams !== undefined && updates.maxPlayers !== undefined) {
    throw new Error('Indica solo el límite correspondiente a la modalidad del torneo.')
  }

  if (updates.maxTeams !== undefined) {
    if (tournament.mode === 'solo') {
      throw new Error('Este torneo es individual: usa el máximo de jugadores, no de equipos.')
    }
    if (!MAX_TEAMS_OPTIONS.includes(updates.maxTeams)) {
      throw new Error('El máximo de equipos debe ser 8, 12, 16, 24 o 32.')
    }
    if (updates.maxTeams < tournament.teams.length) {
      throw new Error(
        `No puedes reducir el máximo por debajo de los ${tournament.teams.length} equipos ya inscritos.`
      )
    }
    tournament.maxTeams = updates.maxTeams
  }

  if (updates.maxPlayers !== undefined) {
    if (tournament.mode !== 'solo') {
      throw new Error('Este torneo es por equipos: usa el máximo de equipos, no de jugadores.')
    }
    if (!MAX_PLAYERS_OPTIONS.includes(updates.maxPlayers)) {
      throw new Error('El máximo de jugadores debe ser 8, 12, 16, 24 o 32.')
    }
    if (updates.maxPlayers < tournament.players.length) {
      throw new Error(
        `No puedes reducir el máximo por debajo de los ${tournament.players.length} jugadores ya inscritos.`
      )
    }
    tournament.maxPlayers = updates.maxPlayers
  }

  await tournament.save()
  return tournament
}

export async function syncTournamentEvent(
  guild: Guild,
  tournament: TournamentDocument,
  durationHours?: number,
  createIfMissing = true
): Promise<string | null> {
  if (tournament.startTime.getTime() <= Date.now()) return null

  const name = `Torneo: ${tournament.name}`.slice(0, 100)
  const defaultDurationMs = 2 * 60 * 60 * 1000
  const durationMs = durationHours != null ? durationHours * 60 * 60 * 1000 : defaultDurationMs

  try {
    await guild.scheduledEvents.fetch()
    const existing = guild.scheduledEvents.cache.find(event => event.name === name)

    if (existing) {
      const currentDuration = existing.scheduledStartAt && existing.scheduledEndAt
        ? existing.scheduledEndAt.getTime() - existing.scheduledStartAt.getTime()
        : 0
      const effectiveDuration = durationHours != null
        ? durationMs
        : currentDuration > 0
          ? currentDuration
          : defaultDurationMs

      await existing.edit({
        name,
        scheduledStartTime: tournament.startTime,
        scheduledEndTime: new Date(tournament.startTime.getTime() + effectiveDuration)
      })
      return existing.id
    }

    if (!createIfMissing) return null

    const event = await guild.scheduledEvents.create({
      name,
      scheduledStartTime: tournament.startTime,
      scheduledEndTime: new Date(tournament.startTime.getTime() + durationMs),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: 'Discord' },
      description: `Inscripciones y detalles del torneo ${tournament.name}.`
    })

    return event.id
  } catch (error) {
    logger.warn(
      `No se pudo sincronizar el evento del torneo ${tournament.name}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
    return null
  }
}

export async function removeUserFromTournamentSystem(
  discordId: string
): Promise<{ teamRemoved: boolean; soloRemoved: boolean }> {
  const user = await User.findOne({ discordId })
  if (!user) return { teamRemoved: false, soloRemoved: false }

  const session = await mongoose.startSession()
  let teamRemoved = false
  let soloRemoved = false

  try {
    await session.withTransaction(async () => {
      const soloResult = await Tournament.updateMany(
        { status: 'open', 'players.userId': user._id },
        { $pull: { players: { userId: user._id } } },
        { session }
      )

      soloRemoved = soloResult.modifiedCount > 0

      if (!user.teamId) return

      const team = await Team.findById(user.teamId).session(session)

      if (!team) {
        user.teamId = null
        await user.save({ session })
        return
      }

      const isLeader = team.members.some(
        member => member.userId.equals(user._id) && member.role === 'leader'
      )

      if (isLeader) {
        await Tournament.updateMany(
          { status: 'open', 'teams.teamId': team._id },
          { $pull: { teams: { teamId: team._id } } },
          { session }
        )
        await User.updateMany(
          { teamId: team._id },
          { $set: { teamId: null } },
          { session }
        )
        await Team.deleteOne({ _id: team._id }, { session })
        teamRemoved = true
        return
      }

      team.members = team.members.filter(
        member => !member.userId.equals(user._id)
      )
      user.teamId = null

      await team.save({ session })
      await user.save({ session })

      const activeMembers = team.members.filter(
        member => member.role !== 'substitute'
      ).length

      if (activeMembers < 3) {
        await Tournament.updateMany(
          { status: 'open', 'teams.teamId': team._id },
          { $pull: { teams: { teamId: team._id } } },
          { session }
        )
        return
      }

      const users = await User.find({
        _id: { $in: team.members.map(member => member.userId) }
      }).session(session)

      const userMap = new Map(
        users.map(item => [item._id.toString(), item])
      )

      const members = team.members.map(member => {
        const record = userMap.get(member.userId.toString())
        return {
          userId: member.userId,
          discordId: record?.discordId ?? '',
          brawlId: record?.brawlId ?? '',
          role: member.role
        }
      })

      await Tournament.updateMany(
        { status: 'open', 'teams.teamId': team._id },
        {
          $set: {
            'teams.$.name': team.name,
            'teams.$.members': members
          }
        },
        { session }
      )
    })
  } finally {
    await session.endSession()
  }

  return { teamRemoved, soloRemoved }
}

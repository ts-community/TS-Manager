import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  type TextChannel
} from 'discord.js'

import type { SlashCommand } from '../../../types/commands'
import type { TournamentMode } from '@/types/tournament'
import {
  MAX_PLAYERS_OPTIONS,
  MAX_TEAMS_OPTIONS,
  cancelTournament,
  createTournament,
  getActiveTournament,
  getTournaments,
  syncTournamentEvent,
  updateTournament
} from '@/services/tournament'
import {
  configureTournamentPanel,
  scheduleTournamentPanelSync,
  syncInscriptionPanel,
  syncTournamentPanel
} from '@/services/tournamentPanel'
import logger from '@/utils/logger'
import {
  formatSpainDate,
  formatSpainDateTime,
  getSpainParts,
  spainDateToUtc
} from '@/utils/datetime'

const MAX_TEAMS_CHOICES = MAX_TEAMS_OPTIONS.map(value => ({
  name: `${value} equipos`,
  value
}))

const MAX_PLAYERS_CHOICES = MAX_PLAYERS_OPTIONS.map(value => ({
  name: `${value} jugadores`,
  value
}))

const MODE_CHOICES = [
  { name: 'Por equipos (por defecto)', value: 'teams' },
  { name: 'Individual (jugadores)', value: 'solo' }
]

function resolveTournamentMode(value: string | null): TournamentMode {
  if (value == null || value === 'teams') return 'teams'
  if (value === 'solo') return 'solo'
  throw new Error('La modalidad del torneo no es válida.')
}

function resolveTournamentLimit(
  mode: TournamentMode,
  maxTeams: number | null,
  maxPlayers: number | null
): number {
  if (mode === 'teams') {
    if (maxPlayers != null) {
      throw new Error('El máximo de jugadores solo se usa en torneos individuales.')
    }
    if (maxTeams == null) {
      throw new Error('Indica el máximo de equipos para un torneo por equipos.')
    }
    return maxTeams
  }

  if (maxTeams != null) {
    throw new Error('El máximo de equipos solo se usa en torneos por equipos.')
  }
  if (maxPlayers == null) {
    throw new Error('Indica el máximo de jugadores para un torneo individual.')
  }
  return maxPlayers
}

const CURRENT_YEAR = getSpainParts(new Date()).year

const MONTH_CHOICES = [
  { name: 'Enero', value: 1 },
  { name: 'Febrero', value: 2 },
  { name: 'Marzo', value: 3 },
  { name: 'Abril', value: 4 },
  { name: 'Mayo', value: 5 },
  { name: 'Junio', value: 6 },
  { name: 'Julio', value: 7 },
  { name: 'Agosto', value: 8 },
  { name: 'Septiembre', value: 9 },
  { name: 'Octubre', value: 10 },
  { name: 'Noviembre', value: 11 },
  { name: 'Diciembre', value: 12 }
]

const MINUTE_CHOICES = [0, 15, 30, 45].map(minute => ({
  name: `:${pad(minute)}`,
  value: minute
}))

const HOUR_CHOICES = Array.from({ length: 24 }, (_, hour) => ({
  name: `${pad(hour)}:00`,
  value: hour
}))

const DURATION_CHOICES = [1, 2, 3, 4, 6, 8, 12].map(hours => ({
  name: `${hours} hora${hours === 1 ? '' : 's'}`,
  value: hours
}))

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function buildStartTime(day: number, month: number, year: number, hours: number, minutes: number): Date {
  if (![day, month, year, hours, minutes].every(Number.isInteger)) {
    throw new Error('La fecha y la hora indicadas no son válidas.')
  }

  if (day < 1 || day > 31) throw new Error('El día debe estar entre 1 y 31.')
  if (month < 1 || month > 12) throw new Error('El mes debe estar entre 1 y 12.')
  if (year < CURRENT_YEAR) throw new Error(`El año debe ser ${CURRENT_YEAR} o posterior.`)
  if (hours < 0 || hours > 23) throw new Error('La hora debe estar entre 0 y 23.')
  if (minutes < 0 || minutes > 59) throw new Error('Los minutos deben estar entre 0 y 59.')

  const startTime = spainDateToUtc(year, month, day, hours, minutes)
  const parts = getSpainParts(startTime)

  if (
    Number.isNaN(startTime.getTime()) ||
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hours ||
    parts.minute !== minutes
  ) {
    throw new Error('La fecha indicada no existe.')
  }

  return startTime
}

function tournamentEmbed(
  tournament: {
    name: string
    startTime: Date
    mode: TournamentMode
    maxTeams: number
    maxPlayers: number
    teams: unknown[]
    players: unknown[]
  },
  eventId: string | null,
  durationHours: number
): EmbedBuilder {
  const timestamp = Math.floor(tournament.startTime.getTime() / 1000)
  const isSolo = tournament.mode === 'solo'
  const embed = new EmbedBuilder()
    .setColor('Green')
    .setTitle('🏆 Torneo creado')
    .setDescription(`**${tournament.name}**`)
    .addFields(
      {
        name: '🎮 Modalidad',
        value: isSolo ? '**Individual**' : '**Por equipos**',
        inline: true
      },
      { name: '📅 Inicio', value: `<t:${timestamp}:F>\n<t:${timestamp}:R>`, inline: true },
      {
        name: isSolo ? '👤 Jugadores' : '👥 Equipos',
        value: isSolo
          ? `**${tournament.players.length}/${tournament.maxPlayers}**`
          : `**${tournament.teams.length}/${tournament.maxTeams}**`,
        inline: true
      },
      { name: '⏱️ Duración', value: `**${durationHours} h**`, inline: true },
      {
        name: '📣 Evento de Discord',
        value: eventId ? 'Creado correctamente.' : 'No se ha creado ningún evento.',
        inline: false
      }
    )
    .setTimestamp()

  return embed
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '🟢 Abierto',
    started: '🔵 En curso',
    finished: '🏁 Finalizado',
    cancelled: '🔴 Cancelado'
  }

  return labels[status] ?? status
}

function buildTournamentListEmbed(
  tournaments: Awaited<ReturnType<typeof getTournaments>>
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('📋 Historial de torneos')
    .setTimestamp()

  if (!tournaments.length) {
    return embed.setDescription('Todavía no se ha creado ningún torneo.')
  }

  const lines = tournaments.slice(0, 15).map(tournament => {
    if (tournament.mode === 'solo') {
      return [
        `**${tournament.name}** · ${statusLabel(tournament.status)}`,
        `> ${formatSpainDate(tournament.startTime)} · Jugadores: **${tournament.players.length}/${tournament.maxPlayers}**`,
        '> Inscripción individual'
      ].join('\n')
    }

    const teamCount = tournament.teams.length
    const playerCount = tournament.teams.reduce(
      (total, team) => total + team.members.length,
      0
    )
    const starters = tournament.teams.reduce(
      (total, team) =>
        total + team.members.filter(member => member.role !== 'substitute').length,
      0
    )
    const substitutes = playerCount - starters

    return [
      `**${tournament.name}** · ${statusLabel(tournament.status)}`,
      `> ${formatSpainDate(tournament.startTime)} · Equipos: **${teamCount}/${tournament.maxTeams}**`,
      `> Jugadores: **${playerCount}** (${starters} titulares, ${substitutes} suplentes)`
    ].join('\n')
  })

  embed.setDescription(lines.join('\n\n'))

  if (tournaments.length > 15) {
    embed.setFooter({
      text: `Mostrando 15 de ${tournaments.length} torneos.`
    })
  } else {
    embed.setFooter({ text: `Total: ${tournaments.length} torneos.` })
  }

  return embed
}

export default {
  data: new SlashCommandBuilder()
    .setName('torneos')
    .setDescription('Crea y gestiona torneos')

    .addSubcommand(subcommand =>
      subcommand
        .setName('crear')
        .setDescription('Crea un nuevo torneo')
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nombre del torneo')
            .setRequired(true)
            .setMaxLength(64)
        )
        .addIntegerOption(option =>
          option
            .setName('dia')
            .setDescription('Día del mes (1-31)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(31)
        )
        .addIntegerOption(option =>
          option
            .setName('mes')
            .setDescription('Mes de inicio')
            .setRequired(true)
            .addChoices(...MONTH_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('ano')
            .setDescription('Año de inicio')
            .setRequired(true)
            .setMinValue(CURRENT_YEAR)
            .setMaxValue(CURRENT_YEAR + 5)
        )
        .addIntegerOption(option =>
          option
            .setName('hora')
            .setDescription('Hora de inicio (24h, España)')
            .setRequired(true)
            .addChoices(...HOUR_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('minuto')
            .setDescription('Minutos de inicio')
            .setRequired(true)
            .addChoices(...MINUTE_CHOICES)
        )
        .addStringOption(option =>
          option
            .setName('modalidad')
            .setDescription('Formato del torneo (por defecto, por equipos)')
            .addChoices(...MODE_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('max_equipos')
            .setDescription('Número máximo de equipos (solo modalidad por equipos)')
            .addChoices(...MAX_TEAMS_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('max_jugadores')
            .setDescription('Número máximo de jugadores (solo modalidad individual)')
            .addChoices(...MAX_PLAYERS_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('duracion_horas')
            .setDescription('Duración del evento')
            .setRequired(true)
            .addChoices(...DURATION_CHOICES)
        )
        .addBooleanOption(option =>
          option
            .setName('evento')
            .setDescription('Crear un evento programado en Discord (por defecto sí)')
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('actualizar')
        .setDescription('Actualiza el torneo abierto')
        .addIntegerOption(option =>
          option
            .setName('dia')
            .setDescription('Nuevo día del mes (1-31)')
            .setMinValue(1)
            .setMaxValue(31)
        )
        .addIntegerOption(option =>
          option
            .setName('mes')
            .setDescription('Nuevo mes de inicio')
            .addChoices(...MONTH_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('ano')
            .setDescription('Nuevo año de inicio')
            .setMinValue(CURRENT_YEAR)
            .setMaxValue(CURRENT_YEAR + 5)
        )
        .addIntegerOption(option =>
          option
            .setName('hora')
            .setDescription('Nueva hora de inicio (24h, España)')
            .addChoices(...HOUR_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('minuto')
            .setDescription('Nuevos minutos de inicio')
            .addChoices(...MINUTE_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('max_equipos')
            .setDescription('Nuevo máximo de equipos (solo torneos por equipos)')
            .addChoices(...MAX_TEAMS_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('max_jugadores')
            .setDescription('Nuevo máximo de jugadores (solo torneos individuales)')
            .addChoices(...MAX_PLAYERS_CHOICES)
        )
        .addIntegerOption(option =>
          option
            .setName('duracion_horas')
            .setDescription('Nueva duración del evento')
            .addChoices(...DURATION_CHOICES)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('configurar')
        .setDescription('Configura los canales y paneles de torneos')
        .addChannelOption(option =>
          option
            .setName('canal_inscripciones')
            .setDescription('Canal del panel para inscribirse')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addChannelOption(option =>
          option
            .setName('canal_inscritos')
            .setDescription('Canal de inscritos (cambia de nombre según el torneo activo)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addBooleanOption(option =>
          option
            .setName('actualizar')
            .setDescription('Actualiza ahora los paneles ya configurados')
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('cancelar')
        .setDescription('Cancela el torneo activo o uno concreto')
        .addStringOption(option =>
          option
            .setName('nombre')
            .setDescription('Nombre exacto del torneo (por defecto, el activo)')
            .setMaxLength(64)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('lista')
        .setDescription('Muestra el historial y las estadísticas de los torneos')
        .addBooleanOption(option =>
          option
            .setName('mostrar_cancelados')
            .setDescription('Incluir también los torneos cancelados')
        )
    ),

  async execute(interaction) {
    const guild = interaction.guild

    if (!guild) {
      await interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.'
      })
      return
    }

    const subcommand = interaction.options.getSubcommand(true)

    if (subcommand === 'crear') {
      const name = interaction.options.getString('nombre', true)
      const day = interaction.options.getInteger('dia', true)
      const month = interaction.options.getInteger('mes', true)
      const year = interaction.options.getInteger('ano', true)
      const hours = interaction.options.getInteger('hora', true)
      const minutes = interaction.options.getInteger('minuto', true)
      const mode = resolveTournamentMode(interaction.options.getString('modalidad'))
      const maxTeams = interaction.options.getInteger('max_equipos')
      const maxPlayers = interaction.options.getInteger('max_jugadores')
      const durationHours = interaction.options.getInteger('duracion_horas', true)
      const withEvent = interaction.options.getBoolean('evento') ?? true

      await interaction.deferReply()

      try {
        const limit = resolveTournamentLimit(mode, maxTeams, maxPlayers)
        const active = await getActiveTournament()

        if (active) {
          await interaction.editReply({
            content: `Ya hay un torneo abierto: **${active.name}**. Actualízalo o espera a que termine.`
          })
          return
        }

        const startTime = buildStartTime(day, month, year, hours, minutes)
        const tournament = await createTournament(name, startTime, mode, limit)
        const eventId = withEvent
          ? await syncTournamentEvent(guild, tournament, durationHours)
          : null

        await interaction.editReply({
          embeds: [tournamentEmbed(tournament, eventId, durationHours)]
        })
        scheduleTournamentPanelSync(interaction.client)
      } catch (error) {
        logger.error('No se pudo crear el torneo', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo crear el torneo.'}`
        })
      }

      return
    }

    if (subcommand === 'actualizar') {
      const day = interaction.options.getInteger('dia')
      const month = interaction.options.getInteger('mes')
      const year = interaction.options.getInteger('ano')
      const hours = interaction.options.getInteger('hora')
      const minutes = interaction.options.getInteger('minuto')
      const maxTeams = interaction.options.getInteger('max_equipos')
      const maxPlayers = interaction.options.getInteger('max_jugadores')
      const durationHours = interaction.options.getInteger('duracion_horas')

      await interaction.deferReply()

      try {
        const tournament = await getActiveTournament()

        if (!tournament) {
          await interaction.editReply({
            content: 'No hay ningún torneo abierto para actualizar.'
          })
          return
        }

        if (maxTeams != null && maxPlayers != null) {
          await interaction.editReply({
            content: 'Indica solo el límite correspondiente a la modalidad del torneo.'
          })
          return
        }

        if (maxTeams != null && tournament.mode === 'solo') {
          await interaction.editReply({
            content: 'Este torneo es individual: usa **max_jugadores**, no **max_equipos**.'
          })
          return
        }

        if (maxPlayers != null && tournament.mode !== 'solo') {
          await interaction.editReply({
            content: 'Este torneo es por equipos: usa **max_equipos**, no **max_jugadores**.'
          })
          return
        }

        const dateParts = [day, month, year]
        const timeParts = [hours, minutes]

        if (dateParts.some(value => value != null) && dateParts.some(value => value == null)) {
          await interaction.editReply({
            content: 'Para cambiar la fecha debes indicar **día**, **mes** y **año**.'
          })
          return
        }

        if (timeParts.some(value => value != null) && timeParts.some(value => value == null)) {
          await interaction.editReply({
            content: 'Para cambiar la hora debes indicar **hora** y **minuto**.'
          })
          return
        }

        if (
          dateParts.every(value => value == null) &&
          timeParts.every(value => value == null) &&
          maxTeams == null &&
          maxPlayers == null &&
          durationHours == null
        ) {
          await interaction.editReply({
            content: 'Indica al menos un valor para actualizar el torneo.'
          })
          return
        }

        const currentParts = getSpainParts(tournament.startTime)
        const startTime = dateParts.some(value => value != null) || timeParts.some(value => value != null)
          ? buildStartTime(
              day ?? currentParts.day,
              month ?? currentParts.month,
              year ?? currentParts.year,
              hours ?? currentParts.hour,
              minutes ?? currentParts.minute
            )
          : undefined

        const updated = await updateTournament(tournament._id.toString(), {
          startTime,
          maxTeams: maxTeams ?? undefined,
          maxPlayers: maxPlayers ?? undefined
        })

        if (startTime || durationHours != null) {
          await syncTournamentEvent(guild, updated, durationHours ?? undefined, false)
        }

        const timestamp = Math.floor(updated.startTime.getTime() / 1000)
        const isSolo = updated.mode === 'solo'
        const embed = new EmbedBuilder()
          .setColor('Blue')
          .setTitle('🔁 Torneo actualizado')
          .setDescription(`**${updated.name}**`)
          .addFields(
            {
              name: '📅 Inicio',
              value: `**${formatSpainDateTime(updated.startTime)}**\n<t:${timestamp}:R>`,
              inline: true
            },
            {
              name: isSolo ? '👤 Jugadores' : '👥 Equipos',
              value: isSolo
                ? `**${updated.players.length}/${updated.maxPlayers}**`
                : `**${updated.teams.length}/${updated.maxTeams}**`,
              inline: true
            },
            {
              name: '⏱️ Duración del evento',
              value: durationHours != null ? `**${durationHours} h**` : '**Sin cambios**',
              inline: true
            }
          )
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
        scheduleTournamentPanelSync(interaction.client)
      } catch (error) {
        logger.error('No se pudo actualizar el torneo', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo actualizar el torneo.'}`
        })
      }

      return
    }

    if (subcommand === 'configurar') {
      const inscriptionSelected = interaction.options.getChannel('canal_inscripciones')
      const inscritosSelected = interaction.options.getChannel('canal_inscritos')
      const update = interaction.options.getBoolean('actualizar') ?? false

      if (!inscriptionSelected && !inscritosSelected && !update) {
        await interaction.reply({
          content: 'Indica un canal o activa `actualizar`.'
        })
        return
      }

      await interaction.deferReply()

      try {
        if (inscriptionSelected) {
          const channel = await guild.channels.fetch(inscriptionSelected.id).catch(() => null)

          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.editReply({
              content: '❌ El canal de inscripciones no es válido.'
            })
            return
          }

          await syncInscriptionPanel(interaction.client, channel as TextChannel)
        } else if (update) {
          await syncInscriptionPanel(interaction.client)
        }

        if (inscritosSelected) {
          const channel = await guild.channels.fetch(inscritosSelected.id).catch(() => null)

          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.editReply({
              content: '❌ El canal de inscritos no es válido.'
            })
            return
          }

          await configureTournamentPanel(interaction.client, channel as TextChannel)
        } else if (update || inscriptionSelected) {
          await syncTournamentPanel(interaction.client, true)
        }

        const lines: string[] = []

        if (inscriptionSelected) {
          lines.push(`📝 Inscripciones: <#${inscriptionSelected.id}>`)
        }

        if (inscritosSelected) {
          lines.push(`🏆 Inscritos: <#${inscritosSelected.id}>`)
        }

        if (!lines.length) {
          lines.push('✅ Paneles actualizados con los datos actuales.')
        }

        await interaction.editReply({ content: lines.join('\n') })
      } catch (error) {
        logger.error('No se pudo configurar los paneles de torneos', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudieron configurar los paneles.'}`
        })
      }

      return
    }

    if (subcommand === 'cancelar') {
      const tournamentName = interaction.options.getString('nombre')
      await interaction.deferReply()

      try {
        const result = await cancelTournament(guild, tournamentName)
        const timestamp = Math.floor(result.tournament.startTime.getTime() / 1000)
        const isSolo = result.tournament.mode === 'solo'

        const embed = new EmbedBuilder()
          .setColor('Red')
          .setTitle('🚫 Torneo cancelado')
          .setDescription(`Se ha cancelado **${result.tournament.name}**.`)
          .addFields(
            {
              name: 'Inicio previsto',
              value: `**${formatSpainDateTime(result.tournament.startTime)}**\n<t:${timestamp}:R>`,
              inline: true
            },
            {
              name: isSolo ? 'Jugadores inscritos' : 'Equipos inscritos',
              value: isSolo
                ? `${result.tournament.players.length}/${result.tournament.maxPlayers}`
                : `${result.tournament.teams.length}/${result.tournament.maxTeams}`,
              inline: true
            },
            {
              name: 'Evento de Discord',
              value: !result.eventFound
                ? 'No había ningún evento programado.'
                : result.eventDeleted
                  ? 'El evento programado también se ha eliminado.'
                  : 'No se pudo eliminar el evento. Comprueba los permisos del bot.'
            }
          )
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
        scheduleTournamentPanelSync(interaction.client)
      } catch (error) {
        logger.error('No se pudo cancelar el torneo', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo cancelar el torneo.'}`
        })
      }

      return
    }

    if (subcommand === 'lista') {
      await interaction.deferReply()

      try {
        const includeCancelled = interaction.options.getBoolean('mostrar_cancelados') ?? false
        const tournaments = await getTournaments(includeCancelled)
        await interaction.editReply({
          embeds: [buildTournamentListEmbed(tournaments)]
        })
      } catch (error) {
        logger.error('No se pudo obtener la lista de torneos', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({
          content: 'No se pudo obtener el historial de torneos.'
        })
      }
    }
  }
} satisfies SlashCommand

import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder
} from 'discord.js'

import type { SlashCommand } from '../../../types/commands'
import {
  MAX_TEAMS_OPTIONS,
  buildInscriptionsPanel,
  cancelTournament,
  createTournament,
  getActiveTournament,
  getTournaments,
  syncTournamentEvent,
  updateTournament
} from '@/services/tournament'
import logger from '@/utils/logger'

const MAX_TEAMS_CHOICES = MAX_TEAMS_OPTIONS.map(value => ({
  name: `${value} equipos`,
  value
}))

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseDatePart(input: string): { year: number; month: number; day: number } {
  const trimmed = input.trim()
  const local = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)

  if (local) {
    return {
      day: Number(local[1]),
      month: Number(local[2]),
      year: Number(local[3])
    }
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)

  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3])
    }
  }

  throw new Error('Fecha inválida. Usa el formato `DD/MM/AAAA`.')
}

function parseTimePart(input: string): { hours: number; minutes: number } {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/)

  if (!match) {
    throw new Error('Hora inválida. Usa el formato `HH:MM` en 24 horas.')
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours > 23 || minutes > 59) {
    throw new Error('La hora indicada no es válida.')
  }

  return { hours, minutes }
}

function buildStartTime(dateInput: string, timeInput: string): Date {
  const { year, month, day } = parseDatePart(dateInput)
  const { hours, minutes } = parseTimePart(timeInput)
  const startTime = new Date(year, month - 1, day, hours, minutes, 0, 0)

  if (
    Number.isNaN(startTime.getTime()) ||
    startTime.getFullYear() !== year ||
    startTime.getMonth() !== month - 1 ||
    startTime.getDate() !== day
  ) {
    throw new Error('La fecha indicada no existe.')
  }

  return startTime
}

function tournamentEmbed(
  tournament: {
    name: string
    startTime: Date
    maxTeams: number
    teams: unknown[]
  },
  eventId: string | null
): EmbedBuilder {
  const timestamp = Math.floor(tournament.startTime.getTime() / 1000)
  const embed = new EmbedBuilder()
    .setColor('Green')
    .setTitle('🏆 Torneo creado')
    .addFields(
      { name: 'Nombre', value: tournament.name },
      { name: 'Inicio', value: `<t:${timestamp}:F> (<t:${timestamp}:R>)` },
      { name: 'Equipos', value: `0/${tournament.maxTeams}` }
    )
    .setTimestamp()

  if (eventId) {
    embed.addFields({
      name: 'Evento programado',
      value: 'Creado/actualizado correctamente.'
    })
  }

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
    const timestamp = Math.floor(tournament.startTime.getTime() / 1000)
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
      `> <t:${timestamp}:d> · Equipos: **${teamCount}/${tournament.maxTeams}**`,
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
        .addStringOption(option =>
          option
            .setName('fecha')
            .setDescription('Fecha de inicio (DD/MM/AAAA)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('hora')
            .setDescription('Hora de inicio (HH:MM, 24h, hora del servidor)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('max_equipos')
            .setDescription('Número máximo de equipos (por defecto 16)')
            .addChoices(...MAX_TEAMS_CHOICES)
        )
        .addBooleanOption(option =>
          option
            .setName('evento')
            .setDescription('Crear un evento programado en Discord (por defecto sí)')
        )
        .addIntegerOption(option =>
          option
            .setName('duracion_horas')
            .setDescription('Duración del evento en horas (por defecto 2)')
            .setMinValue(1)
            .setMaxValue(12)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('actualizar')
        .setDescription('Actualiza el torneo abierto')
        .addStringOption(option =>
          option
            .setName('fecha')
            .setDescription('Nueva fecha de inicio (DD/MM/AAAA)')
        )
        .addStringOption(option =>
          option
            .setName('hora')
            .setDescription('Nueva hora de inicio (HH:MM, 24h, hora del servidor)')
        )
        .addIntegerOption(option =>
          option
            .setName('max_equipos')
            .setDescription('Nuevo número máximo de equipos')
            .addChoices(...MAX_TEAMS_CHOICES)
        )
    )

    .addSubcommand(subcommand =>
      subcommand
        .setName('panel')
        .setDescription('Publica el panel de inscripciones')
        .addChannelOption(option =>
          option
            .setName('canal')
            .setDescription('Canal donde publicar el panel (por defecto el actual)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
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
      const fecha = interaction.options.getString('fecha', true)
      const hora = interaction.options.getString('hora', true)
      const maxTeams = interaction.options.getInteger('max_equipos') ?? 16
      const withEvent = interaction.options.getBoolean('evento') ?? true
      const durationHours = interaction.options.getInteger('duracion_horas') ?? 2

      await interaction.deferReply()

      try {
        const active = await getActiveTournament()

        if (active) {
          await interaction.editReply({
            content: `Ya hay un torneo abierto: **${active.name}**. Actualízalo o espera a que termine.`
          })
          return
        }

        const startTime = buildStartTime(fecha, hora)
        const tournament = await createTournament(name, startTime, maxTeams)
        const eventId = withEvent
          ? await syncTournamentEvent(guild, tournament, durationHours)
          : null

        await interaction.editReply({
          embeds: [tournamentEmbed(tournament, eventId)]
        })
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
      const fecha = interaction.options.getString('fecha')
      const hora = interaction.options.getString('hora')
      const maxTeams = interaction.options.getInteger('max_equipos')

      await interaction.deferReply()

      try {
        const tournament = await getActiveTournament()

        if (!tournament) {
          await interaction.editReply({
            content: 'No hay ningún torneo abierto para actualizar.'
          })
          return
        }

        if (!fecha && !hora && maxTeams === null) {
          await interaction.editReply({
            content: 'Indica al menos una fecha, hora o máximo de equipos.'
          })
          return
        }

        const startTime = fecha || hora
          ? buildStartTime(
              fecha ?? formatDate(tournament.startTime),
              hora ?? formatTime(tournament.startTime)
            )
          : undefined

        const updated = await updateTournament(tournament._id.toString(), {
          startTime,
          maxTeams: maxTeams ?? undefined
        })

        await syncTournamentEvent(guild, updated, 2, false)

        const timestamp = Math.floor(updated.startTime.getTime() / 1000)
        const embed = new EmbedBuilder()
          .setColor('Blue')
          .setTitle('🔁 Torneo actualizado')
          .addFields(
            { name: 'Nombre', value: updated.name },
            { name: 'Inicio', value: `<t:${timestamp}:F> (<t:${timestamp}:R>)` },
            { name: 'Equipos', value: `${updated.teams.length}/${updated.maxTeams}` }
          )
          .setTimestamp()

        await interaction.editReply({ embeds: [embed] })
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

    if (subcommand === 'panel') {
      const channelId = interaction.options.getChannel('canal')?.id ?? interaction.channelId
      const channel = await guild.channels.fetch(channelId).catch(() => null)

      if (!channel || !channel.isSendable()) {
        await interaction.reply({
          content: 'Indica un canal de texto válido.'
        })
        return
      }

      await interaction.deferReply()

      try {
        const tournament = await getActiveTournament()
        await channel.send(buildInscriptionsPanel(tournament))
        await interaction.editReply({
          content: `Panel de inscripciones publicado en <#${channel.id}>.`
        })
      } catch (error) {
        logger.error('No se pudo publicar el panel de torneos', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({
          content: 'No se pudo publicar el panel. Revisa los permisos del bot.'
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

        const embed = new EmbedBuilder()
          .setColor('Red')
          .setTitle('🚫 Torneo cancelado')
          .setDescription(`Se ha cancelado **${result.tournament.name}**.`)
          .addFields(
            { name: 'Inicio previsto', value: `<t:${timestamp}:F>`, inline: true },
            {
              name: 'Equipos inscritos',
              value: `${result.tournament.teams.length}/${result.tournament.maxTeams}`,
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

import { createHash } from 'node:crypto'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Client,
  type Guild as DiscordGuild,
  type TextChannel
} from 'discord.js'

import { guildId } from '@/config/env'
import Guild from '@/models/Guild'
import type { TournamentDocument } from '@/models/Tournament'
import {
  buildInscriptionsPanel,
  getActiveTournament,
  TEAM_ROLE_EMOJI,
  TOURNAMENT_COLOR,
  type TournamentV2Payload
} from '@/services/tournament'
import { getGuildConfig, setGuildConfigCache } from '@/services/guild'
import { formatSpainDateTime } from '@/utils/datetime'
import logger from '@/utils/logger'

export const DEFAULT_TOURNAMENT_INSCRIPTION_CHANNEL_ID = '1568936507270762517'

const MAX_LIST_LENGTH = 2800

interface TournamentPanelPayload extends TournamentV2Payload {
  allowedMentions: { parse: [] }
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small)
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

function inscriptionButton(
  guildId: string,
  inscriptionChannelId: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${inscriptionChannelId}`)
      .setLabel('Ir a inscripciones')
      .setEmoji('📝')
  )
}

function joinLimited(entries: string[], emptyText: string): string {
  if (!entries.length) return emptyText

  const lines: string[] = []
  let length = 0

  for (const entry of entries) {
    const nextLength = length + entry.length + (lines.length ? 1 : 0)

    if (nextLength > MAX_LIST_LENGTH) break

    lines.push(entry)
    length = nextLength
  }

  const hidden = entries.length - lines.length

  if (hidden > 0) {
    lines.push(`-# y ${hidden} más...`)
  }

  return lines.join('\n')
}

function buildTeamEntries(tournament: TournamentDocument): string[] {
  return tournament.teams.map((team, index) => {
    const members = team.members
      .map(member => `${TEAM_ROLE_EMOJI[member.role]} <@${member.discordId}>`)
      .join(' · ')

    return `**${index + 1}. ${team.name}**\n${members}`
  })
}

function buildSoloEntries(tournament: TournamentDocument): string[] {
  return [...tournament.players]
    .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())
    .map((player, index) => `**${index + 1}.** <@${player.discordId}>`)
}

function buildTournamentPanel(
  tournament: TournamentDocument | null,
  panelGuildId: string,
  inscriptionChannelId: string
): TournamentPanelPayload {
  const container = new ContainerBuilder().setAccentColor(TOURNAMENT_COLOR)

  if (!tournament) {
    container.addTextDisplayComponents(text('## 🏆 Inscritos'))
    container.addSeparatorComponents(separator())
    container.addTextDisplayComponents(
      text('No hay ningún torneo activo ahora mismo.')
    )
    container.addSeparatorComponents(separator())
    container.addTextDisplayComponents(
      text('-# Cuando se abra un torneo, aquí aparecerán los equipos o jugadores inscritos.')
    )
    container.addSeparatorComponents(separator())
    container.addTextDisplayComponents(
      text(`-# Para inscribirte, ve a <#${inscriptionChannelId}>.`)
    )
    container.addActionRowComponents(inscriptionButton(panelGuildId, inscriptionChannelId))

    return {
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [] }
    }
  }

  const isSolo = tournament.mode === 'solo'
  const timestamp = Math.floor(tournament.startTime.getTime() / 1000)
  const count = isSolo
    ? `${tournament.players.length}/${tournament.maxPlayers}`
    : `${tournament.teams.length}/${tournament.maxTeams}`

  container.addTextDisplayComponents(text(`## 🏆 ${tournament.name}`))
  container.addSeparatorComponents(separator())
  container.addTextDisplayComponents(
    text([
      `-# ${isSolo ? 'Individual' : 'Por equipos'}`,
      `📅 **Inicio:** ${formatSpainDateTime(tournament.startTime)} (<t:${timestamp}:R>)`,
      `${isSolo ? '👤' : '👥'} **${isSolo ? 'Jugadores' : 'Equipos'}:** **${count}**`
    ].join('\n'))
  )
  container.addSeparatorComponents(separator())
  container.addTextDisplayComponents(
    text([
      `### ${isSolo ? '👤 Jugadores inscritos' : '👥 Equipos inscritos'}`,
      isSolo
        ? joinLimited(buildSoloEntries(tournament), '-# Todavía no hay jugadores inscritos. ¡Sé el primero!')
        : joinLimited(buildTeamEntries(tournament), '-# Todavía no hay equipos inscritos. ¡Sé el primero!')
    ].join('\n'))
  )
  container.addSeparatorComponents(separator())
  container.addTextDisplayComponents(
    text(`-# Para inscribirte, entra en <#${inscriptionChannelId}> y pulsa **${isSolo ? 'Inscribirme' : 'Inscribirse'}**.`)
  )
  container.addActionRowComponents(inscriptionButton(panelGuildId, inscriptionChannelId))

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] }
  }
}

function payloadHash(payload: TournamentPanelPayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function deleteStoredMessage(
  guild: DiscordGuild,
  channelId: string | null,
  messageId: string | null
): Promise<void> {
  if (!channelId || !messageId) return

  const channel = await guild.channels.fetch(channelId).catch(() => null)

  if (!channel || !channel.isTextBased() || channel.isDMBased()) return

  const message = await (channel as TextChannel).messages.fetch(messageId).catch(() => null)

  await message?.delete().catch(() => null)
}

export async function syncTournamentPanel(
  client: Client,
  force = false
): Promise<void> {
  const config = await getGuildConfig()
  const channelId = config.tournamentPanelChannelId

  if (!channelId) return

  const guild = await client.guilds.fetch(guildId).catch(() => null)

  if (!guild) {
    logger.warn('No se encontró el servidor para sincronizar el panel de torneos')
    return
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null)

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logger.warn('El canal del panel de torneos no es válido', { channelId })
    return
  }

  const textChannel = channel as TextChannel
  const tournament = await getActiveTournament()
  const inscriptionChannelId =
    config.tournamentInscriptionChannelId ?? DEFAULT_TOURNAMENT_INSCRIPTION_CHANNEL_ID

  const payload = buildTournamentPanel(tournament, guild.id, inscriptionChannelId)
  const hash = payloadHash(payload)

  if (!force && config.tournamentPanelMessageId && config.tournamentPanelHash === hash) {
    return
  }

  let message = config.tournamentPanelMessageId
    ? await textChannel.messages.fetch(config.tournamentPanelMessageId).catch(() => null)
    : null

  if (message) {
    await message.edit(payload as never)
  } else {
    message = await textChannel.send(payload as never)
  }

  config.tournamentPanelChannelId = textChannel.id
  config.tournamentPanelMessageId = message.id
  config.tournamentPanelHash = hash

  await Guild.updateOne(
    { guildId: config.guildId },
    {
      $set: {
        tournamentPanelChannelId: config.tournamentPanelChannelId,
        tournamentPanelMessageId: config.tournamentPanelMessageId,
        tournamentPanelHash: config.tournamentPanelHash
      }
    }
  )

  setGuildConfigCache(config)
}

export async function configureTournamentPanel(
  client: Client,
  channel: TextChannel
): Promise<void> {
  const config = await getGuildConfig(true)

  if (config.tournamentPanelChannelId !== channel.id) {
    if (config.tournamentPanelChannelId && config.tournamentPanelMessageId) {
      const previousChannel = await channel.guild.channels
        .fetch(config.tournamentPanelChannelId)
        .catch(() => null)

      if (previousChannel?.isTextBased() && !previousChannel.isDMBased()) {
        const previousMessage = await (previousChannel as TextChannel).messages
          .fetch(config.tournamentPanelMessageId)
          .catch(() => null)

        await previousMessage?.delete().catch(() => null)
      }
    }

    config.tournamentPanelMessageId = null
    config.tournamentPanelHash = null
  }

  config.tournamentPanelChannelId = channel.id

  await Guild.updateOne(
    { guildId: config.guildId },
    {
      $set: {
        tournamentPanelChannelId: config.tournamentPanelChannelId,
        tournamentPanelMessageId: config.tournamentPanelMessageId,
        tournamentPanelHash: config.tournamentPanelHash
      }
    }
  )

  setGuildConfigCache(config)
  await syncTournamentPanel(client, true)
}

export async function syncInscriptionPanel(
  client: Client,
  targetChannel?: TextChannel
): Promise<void> {
  const config = await getGuildConfig(true)
  const guild = targetChannel?.guild
    ?? await client.guilds.fetch(guildId).catch(() => null)

  if (!guild) {
    logger.warn('No se encontró el servidor para sincronizar el panel de inscripciones')
    return
  }

  const channelId = targetChannel?.id ?? config.tournamentInscriptionChannelId

  if (!channelId) return

  const channel = targetChannel
    ?? await guild.channels.fetch(channelId).catch(() => null)

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logger.warn('El canal del panel de inscripciones no es válido', { channelId })
    return
  }

  const textChannel = channel as TextChannel

  if (
    config.tournamentInscriptionChannelId &&
    config.tournamentInscriptionChannelId !== textChannel.id
  ) {
    await deleteStoredMessage(
      guild,
      config.tournamentInscriptionChannelId,
      config.inscriptionPanelMessageId
    )

    config.inscriptionPanelMessageId = null
  }

  const payload = buildInscriptionsPanel(await getActiveTournament())

  let message = config.inscriptionPanelMessageId
    ? await textChannel.messages.fetch(config.inscriptionPanelMessageId).catch(() => null)
    : null

  if (message) {
    await message.edit(payload as never)
  } else {
    message = await textChannel.send(payload as never)
  }

  config.tournamentInscriptionChannelId = textChannel.id
  config.inscriptionPanelMessageId = message.id

  await Guild.updateOne(
    { guildId: config.guildId },
    {
      $set: {
        tournamentInscriptionChannelId: config.tournamentInscriptionChannelId,
        inscriptionPanelMessageId: config.inscriptionPanelMessageId
      }
    }
  )

  setGuildConfigCache(config)
}

let syncTimer: NodeJS.Timeout | null = null

export function scheduleTournamentPanelSync(
  client: Client,
  delayMs = 1000
): void {
  if (syncTimer) clearTimeout(syncTimer)

  syncTimer = setTimeout(() => {
    syncTimer = null

    void (async () => {
      await syncInscriptionPanel(client).catch(error => {
        logger.warn('No se pudo sincronizar el panel de inscripciones', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
      })

      await syncTournamentPanel(client).catch(error => {
        logger.warn('No se pudo sincronizar el panel de torneos', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
      })
    })()
  }, delayMs)

  syncTimer.unref?.()
}

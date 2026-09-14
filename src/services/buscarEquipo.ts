import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type Client,
  type GuildTextBasedChannel,
  type Message
} from 'discord.js'
import { guildId } from '../config/env'
import logger from '../utils/logger'

export const BUSCAR_EQUIPO_CHANNEL_ID = '1096162299837939834'
export const BUSCAR_EQUIPO_ROLE_ID = '1180483997281824768'
export const BUSCAR_EQUIPO_VOICE_ID = '1163777101426597948'

export const BUSCAR_EQUIPO_EJEMPLO_BUTTON_ID = 'buscar-equipo-ejemplo'

// Footer del embed antiguo (para migrar/limpiar stickies previos al pasar a Components V2)
const LEGACY_FOOTER = 'TS • Buscar Equipo | sticky'
const LEGACY_TITLE = '🔍 Buscar Equipo'

const REFRESH_DEBOUNCE_MS = 2500
const FETCH_LIMIT = 20

let refreshTimer: NodeJS.Timeout | null = null
let refreshing = false

function buildContainer(botIconURL?: string | null): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(0x7c3aed)

  // 1) Título + descripción + logo del bot
  if (botIconURL) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '## 🔍 Buscar Equipo\n-# Canal para encontrar compañeros. Úsalo con cabeza.'
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(botIconURL))
    )
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## 🔍 Buscar Equipo\n-# Canal para encontrar compañeros. Úsalo con cabeza.'
      )
    )
  }

  // 2) Ping para buscar + botón ejemplo
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `🔔 **Ping para buscar**\n<@&${BUSCAR_EQUIPO_ROLE_ID}>`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(BUSCAR_EQUIPO_EJEMPLO_BUTTON_ID)
          .setLabel('Cómo funciona')
          .setEmoji('❓')
          .setStyle(ButtonStyle.Secondary)
      )
  )

  // 3) Llamadas en + botón entrar (enlace directo al vocal)
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `🎙️ **Llamadas en**\n<#${BUSCAR_EQUIPO_VOICE_ID}>`
        )
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setLabel('Entrar')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${guildId}/${BUSCAR_EQUIPO_VOICE_ID}`)
      )
  )

  return container
}

export function buildBuscarEquipoPayload(botIconURL?: string | null) {
  return {
    components: [buildContainer(botIconURL)],
    flags: 'IsComponentsV2' as const,
    // Mención informativa: se muestra clicable pero no notifica
    allowedMentions: { parse: [] as const }
  }
}

function isLegacySticky(message: Message): boolean {
  if (!message.author.bot) return false
  return message.embeds.some(
    (e) => e.footer?.text === LEGACY_FOOTER || e.title === LEGACY_TITLE
  )
}

function isV2Sticky(message: Message, botUserId?: string): boolean {
  if (botUserId && message.author.id !== botUserId) return false
  if (!message.author.bot) return false
  if (!message.flags?.has(MessageFlags.IsComponentsV2)) return false
  return message.components.length > 0
}

export function isBuscarEquipoSticky(message: Message, botUserId?: string): boolean {
  return isV2Sticky(message, botUserId) || (botUserId ? message.author.id === botUserId && isLegacySticky(message) : isLegacySticky(message))
}

async function fetchBuscarEquipoChannel(
  client: Client
): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(BUSCAR_EQUIPO_CHANNEL_ID).catch(() => null)
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null
  if (!('send' in channel)) return null
  return channel as GuildTextBasedChannel
}

function resolveBotIcon(client: Client): string | null {
  return client.user?.displayAvatarURL({ size: 256 }) ?? null
}

/**
 * Mantiene el mensaje de Buscar Equipo abajo del todo.
 * - Si ya está abajo y solo hay uno, lo edita para mantener el diseño actualizado.
 * - Si hay mensajes nuevos debajo o duplicados (incluidos embeds antiguos), los borra y publica uno nuevo.
 */
export async function refreshBuscarEquipoSticky(client: Client): Promise<void> {
  if (refreshing) return
  refreshing = true

  try {
    const channel = await fetchBuscarEquipoChannel(client)
    if (!channel) {
      logger.warn('BuscarEquipo sticky: canal no disponible', {
        channelId: BUSCAR_EQUIPO_CHANNEL_ID
      })
      return
    }

    const botUserId = client.user?.id
    const messages = await channel.messages.fetch({ limit: FETCH_LIMIT }).catch(() => null)
    if (!messages) return

    const sorted = [...messages.values()].sort(
      (a, b) => b.createdTimestamp - a.createdTimestamp
    )
    const stickies = sorted.filter((m) => isBuscarEquipoSticky(m, botUserId))
    const newest = sorted[0]

    const payload = buildBuscarEquipoPayload(resolveBotIcon(client))

    if (newest && stickies.length === 1 && newest.id === stickies[0].id) {
      // Si el que está abajo es el embed antiguo, se re-publica como V2
      const onlyLegacy = stickies[0].embeds.length > 0 && !stickies[0].flags?.has(MessageFlags.IsComponentsV2)
      if (onlyLegacy) {
        await stickies[0].delete().catch(() => null)
        await channel.send(payload).catch(() => null)
      } else {
        await stickies[0].edit(payload).catch(() => null)
      }
      return
    }

    await Promise.all(stickies.map((m) => m.delete().catch(() => null)))

    await channel.send(payload).catch(() => null)
  } catch (error) {
    logger.error('BuscarEquipo sticky refresh failed', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    refreshing = false
  }
}

/** Programa un refresh con debounce para no spamear borrado/envío ante ráfagas de mensajes. */
export function scheduleBuscarEquipoRefresh(client: Client): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refreshBuscarEquipoSticky(client)
  }, REFRESH_DEBOUNCE_MS)
}

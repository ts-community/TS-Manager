import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import {
  BUSCAR_EQUIPO_CHANNEL_ID,
  BUSCAR_EQUIPO_ROLE_ID
} from '../../services/buscarEquipo'
import { mlTeamSearch } from '../../ml/index'

const PING_COOLDOWN_MS = 10 * 60 * 1000
const MAX_TEXT_LENGTH = 500
const MAX_REPLY_CONTENT_LENGTH = 1500

/** Tiempo durante el que no se vuelve a auto-ping a un usuario tras usar el rol (él o el bot). */
const lastPingAt = new Map<string, number>()

function markPing(userId: string): void {
  lastPingAt.set(userId, Date.now())
  setTimeout(() => lastPingAt.delete(userId), PING_COOLDOWN_MS)
}

function isOnCooldown(userId: string): boolean {
  const last = lastPingAt.get(userId)
  return last !== undefined && Date.now() - last < PING_COOLDOWN_MS
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (message.channelId !== BUSCAR_EQUIPO_CHANNEL_ID) return
    if (message.author.bot || !message.guild) return

    if (message.mentions.roles.has(BUSCAR_EQUIPO_ROLE_ID)) {
      markPing(message.author.id)
      return
    }

    if (isOnCooldown(message.author.id)) return

    const content = message.content.trim()
    if (!content || content.length > MAX_TEXT_LENGTH) return

    const { decision } = mlTeamSearch.predict(content)
    if (decision !== 'looking') return

    markPing(message.author.id)

    await message.reply({
      content: `**[${message.member?.displayName ?? message.author.username}]** ${truncate(content, MAX_REPLY_CONTENT_LENGTH)} <@&${BUSCAR_EQUIPO_ROLE_ID}>`,
      allowedMentions: {
        roles: [BUSCAR_EQUIPO_ROLE_ID]
      }
    }).catch(() => null)
  }
} satisfies Event<'messageCreate'>

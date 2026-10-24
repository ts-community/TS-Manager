import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import {
  BUSCAR_EQUIPO_CHANNEL_ID,
  BUSCAR_EQUIPO_ROLE_ID
} from '../../services/buscarEquipo'
import { mlTeamSearch } from '../../ml/index'

const SESSION_IDLE_MS = 5 * 60 * 1000
const SESSION_MAX_MS = 20 * 60 * 1000
const MAX_TEXT_LENGTH = 500
const MAX_REPLY_CONTENT_LENGTH = 1500

/** Sesión de búsqueda: se abre con el primer ping y se cierra tras un rato sin actividad. */
let sessionStartedAt = 0
let lastActivityAt = 0

function isSessionOpen(now: number): boolean {
  if (sessionStartedAt === 0) return false
  if (now - lastActivityAt >= SESSION_IDLE_MS || now - sessionStartedAt >= SESSION_MAX_MS) {
    sessionStartedAt = 0
    return false
  }
  return true
}

function openSession(now: number): void {
  sessionStartedAt = now
  lastActivityAt = now
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (message.channelId !== BUSCAR_EQUIPO_CHANNEL_ID) return
    if (message.author.bot || !message.guild) return

    const now = Date.now()
    const sessionOpen = isSessionOpen(now)

    // Cualquier mensaje humano mantiene viva la búsqueda en curso.
    if (sessionOpen) lastActivityAt = now

    if (message.mentions.roles.has(BUSCAR_EQUIPO_ROLE_ID)) {
      if (!sessionOpen) openSession(now)
      return
    }

    if (sessionOpen) return

    const content = message.content.trim()
    if (!content || content.length > MAX_TEXT_LENGTH) return

    const { decision } = mlTeamSearch.predict(content)
    if (decision !== 'looking') return

    openSession(now)

    await message.reply({
      content: `**[${message.member?.displayName ?? message.author.username}]** ${truncate(content, MAX_REPLY_CONTENT_LENGTH)} <@&${BUSCAR_EQUIPO_ROLE_ID}>`,
      allowedMentions: {
        roles: [BUSCAR_EQUIPO_ROLE_ID]
      }
    }).catch(() => null)
  }
} satisfies Event<'messageCreate'>

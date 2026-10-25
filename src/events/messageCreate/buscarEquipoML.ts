import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import {
  BUSCAR_EQUIPO_CHANNEL_ID,
  BUSCAR_EQUIPO_ROLE_ID
} from '../../services/buscarEquipo'
import { prefix } from '../../config/env'
import { mlTeamSearch } from '../../ml/index'

const SESSION_IDLE_MS = 5 * 60 * 1000
const SESSION_MAX_MS = 20 * 60 * 1000
const MAX_TEXT_LENGTH = 500
const MAX_REPLY_CONTENT_LENGTH = 1500

/** Fuera del canal correcto solo avisamos si es clarísimo y de Brawl Stars. */
const REDIRECT_MIN_SCORE = 0.85
const REDIRECT_COOLDOWN_MS = 30 * 60 * 1000
/** Señales de Brawl Stars en el texto (juego, abreviaturas, modos, rangos, objetos...). */
const BRAWL_CONTEXT = /\b(brawl(?:s|\s*stars)?|brawlers?|bs|p(?:1[01]|[1-9])|copas?|trofeos?|pushe(?:ar|o|ando|amos)|m[ií]tic[oa]s?|legendari[oa]s?|atrapagemas|bal[oó]n brawl|brawlball|noqueo|supervivencia|asedio|caza estelar|supercell|3v3|gadgets?|star ?powers?|hipercargas?|maxe(?:ar|ado|ando|o))\b|b\.\s?s\.?/iu

/** Sesión de búsqueda: se abre con el primer ping y se cierra tras un rato sin actividad. */
let sessionStartedAt = 0
let lastActivityAt = 0
/** Último aviso de "este no es el canal" por usuario. */
const lastRedirectAt = new Map<string, number>()

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

/** Solo cuenta el texto: el canal no decide si la búsqueda es de Brawl Stars. */
function hasBrawlContext(content: string): boolean {
  return BRAWL_CONTEXT.test(content)
}

function canRedirect(userId: string, now: number): boolean {
  const last = lastRedirectAt.get(userId)
  if (last !== undefined && now - last < REDIRECT_COOLDOWN_MS) return false
  lastRedirectAt.set(userId, now)
  return true
}

/** Si buscan equipo de Brawl fuera del canal correcto, se les indica dónde hacerlo. */
async function maybeRedirect(message: Message<true>): Promise<void> {
  if (message.channel.isThread() && message.channel.parentId === BUSCAR_EQUIPO_CHANNEL_ID) return

  const content = message.content.trim()
  if (!content || content.length > MAX_TEXT_LENGTH) return
  if (content.startsWith(prefix)) return
  if (!hasBrawlContext(content)) return

  const { score } = mlTeamSearch.predict(content, REDIRECT_MIN_SCORE)
  if (score < REDIRECT_MIN_SCORE) return
  if (!canRedirect(message.author.id, Date.now())) return

  await message.reply({
    content: `Si buscas equipo para jugar a Brawl Stars, puedes hacerlo en el canal <#${BUSCAR_EQUIPO_CHANNEL_ID}>. Así te verá más gente.`,
    allowedMentions: { parse: [] }
  }).catch(() => null)
}

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (message.author.bot || !message.inGuild()) return

    if (message.channelId !== BUSCAR_EQUIPO_CHANNEL_ID) {
      await maybeRedirect(message)
      return
    }

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

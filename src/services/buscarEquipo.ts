import type { Message } from 'discord.js'

export const BUSCAR_EQUIPO_CHANNEL_ID = '1096162299837939834'
export const BUSCAR_EQUIPO_ROLE_ID = '1180483997281824768'

/** Tiempo mínimo entre publicaciones de búsqueda de un mismo usuario. */
export const SEARCH_COOLDOWN_MS = 2 * 60 * 60 * 1000

const WARN_WINDOW_MS = 24 * 60 * 60 * 1000
const WARNINGS_BEFORE_TIMEOUT = 3
const SPAM_TIMEOUT_MS = 10 * 60 * 1000

interface SearchState {
  lastPublishedAt: number
  warnings: number[]
}

const searchStates = new Map<string, SearchState>()

function getSearchState(userId: string): SearchState {
  let state = searchStates.get(userId)
  if (!state) {
    state = { lastPublishedAt: 0, warnings: [] }
    searchStates.set(userId, state)
  }
  return state
}

/**
 * Registra una publicación de búsqueda y bloquea las repeticiones dentro del cooldown.
 * Devuelve true si la búsqueda puede publicarse/pingearse.
 */
export async function checkSearchCooldown(message: Message<true>, now = Date.now()): Promise<boolean> {
  const userId = message.author.id
  const state = getSearchState(userId)
  const remainingMs = state.lastPublishedAt + SEARCH_COOLDOWN_MS - now

  if (state.lastPublishedAt > 0 && remainingMs > 0) {
    // Cada intento reinicia el cooldown para que no pueda publicar cada hora.
    state.lastPublishedAt = now
    state.warnings = state.warnings.filter(timestamp => now - timestamp < WARN_WINDOW_MS)
    state.warnings.push(now)

    const canTimeout = Boolean(message.member?.moderatable)
    const timeoutMs = canTimeout && state.warnings.length >= WARNINGS_BEFORE_TIMEOUT ? SPAM_TIMEOUT_MS : 0
    const until = Math.floor((now + SEARCH_COOLDOWN_MS) / 1000)
    const timeoutText = timeoutMs > 0 ? ' Te doy un timeout de 10 minutos por insistir.' : ''
    const payload = {
      content: `<@${userId}> ya publicaste una búsqueda hace poco. No la repitas cada hora; espera hasta <t:${until}:R> para volver a publicar.${timeoutText}`,
      allowedMentions: { users: [userId] }
    }

    await message.reply(payload).catch(() => message.channel.send(payload).catch(() => null))
    await message.delete().catch(() => null)

    if (timeoutMs > 0) {
      await message.member?.timeout(timeoutMs, 'Spam en el canal de Buscar Equipo').catch(() => null)
    }

    return false
  }

  state.lastPublishedAt = now
  return true
}

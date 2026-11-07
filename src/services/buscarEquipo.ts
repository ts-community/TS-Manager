import type { Message } from 'discord.js'

export const BUSCAR_EQUIPO_CHANNEL_ID = '1096162299837939834'
export const BUSCAR_EQUIPO_ROLE_ID = '1180483997281824768'

/** Cooldown base entre búsquedas válidas. */
export const SEARCH_COOLDOWN_MS = 2 * 60 * 60 * 1000

/** Cooldown según las infracciones acumuladas en las últimas 24 h. */
const COOLDOWN_PHASES_MS = [
  SEARCH_COOLDOWN_MS,
  SEARCH_COOLDOWN_MS,
  8 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000
]

/** Timeout según las infracciones acumuladas en las últimas 24 h. */
const TIMEOUT_PHASES_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000
]

/** Tiempo que una infracción sigue contando. */
const VIOLATION_WINDOW_MS = 24 * 60 * 60 * 1000

interface SearchState {
  lastPublishedAt: number
  violations: number[]
}

const searchStates = new Map<string, SearchState>()

function getSearchState(userId: string): SearchState {
  let state = searchStates.get(userId)
  if (!state) {
    state = { lastPublishedAt: 0, violations: [] }
    searchStates.set(userId, state)
  }
  return state
}

function recentViolations(state: SearchState, now: number): number[] {
  state.violations = state.violations.filter(timestamp => now - timestamp < VIOLATION_WINDOW_MS)
  return state.violations
}

function phaseFor(count: number, phases: number[]): number {
  return phases[Math.min(count, phases.length - 1)] ?? phases[phases.length - 1] ?? 0
}

function cooldownFor(state: SearchState, now: number): number {
  return phaseFor(recentViolations(state, now).length, COOLDOWN_PHASES_MS)
}

export function isSearchOnCooldown(userId: string, now = Date.now()): boolean {
  const state = getSearchState(userId)
  return state.lastPublishedAt > 0 && now < state.lastPublishedAt + cooldownFor(state, now)
}

export function registerSearch(userId: string, now = Date.now()): void {
  getSearchState(userId).lastPublishedAt = now
}

/**
 * Solo para pings manuales al rol: bloquea, avisa y aplica el castigo por fases.
 * Las búsquedas detectadas automáticamente no cuentan como infracción.
 */
export async function enforceManualSearchCooldown(message: Message<true>, now = Date.now()): Promise<boolean> {
  const userId = message.author.id
  const state = getSearchState(userId)

  if (isSearchOnCooldown(userId, now)) {
    recentViolations(state, now).push(now)
    const violations = state.violations.length
    const cooldownMs = phaseFor(violations, COOLDOWN_PHASES_MS)
    const timeoutMs = message.member?.moderatable ? phaseFor(violations - 1, TIMEOUT_PHASES_MS) : 0
    const until = Math.floor((state.lastPublishedAt + cooldownMs) / 1000)
    const payload = {
      content: `⚠️ <@${userId}> aún no puedes publicar otra búsqueda debido a que te encuentras en cooldown. Podrás volver a publicar <t:${until}:R>.`,
      allowedMentions: { users: [userId] }
    }

    await message.reply(payload).catch(() => null)
    await message.delete().catch(() => null)

    if (timeoutMs > 0) {
      await message.member?.timeout(timeoutMs, 'Spam en el canal de Buscar Equipo').catch(() => null)
    }

    return false
  }

  registerSearch(userId, now)
  return true
}

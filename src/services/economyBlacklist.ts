import type { Client, Guild } from 'discord.js'
import EconomyBlacklist from '../models/EconomyBlacklist'
import logger from '../utils/logger'

export const ECONOMY_BLACKLIST_ROLE_ID = '1561788083081314434'
export const ECONOMY_BLACKLIST_LOG_CHANNEL_ID = '1561788417115955210'

// Comandos de economía (UnbelievaBoat) que un usuario en la blacklist no debería usar
export const ECONOMY_COMMANDS = new Set([
  'work', 'slut', 'crime', 'rob', 'daily', 'collect', 'deposit', 'dep', 'withdraw', 'with',
  'give-money', 'give', 'blackjack', 'bj', 'roulette', 'russian-roulette', 'rr', 'cock-fight',
  'cf', 'slots', 'buy', 'sell', 'use', 'item', 'inventory', 'inv', 'store', 'shop'
])

const UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000
}

/** "30m", "12h", "7d", "2w" -> ms. "perm" / "permanente" -> null. Inválido -> undefined. */
export function parseDuration(input: string): number | null | undefined {
  const text = input.trim().toLowerCase()
  if (['perm', 'permanente', 'permanent', 'inf'].includes(text)) return null

  const match = text.match(/^(\d+)\s*([mhdw])$/)
  if (!match) return undefined

  const ms = Number(match[1]) * UNITS[match[2]]
  return ms > 0 ? ms : undefined
}

export function formatExpiry(expiresAt: Date | null): string {
  return expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:F> (<t:${Math.floor(expiresAt.getTime() / 1000)}:R>)` : 'Permanente'
}

export async function addToBlacklist(guild: Guild, userId: string, reason: string, moderatorId: string, durationMs: number | null) {
  const expiresAt = durationMs === null ? null : new Date(Date.now() + durationMs)

  const entry = await EconomyBlacklist.findOneAndUpdate(
    { guildId: guild.id, userId },
    { reason, moderatorId, createdAt: new Date(), expiresAt },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  const member = await guild.members.fetch(userId).catch(() => null)
  const roleAdded = member ? await member.roles.add(ECONOMY_BLACKLIST_ROLE_ID, 'Blacklist de economía').then(() => true, () => false) : false

  return { entry, roleAdded, inGuild: !!member }
}

export async function removeFromBlacklist(guild: Guild, userId: string, reason = 'Blacklist de economía retirada') {
  const entry = await EconomyBlacklist.findOneAndDelete({ guildId: guild.id, userId })
  const member = await guild.members.fetch(userId).catch(() => null)
  if (member?.roles.cache.has(ECONOMY_BLACKLIST_ROLE_ID)) {
    await member.roles.remove(ECONOMY_BLACKLIST_ROLE_ID, reason).catch(() => {})
  }
  return entry
}

/** Quita las entradas caducadas (también las que caducaron con el bot apagado). */
export async function expireBlacklist(client: Client): Promise<void> {
  const expired = await EconomyBlacklist.find({ expiresAt: { $ne: null, $lte: new Date() } })

  for (const entry of expired) {
    const guild = client.guilds.cache.get(entry.guildId)
    if (guild) await removeFromBlacklist(guild, entry.userId, 'Blacklist de economía caducada')
    else await EconomyBlacklist.deleteOne({ _id: entry._id })
    logger.info('Blacklist de economía caducada', { userId: entry.userId })
  }
}

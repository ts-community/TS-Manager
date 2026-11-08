import {
  EmbedBuilder,
  type Client,
  type Guild
} from 'discord.js'
import type { ClientSession } from 'mongoose'

import Blacklist from '@/models/Blacklist'

import type {
  BlacklistEntry,
  BlacklistType,
  BlacklistDuration
} from '@/types/blacklist'

export const ECONOMY_BLACKLIST_ROLE_ID = '1561788083081314434'
export const ECONOMY_BLACKLIST_LOG_CHANNEL_ID = '1561788417115955210'

export const ECONOMY_COMMANDS = new Set([
  // Ganar dinero
  'work', 'slut', 'crime', 'rob', 'daily', 'collect', 'heist',

  // Apuestas y juegos
  'roulette', 'roul', 'russian-roulette', 'russianroulette', 'rr',
  'blackjack', 'bj', 'cock-fight', 'cockfight', 'cf',
  'slots', 'slot', 'crash', 'coinflip', 'cointoss', 'flip',
  'dice', 'poker', 'lottery', 'bet', 'gamble', 'wheel',

  // Banco y transferencias
  'deposit', 'dep', 'withdraw', 'with', 'give-money',
  'give', 'pay', 'transfer',

  // Tienda e inventario
  'buy', 'sell', 'use', 'item', 'inventory', 'inv',
  'store', 'shop'
])

const DAY_IN_MS = 24 * 60 * 60 * 1000

const CATEGORY_NAMES: Record<BlacklistType, string> = {
  tournaments: 'torneos',
  economy: 'economía'
}

type NotificationAction = 'added' | 'removed' | 'expired'

function calculateExpiration(
  durationDays: BlacklistDuration | null
): Date | null {
  if (durationDays === null) return null

  return new Date(Date.now() + durationDays * DAY_IN_MS)
}

/**
 * Comprueba si una entrada de blacklist sigue activa.
 */
export function isEntryActive(
  entry: BlacklistEntry | null | undefined
): boolean {
  if (!entry) return false

  return entry.expiresAt === null ||
    entry.expiresAt.getTime() > Date.now()
}

/**
 * Formatea una fecha de expiración para Discord.
 */
export function formatExpiry(expiresAt: Date | null): string {
  if (!expiresAt) return 'Permanente'

  const timestamp = Math.floor(expiresAt.getTime() / 1000)

  return `<t:${timestamp}:F> (<t:${timestamp}:R>)`
}

/**
 * Envía una notificación privada al usuario.
 *
 * Devuelve false si no se ha podido enviar el MD.
 */
async function notifyUser(
  client: Client,
  discordId: string,
  type: BlacklistType,
  action: NotificationAction,
  entry: BlacklistEntry
): Promise<boolean> {
  const user = await client.users.fetch(discordId).catch(() => null)

  if (!user) return false

  const category = CATEGORY_NAMES[type]

  const descriptions: Record<NotificationAction, string> = {
    added: `Has sido añadido a la blacklist de ${category}.`,
    removed: `Has sido retirado de la blacklist de ${category}.`,
    expired: `Tu entrada en la blacklist de ${category} ha caducado.`
  }

  const embed = new EmbedBuilder()
    .setColor(action === 'added' ? 'Red' : 'Green')
    .setTitle('Blacklist de TS Community')
    .setDescription(descriptions[action])
    .addFields(
      { name: 'Motivo', value: entry.reason },
      { name: 'Expira', value: formatExpiry(entry.expiresAt) }
    )
    .setTimestamp()

  if (action === 'added' && type === 'economy') {
    embed.addFields({
      name: 'Importante',
      value:
        'No puedes utilizar los comandos de economía del servidor mientras esta entrada esté activa.\n\n' +
        'Si vuelves a utilizar dichos comandos, el staff podrá tomar medidas adicionales.'
    })
  }

  return user.send({ embeds: [embed] })
    .then(() => true)
    .catch(() => false)
}

/**
 * Añade o retira el rol de blacklist de economía.
 */
async function updateEconomyRole(
  guild: Guild | null,
  discordId: string,
  add: boolean
): Promise<boolean> {
  if (!guild) return false

  const member = await guild.members.fetch(discordId).catch(() => null)

  if (!member) return false

  if (add) {
    if (member.roles.cache.has(ECONOMY_BLACKLIST_ROLE_ID)) {
      return true
    }

    return member.roles
      .add(ECONOMY_BLACKLIST_ROLE_ID, 'Blacklist de economía')
      .then(() => true)
      .catch(() => false)
  }

  if (!member.roles.cache.has(ECONOMY_BLACKLIST_ROLE_ID)) {
    return true
  }

  return member.roles
    .remove(ECONOMY_BLACKLIST_ROLE_ID, 'Blacklist de economía retirada')
    .then(() => true)
    .catch(() => false)
}

/**
 * Comprueba si un usuario está en una categoría concreta.
 */
export async function isBlacklisted(
  discordId: string,
  type: BlacklistType,
  session?: ClientSession
): Promise<boolean> {
  const blacklist = await Blacklist.findOne({ discordId })
    .session(session ?? null)

  if (!blacklist) return false

  return isEntryActive(blacklist[type])
}

/**
 * Comprueba si un usuario está en alguna categoría.
 */
export async function isBlacklistedAnywhere(
  discordId: string
): Promise<boolean> {
  const blacklist = await Blacklist.findOne({ discordId })

  if (!blacklist) return false

  return (
    isEntryActive(blacklist.tournaments) ||
    isEntryActive(blacklist.economy)
  )
}

/**
 * Añade un usuario a una categoría de blacklist.
 *
 * Si ya existe una entrada, la sustituye.
 * La otra categoría permanece intacta.
 *
 * durationDays = null significa permanente.
 */
export async function addToBlacklist(
  guild: Guild,
  discordId: string,
  type: BlacklistType,
  addedBy: string,
  reason: string,
  durationDays: BlacklistDuration | null
) {
  if (!discordId.trim()) {
    throw new Error('El ID de Discord no es válido.')
  }

  if (!addedBy.trim()) {
    throw new Error('El ID del responsable no es válido.')
  }

  if (!reason.trim()) {
    throw new Error('Debes indicar un motivo.')
  }

  if (reason.length > 500) {
    throw new Error('El motivo no puede superar los 500 caracteres.')
  }

  const entry: BlacklistEntry = {
    addedBy,
    reason: reason.trim(),
    durationDays,
    createdAt: new Date(),
    expiresAt: calculateExpiration(durationDays)
  }

  let blacklist = await Blacklist.findOne({ discordId })

  if (!blacklist) {
    blacklist = new Blacklist({ discordId })
  }

  blacklist.set(type, entry)

  await blacklist.save()

  if (type === 'economy') {
    await updateEconomyRole(guild, discordId, true)
  }

  await notifyUser(guild.client, discordId, type, 'added', entry)

  return blacklist
}

/**
 * Actualiza una entrada de blacklist.
 */
export async function updateBlacklist(
  guild: Guild,
  discordId: string,
  type: BlacklistType,
  addedBy: string,
  reason: string,
  durationDays: BlacklistDuration | null
) {
  return addToBlacklist(
    guild,
    discordId,
    type,
    addedBy,
    reason,
    durationDays
  )
}

/**
 * Retira a un usuario de una categoría de blacklist.
 *
 * Si no tiene ninguna otra categoría, elimina el documento.
 */
export async function removeFromBlacklist(
  guild: Guild | null,
  discordId: string,
  type: BlacklistType,
  action: NotificationAction = 'removed',
  client?: Client
): Promise<boolean> {
  const blacklist = await Blacklist.findOne({ discordId })

  if (!blacklist || !blacklist[type]) {
    return false
  }

  const entry = blacklist[type]!

  blacklist.set(type, null)

  if (!blacklist.tournaments && !blacklist.economy) {
    await Blacklist.deleteOne({ _id: blacklist._id })
  } else {
    await blacklist.save()
  }

  if (type === 'economy') {
    await updateEconomyRole(guild, discordId, false)
  }

  const notificationClient = client ?? guild?.client

  if (notificationClient) {
    await notifyUser(
      notificationClient,
      discordId,
      type,
      action,
      entry
    )
  }

  return true
}

/**
 * Obtiene la blacklist de un usuario.
 *
 * Devuelve las dos categorías, aunque alguna haya expirado.
 */
export async function getUserBlacklist(discordId: string) {
  return Blacklist.findOne({ discordId })
}

/**
 * Obtiene los usuarios con una entrada activa en una categoría.
 */
export async function getBlacklist(type: BlacklistType) {
  const entries = await Blacklist.find({
    [type]: { $ne: null }
  }).sort({ [`${type}.createdAt`]: -1 })

  return entries.filter(blacklist =>
    isEntryActive(blacklist[type])
  )
}

/**
 * Comprueba que el usuario tenga el rol de blacklist de economía.
 */
export async function ensureEconomyRole(
  guild: Guild,
  discordId: string
): Promise<void> {
  await updateEconomyRole(guild, discordId, true)
}

/**
 * Elimina las entradas caducadas.
 *
 * Se ejecuta periódicamente desde clientReady.
 */
export async function expireBlacklist(client: Client): Promise<void> {
  const now = new Date()

  const expiredEntries = await Blacklist.find({
    $or: [
      {
        'tournaments.expiresAt': {
          $ne: null,
          $lte: now
        }
      },
      {
        'economy.expiresAt': {
          $ne: null,
          $lte: now
        }
      }
    ]
  })

  const guild = client.guilds.cache.first() ?? null

  for (const blacklist of expiredEntries) {
    for (const type of ['tournaments', 'economy'] as const) {
      const entry = blacklist[type]

      if (
        !entry ||
        entry.expiresAt === null ||
        entry.expiresAt.getTime() > now.getTime()
      ) {
        continue
      }

      try {
        await removeFromBlacklist(
          guild,
          blacklist.discordId,
          type,
          'expired',
          client
        )
      } catch (error) {
        // Si falla una categoría, se seguirá intentando con las demás.
        console.error(`[BLACKLIST] Error al caducar ${type}:`, error)
      }
    }
  }
}
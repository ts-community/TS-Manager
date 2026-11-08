import { ChannelType, type EmbedBuilder, type Guild, type Role, type ThreadChannel } from 'discord.js'
import { brawlStarsApiToken } from '../config/env'
import GuildModel from '../models/Guild'
import { getGuildConfig, setGuildConfigCache } from './guild'
import logger from '../utils/logger'

/** Foro de logs (los hilos tienen el formato "🗂️┇Nombre") */
export const LOGS_FORUM_ID = '1469667848128434286'
/** Canal de texto donde se registran los equipos inscritos */
export const TEAMS_LOG_CHANNEL_ID = '1568937013783036044'

export const VERIFIED_ROLE_NAME = 'Verificado TS Manager'
const VERIFICATION_THREAD_NAME = '🗂️┇Verificaciones'

async function saveConfig(update: Record<string, string>) {
  const config = await GuildModel.findOneAndUpdate({ guildId: (await getGuildConfig()).guildId }, { $set: update }, { new: true })
  if (config) setGuildConfigCache(config)
}

/** Devuelve el rol de verificado; si no existe (o lo borraron) lo crea y guarda su ID en la BD. */
export async function ensureVerifiedRole(guild: Guild): Promise<Role> {
  const config = await getGuildConfig()
  if (config.verifiedRoleId) {
    const role = await guild.roles.fetch(config.verifiedRoleId).catch(() => null)
    if (role) return role
  }

  const role =
    guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME) ??
    (await guild.roles.create({ name: VERIFIED_ROLE_NAME, mentionable: false, reason: 'Rol de verificación para inscripciones' }))

  await saveConfig({ verifiedRoleId: role.id })
  return role
}

/** Devuelve el hilo "Verificaciones" del foro de logs; si no existe lo crea y guarda su ID en la BD. */
async function ensureVerificationThread(guild: Guild): Promise<ThreadChannel | null> {
  const config = await getGuildConfig()
  if (config.verificationThreadId) {
    const thread = await guild.channels.fetch(config.verificationThreadId).catch(() => null)
    if (thread?.isThread()) {
      if (thread.archived) await thread.setArchived(false).catch(() => {})
      return thread
    }
  }

  const forum = await guild.channels.fetch(LOGS_FORUM_ID).catch(() => null)
  if (!forum || forum.type !== ChannelType.GuildForum) return null

  const thread = await forum.threads.create({
    name: VERIFICATION_THREAD_NAME,
    message: { content: 'Registro de usuarios verificados con `/verificar`.' },
    reason: 'Hilo de logs de verificaciones'
  })
  await saveConfig({ verificationThreadId: thread.id })
  return thread
}

export async function logVerification(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const thread = await ensureVerificationThread(guild)
    await thread?.send({ embeds: [embed], allowedMentions: { parse: [] } })
  } catch (error) {
    logger.error('No se pudo enviar el log de verificación', { reason: error instanceof Error ? error.message : 'Unknown error' })
  }
}

export async function logTeam(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const channel = await guild.channels.fetch(TEAMS_LOG_CHANNEL_ID).catch(() => null)
    if (channel?.isSendable()) await channel.send({ embeds: [embed], allowedMentions: { parse: [] } })
  } catch (error) {
    logger.error('No se pudo enviar el log de equipo', { reason: error instanceof Error ? error.message : 'Unknown error' })
  }
}

export interface BrawlPlayer {
  tag: string
  name: string
  trophies: number
}

/** "#abc", "abc", "#ABC 0" -> "#ABC0". Devuelve null si no tiene formato de tag. */
export function normalizePlayerTag(input: string): string | null {
  const tag = input.trim().toUpperCase().replace(/^#/, '').replace(/\s+/g, '').replace(/O/g, '0')
  return /^[0289PYLQGRJCUV]{3,12}$/.test(tag) ? `#${tag}` : null
}

/** Consulta el jugador en la API oficial. null = no existe; lanza error si la API falla. */
export async function fetchBrawlPlayer(tag: string): Promise<BrawlPlayer | null> {
  if (!brawlStarsApiToken) throw new Error('BRAWL_STARS_API_TOKEN no configurado')
  const response = await fetch(`https://api.brawlstars.com/v1/players/${encodeURIComponent(tag)}`, {
    headers: { Authorization: `Bearer ${brawlStarsApiToken}` }
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`API de Brawl Stars respondió ${response.status}`)
  const data = (await response.json()) as { tag: string; name: string; trophies: number }
  return { tag: data.tag, name: data.name, trophies: data.trophies ?? 0 }
}

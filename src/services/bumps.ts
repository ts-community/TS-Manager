import { recordContribution } from './staffTracking'
import {
  EmbedBuilder,
  type Client,
  type Message
} from 'discord.js'
import Bump, { type BumpService } from '../models/Bump'
import { guildId as defaultGuildId } from '../config/env'
import logger from '../utils/logger'

export const BUMP_SERVICES: Record<BumpService, { label: string, cooldownMs: number }> = {
  disboard: { label: 'Disboard', cooldownMs: 2 * 60 * 60 * 1000 },
  discadia: { label: 'Discadia', cooldownMs: 24 * 60 * 60 * 1000 }
}

// Rol que se menciona en el aviso y comando /bump de Disboard (mención clicable)
const BUMP_ROLE_ID = '1173666252686893077'
const DISBOARD_BUMP_COMMAND_ID = '947088344167366698'

const MENTION_REGEX = /<@!?(\d+)>/
const DISCADIA_URL_REGEX = /https?:\/\/(?:www\.)?discadia\.com\/[^\s<>"')]+/i

export function getPageUrl(message: Message, service: BumpService): string {
  if (service === 'disboard') return ''
  return getMessageText(message).match(DISCADIA_URL_REGEX)?.[0] ?? ''
}

export function getBumpService(message: Message): BumpService | null {
  if (!message.author.bot) return null
  const username = message.author.username.toLowerCase()
  if (username.includes('disboard')) return 'disboard'
  if (username.includes('discadia')) return 'discadia'
  return null
}

// Junta contenido + embeds + Components V2 (algunos bots ya no usan content/embeds)
function getMessageText(message: Message): string {
  let text = message.content || ''
  for (const embed of message.embeds) {
    text += ` ${embed.description || ''} ${embed.title || ''}`
  }
  if (message.components.length > 0) {
    try {
      text += ` ${JSON.stringify(message.components)}`
    } catch {
      // ignore serialization errors
    }
  }
  return text
}

// Auto-arreglo: no dependemos del texto exacto de Disboard/Discadia. Si el mensaje es la
// respuesta al comando /bump y no parece un error/cooldown, se cuenta como bump aunque cambie el formato.
const KNOWN_OK = /bump done|bump hecho|bump realizado|successfully bumped|server bumped|boost earned|\bbumped\./
const FAIL = /already bumped|bump again|please wait|wait another|try again|cooldown|espera|vuelve a intentar|ya se ha|not allowed|no tienes|error|failed|fall[oó]|\d+\s*(minutes?|minutos?|mins?|hours?|horas?|seconds?|segundos?)/

function isBumpCommand(message: Message): boolean {
  const meta = message.interactionMetadata as { name?: string } | null
  return (message.interaction?.commandName ?? meta?.name) === 'bump'
}

export function isBumpMessage(message: Message, service: BumpService): 'ok' | 'maybe' | null {
  const text = getMessageText(message).toLowerCase()
  if (!text.replace(/[\s"[\]{}]/g, '')) return null // vacío: llegará como edición
  if (FAIL.test(text)) return null
  if (KNOWN_OK.test(text)) return 'ok'
  // Formato desconocido: se valida contra el cooldown en handlePossibleBump
  return isBumpCommand(message) ? 'maybe' : null
}

export function getBumperId(message: Message): string | null {
  if (message.interactionMetadata) return message.interactionMetadata.user.id

  const match = message.content.match(MENTION_REGEX)
    ?? message.embeds.map(e => e.description?.match(MENTION_REGEX)).find(Boolean)
    ?? (message.components.length > 0 ? JSON.stringify(message.components).match(MENTION_REGEX) : null)

  return match?.[1] ?? null
}

// Mensajes ya registrados: Disboard a veces publica el bump y luego lo edita,
// así que el mismo mensaje puede llegar por messageCreate y por messageUpdate.
const procesados = new Set<string>()
function marcarProcesado(id: string): boolean {
  if (procesados.has(id)) return false
  procesados.add(id)
  if (procesados.size > 200) procesados.delete(procesados.values().next().value!)
  return true
}

/** Comprueba si un mensaje (nuevo o editado) es un bump y, si lo es, lo registra una sola vez. */
export async function handlePossibleBump(message: Message): Promise<void> {
  if (!message.guild) return
  const service = getBumpService(message)
  if (!service) return
  const result = isBumpMessage(message, service)
  if (!result) return
  const bumperId = getBumperId(message)
  if (!bumperId || !marcarProcesado(message.id)) return
  if (result === 'maybe') {
    const { label, cooldownMs } = BUMP_SERVICES[service]
    const text = getMessageText(message).slice(0, 200)
    // Un bump real es imposible antes de que acabe el cooldown: si llega antes, era un error
    const prev = await Bump.findOne({ service })
    if (prev && message.createdTimestamp - prev.bumpTime.getTime() < cooldownMs) {
      logger.warn(`Bumps: formato de ${label} desconocido descartado (dentro del cooldown)`, { text })
      return
    }
    logger.warn(`Bumps: formato de ${label} desconocido, aceptado como bump (respuesta a /bump)`, { text })
  }
  await registerBump(message, service, bumperId)
}

export async function registerBump(message: Message, service: BumpService, bumperId: string): Promise<void> {
  const { cooldownMs } = BUMP_SERVICES[service]

  // Si el bot indica el próximo bump (<t:X:R>), el aviso sale justo a esa hora
  let bumpTime = Date.now()
  const nextBump = message.content.match(/next bump <t:(\d+)(?::\w)?>/i)
  if (nextBump) bumpTime = Number(nextBump[1]) * 1000 - cooldownMs

  const pageUrl = getPageUrl(message, service)
  await Bump.findOneAndUpdate(
    { service },
    { lastBumperId: bumperId, channelId: message.channelId, bumpTime: new Date(bumpTime), notified: false, ...(pageUrl ? { pageUrl } : {}) },
    { upsert: true }
  )

  if (message.guild) await recordContribution(message.guild, bumperId, 'bumps', message.id, message.createdTimestamp)
    .catch(error => logger.error('Error en el seguimiento del bump', { error: String(error) }))

  if (!message.channel.isSendable()) return

  const nextBumpUnix = Math.floor((bumpTime + cooldownMs) / 1000)

  await message.channel.send({
    content: `¡Gracias por bumpear el servidor, <@${bumperId}>, se te recordara de nuevo <t:${nextBumpUnix}:R>!`,
    allowedMentions: { users: [bumperId] }
  })
}

export async function checkBumpReminders(client: Client): Promise<void> {
  for (const [service, { label, cooldownMs }] of Object.entries(BUMP_SERVICES) as [BumpService, typeof BUMP_SERVICES[BumpService]][]) {
    try {
      const bump = await Bump.findOne({ service, notified: false })
      if (!bump || Date.now() - bump.bumpTime.getTime() < cooldownMs) continue

      const channel = await client.channels.fetch(bump.channelId).catch(() => null)
      if (!channel?.isSendable()) continue

      const bumpGuildId = 'guildId' in channel ? String(channel.guildId) : defaultGuildId
      const bumpGuild = 'guild' in channel ? channel.guild ?? null : null
      const url = service === 'disboard'
        ? `https://disboard.org/es/server/${bumpGuildId}`
        : bump.pageUrl || 'https://discadia.com'
      const command = service === 'disboard'
        ? `</bump:${DISBOARD_BUMP_COMMAND_ID}>`
        : '`/bump`'

      const embed = new EmbedBuilder()
        .setTitle('¡Es hora de bumpear el servidor!')
        .setDescription(
          [
            `¡Es hora de bumpear nuestro servidor utilizando el comando ${command}!`,
            ...(service === 'disboard'
              ? [`\n-# ⭐ Valóranos en [Disboard](${url}) para ayudarnos a crecer como servidor.`]
              : [`\n-# ⭐ Vota por nosotros en [Discadia](${url}) para ayudarnos a crecer como servidor.`])
          ].join('\n')
        )
        .setURL(url)
        .setColor(0x9B4DFF)
        .setFooter({
          text: bumpGuild?.name ?? label,
          iconURL: bumpGuild?.iconURL({ size: 64 }) ?? bumpGuild?.iconURL() ?? undefined
        })
        .setTimestamp(new Date())

      await channel.send({
        content: `<@&${BUMP_ROLE_ID}>`,
        embeds: [embed],
        allowedMentions: { roles: [BUMP_ROLE_ID] }
      })

      bump.notified = true
      await bump.save()
    } catch (error) {
      logger.error(`Bumps: error comprobando el recordatorio de ${label}`, {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

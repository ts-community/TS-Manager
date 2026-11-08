import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'

import {
  ECONOMY_BLACKLIST_LOG_CHANNEL_ID,
  ECONOMY_COMMANDS,
  ensureEconomyRole,
  formatExpiry,
  getUserBlacklist,
  isEntryActive
} from '@/services/blacklist'

import logger from '@/utils/logger'

const PREFIXES = [',']

/**
 * Devuelve [usuario, comando] si el mensaje contiene
 * un comando de economía de otro bot o de un usuario.
 */
function detectEconomyCommand(
  message: Message
): { userId: string; command: string } | null {
  // Comandos slash ejecutados mediante otro bot.
  const meta = message.interactionMetadata

  if (message.author.bot && meta) {
    const command = (meta as { name?: string }).name
      ?.split(' ')[0]
      ?.toLowerCase()

    if (command && ECONOMY_COMMANDS.has(command)) {
      return {
        userId: meta.user.id,
        command
      }
    }

    return null
  }

  // Comandos con prefijo escritos por un usuario.
  if (!message.author.bot) {
    const content = message.content.trim().toLowerCase()

    const prefix = PREFIXES.find(p => content.startsWith(p))

    if (!prefix) return null

    const command = content
      .slice(prefix.length)
      .split(/\s+/)[0]

    if (ECONOMY_COMMANDS.has(command)) {
      return {
        userId: message.author.id,
        command
      }
    }
  }

  return null
}

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (!message.guild || message.author.id === client.user?.id) {
      return
    }

    const detected = detectEconomyCommand(message)

    if (!detected) return

    try {
      const blacklist = await getUserBlacklist(detected.userId)
      const entry = blacklist?.economy

      // Si ha caducado, no se aplican restricciones.
      // La entrada será limpiada por el intervalo.
      if (!entry || !isEntryActive(entry)) return

      // Si volvió al servidor sin el rol, se le devuelve.
      await ensureEconomyRole(message.guild, detected.userId)

      const channel = await client.channels
        .fetch(ECONOMY_BLACKLIST_LOG_CHANNEL_ID)
        .catch(() => null)

      if (!channel?.isSendable()) return

      await channel.send({
        content:
          `@everyone\n` +
          `⚠️ <@${detected.userId}> ha usado \`${detected.command}\` ` +
          `en <#${message.channelId}> estando en la blacklist de economía.\n` +
          `**Motivo:** ${entry.reason}\n` +
          `**Expira:** ${formatExpiry(entry.expiresAt)}\n` +
          `**Mensaje:** ${message.url}`,
        allowedMentions: {
          parse: ['everyone']
        }
      })
    } catch (error) {
      logger.error('Blacklist economía: error procesando mensaje', {
        message: error instanceof Error
          ? error.message
          : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>
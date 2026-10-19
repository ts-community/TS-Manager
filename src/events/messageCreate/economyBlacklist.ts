import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import EconomyBlacklist from '../../models/EconomyBlacklist'
import {
  ECONOMY_BLACKLIST_LOG_CHANNEL_ID,
  ECONOMY_BLACKLIST_ROLE_ID,
  ECONOMY_COMMANDS,
  formatExpiry
} from '../../services/economyBlacklist'
import logger from '../../utils/logger'

const PREFIXES = ['!', '.']

// Devuelve [usuario, comando] si el mensaje es un comando de economía de otro bot
function detectEconomyCommand(message: Message): { userId: string; command: string } | null {
  // Slash commands: la respuesta del bot de economía lleva la info de quién lo ejecutó
  const meta = message.interactionMetadata
  if (message.author.bot && meta) {
    const command = (meta as { name?: string }).name?.split(' ')[0]?.toLowerCase()
    if (command && ECONOMY_COMMANDS.has(command)) return { userId: meta.user.id, command }
    return null
  }

  // Comandos con prefijo escritos por un usuario
  if (!message.author.bot) {
    const content = message.content.trim().toLowerCase()
    const prefix = PREFIXES.find(p => content.startsWith(p))
    if (!prefix) return null
    const command = content.slice(prefix.length).split(/\s+/)[0]
    if (ECONOMY_COMMANDS.has(command)) return { userId: message.author.id, command }
  }

  return null
}

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (!message.guild || message.author.id === client.user?.id) return

    const detected = detectEconomyCommand(message)
    if (!detected) return

    try {
      const entry = await EconomyBlacklist.findOne({ guildId: message.guild.id, userId: detected.userId })
      if (!entry) return

      // Caducada y aún no limpiada por el intervalo: se ignora
      if (entry.expiresAt && entry.expiresAt.getTime() <= Date.now()) return

      // Si volvió al servidor sin el rol, se le devuelve
      const member = await message.guild.members.fetch(detected.userId).catch(() => null)
      if (member && !member.roles.cache.has(ECONOMY_BLACKLIST_ROLE_ID)) {
        await member.roles.add(ECONOMY_BLACKLIST_ROLE_ID, 'Blacklist de economía').catch(() => {})
      }

      const channel = await client.channels.fetch(ECONOMY_BLACKLIST_LOG_CHANNEL_ID).catch(() => null)
      if (!channel?.isSendable()) return

      await channel.send({
        content:
          `⚠️ <@${detected.userId}> ha usado \`${detected.command}\` en <#${message.channelId}> estando en la blacklist de economía.\n` +
          `**Motivo:** ${entry.reason}\n` +
          `**Expira:** ${formatExpiry(entry.expiresAt)}\n` +
          `**Mensaje:** ${message.url}`,
        allowedMentions: { parse: [] }
      })
    } catch (error) {
      logger.error('Blacklist economía: error procesando mensaje', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>

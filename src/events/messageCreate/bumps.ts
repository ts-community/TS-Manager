import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import { getBumpService, isBumpMessage, getBumperId, registerBump } from '../../services/bumps'
import logger from '../../utils/logger'

// Detecta el bump de Disboard/Discadia, lo registra y da las gracias
export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (!message.guild) return

    const service = getBumpService(message)
    if (!service || !isBumpMessage(message, service)) return

    const bumperId = getBumperId(message)
    if (!bumperId) return

    try {
      await registerBump(message, service, bumperId)
    } catch (error) {
      logger.error('Bumps: error registrando el bump', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>

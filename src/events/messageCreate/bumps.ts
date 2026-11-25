import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import { handlePossibleBump } from '../../services/bumps'
import logger from '../../utils/logger'

// Detecta el bump de Disboard/Discadia cuando el mensaje llega ya completo
export default {
  async execute(message: Message, _client: Client): Promise<void> {
    try {
      await handlePossibleBump(message)
    } catch (error) {
      logger.error('Bumps: error registrando el bump', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>

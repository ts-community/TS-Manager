import type { Client, Message, PartialMessage } from 'discord.js'
import type { Event } from '../../types/events'
import { handlePossibleBump } from '../../services/bumps'
import logger from '../../utils/logger'

// Disboard responde primero con un mensaje vacío ("pensando…") y después lo edita
// con "Bump done!". Ese texto solo llega como edición, por eso escuchamos también aquí.
export default {
  async execute(_old: Message | PartialMessage, updated: Message | PartialMessage, _client: Client): Promise<void> {
    try {
      if (!updated.author?.bot && !updated.partial) return
      const message = updated.partial ? await updated.fetch().catch(() => null) : updated
      if (!message) return
      await handlePossibleBump(message)
    } catch (error) {
      logger.error('Bumps: error registrando el bump (edición)', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageUpdate'>

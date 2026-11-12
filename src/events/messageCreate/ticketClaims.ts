import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import { applyTicketClaim, parseClaimMessage } from '../../services/ticketClaims'
import logger from '../../utils/logger'

// Cuando Guild Manager avisa de que alguien reclama o libera un ticket, ajusta quién puede escribir
export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (!message.guild) return
    const event = parseClaimMessage(message)
    if (!event) return

    try {
      await applyTicketClaim(message, event)
    } catch (error) {
      logger.error('Tickets: no se pudieron ajustar los permisos de la reclamación', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>

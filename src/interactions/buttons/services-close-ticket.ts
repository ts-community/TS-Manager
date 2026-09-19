import type { ButtonHandler } from '../../types/interactions'
import { closeServiceTicket } from '../../services/tickets'

export default {
  customId: 'services-close-ticket',

  async execute(interaction) {
    await closeServiceTicket(interaction)
  }
} satisfies ButtonHandler
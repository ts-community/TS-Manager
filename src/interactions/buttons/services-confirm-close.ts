import type { ButtonHandler } from '../../types/interactions'
import { confirmServiceTicketClose } from '../../services/tickets'

export default {
  customId: 'services-confirm-close',

  async execute(interaction) {
    await confirmServiceTicketClose(interaction)
  }
} satisfies ButtonHandler

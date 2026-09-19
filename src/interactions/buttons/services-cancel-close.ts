import type { ButtonHandler } from '../../types/interactions'
import { cancelServiceTicketClose } from '../../services/tickets'

export default {
  customId: 'services-cancel-close',

  async execute(interaction) {
    await cancelServiceTicketClose(interaction)
  }
} satisfies ButtonHandler

import type { ButtonHandler } from '../../types/interactions'
import { advanceTicketPhase } from '../../services/tickets'

export default {
  customId: 'services-phase',

  async execute(interaction) {
    const action = interaction.customId.split(':')[1]
    if (action !== 'start' && action !== 'review' && action !== 'deliver') return
    await advanceTicketPhase(interaction, action)
  }
} satisfies ButtonHandler

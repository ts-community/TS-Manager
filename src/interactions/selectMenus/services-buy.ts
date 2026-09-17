import type { SelectMenuHandler } from '../../types/interactions'
import { createServiceTicket } from '../../services/services'

export default {
  customId: 'services-buy',

  async execute(interaction) {
    const service = interaction.values[0]
    if (service !== 'discord' && service !== 'web') return
    await createServiceTicket(interaction, service)
  }
} satisfies SelectMenuHandler
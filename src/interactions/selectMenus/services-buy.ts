import type { SelectMenuHandler } from '../../types/interactions'
import { openBriefingRequest } from '../../services/tickets'

export default {
  customId: 'services-buy',

  async execute(interaction) {
    const service = interaction.values[0]
    if (service !== 'discord' && service !== 'web') return
    await openBriefingRequest(interaction, service)
  }
} satisfies SelectMenuHandler
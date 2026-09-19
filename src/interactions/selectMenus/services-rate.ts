import type { SelectMenuHandler } from '../../types/interactions'
import { handleRateService } from '../../services/tickets'

export default {
  customId: 'services-rate',

  async execute(interaction) {
    await handleRateService(interaction)
  }
} satisfies SelectMenuHandler

import type { SelectMenuHandler } from '../../types/interactions'
import { showServiceInfo } from '../../services/services'

export default {
  customId: 'services-info',

  async execute(interaction) {
    const service = interaction.values[0]
    if (service !== 'discord' && service !== 'web') return
    await showServiceInfo(interaction, service)
  }
} satisfies SelectMenuHandler
import type { SelectMenuHandler } from '../../types/interactions'
import { showServiceInfo, type InfoTopic } from '../../services/services'

const TOPICS: InfoTopic[] = ['discord', 'web', 'terminos', 'faq']

export default {
  customId: 'services-info',

  async execute(interaction) {
    const topic = interaction.values[0]
    if (!(TOPICS as string[]).includes(topic)) return
    await showServiceInfo(interaction, topic as InfoTopic)
  }
} satisfies SelectMenuHandler
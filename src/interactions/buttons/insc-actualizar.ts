import type { ButtonInteraction } from 'discord.js'
import { updateAccounts } from '../../services/inscriptions'

export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return
    await interaction.deferReply({ ephemeral: true })
    const result = await updateAccounts(interaction.member)
    await interaction.editReply({ content: result.content, allowedMentions: { parse: [] } })
  }
}

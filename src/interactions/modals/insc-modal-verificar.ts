import type { ModalSubmitInteraction } from 'discord.js'
import { verifyMember } from '../../services/inscriptions'

export default {
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return
    await interaction.deferReply({ ephemeral: true })
    const result = await verifyMember(interaction.member, interaction.fields.getTextInputValue('tag'))
    await interaction.editReply({ content: result.content })
  }
}

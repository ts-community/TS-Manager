import type { ModalSubmitInteraction } from 'discord.js'
import { registerTeam } from '../../services/inscriptions'

export default {
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return
    await interaction.deferReply({ ephemeral: true })
    const result = await registerTeam(
      interaction.member,
      interaction.fields.getTextInputValue('nombre'),
      [...interaction.fields.getSelectedUsers('titulares', true).values()],
      [...(interaction.fields.getSelectedUsers('suplentes')?.values() ?? [])]
    )
    await interaction.editReply({ content: result.content, embeds: result.embeds ?? [] })
  }
}

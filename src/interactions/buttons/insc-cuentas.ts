import type { ButtonInteraction } from 'discord.js'
import { accountsPayload } from '../../services/inscriptions'

export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return
    await interaction.deferReply({ ephemeral: true })
    await interaction.editReply(await accountsPayload(interaction.member))
  }
}

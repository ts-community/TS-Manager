import type { StringSelectMenuInteraction } from 'discord.js'
import { accountsPayload, unlinkAccount } from '../../services/inscriptions'

export default {
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return
    await interaction.deferUpdate()
    const result = await unlinkAccount(interaction.member, interaction.values[0])
    const payload = await accountsPayload(interaction.member)
    await interaction.editReply({ ...payload, content: `${result.content}${payload.content ? `\n\n${payload.content}` : ''}` })
  }
}

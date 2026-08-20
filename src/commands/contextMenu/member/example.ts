import { ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder } from 'discord.js'
import type { ContextMenuCommand } from '../../../types/commands'

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Example')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setDescription('This is an example context menu command.')

    await interaction.reply({ embeds: [embed], ephemeral: true })
  }
} satisfies ContextMenuCommand
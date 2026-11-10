import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import type { ButtonHandler } from '../../types/interactions'
import { refreshMemberRoles } from '../../services/verification'

export default {
  customId: 'verification',

  async execute(interaction) {
    if (interaction.customId === 'verification:verify') {
      const modal = new ModalBuilder()
        .setCustomId('verification:submit')
        .setTitle('Verificar cuenta de Brawl Stars')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('tag')
              .setLabel('Tag de Brawl Stars')
              .setPlaceholder('#2PQ8LGY0')
              .setStyle(TextInputStyle.Short)
              .setMinLength(3)
              .setMaxLength(15)
              .setRequired(true)
          )
        )

      await interaction.showModal(modal)
      return
    }

    if (interaction.customId === 'verification:refresh') {
      await refreshMemberRoles(interaction)
    }
  }
} satisfies ButtonHandler

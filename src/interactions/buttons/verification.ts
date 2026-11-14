import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js'
import type { ButtonHandler } from '../../types/interactions'
import {
  buildVerificationSummaryView,
  refreshMemberRoles
} from '../../services/verification'
import logger from '../../utils/logger'

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
      return
    }

    if (!interaction.customId.startsWith('verification:summary')) return

    const guild = interaction.guild

    if (!guild) {
      await interaction.reply({ content: 'Esta acción solo funciona dentro del servidor.', ephemeral: true })
      return
    }

    const [, , view = 'summary', rawPage = '0'] = interaction.customId.split(':')
    const parsedPage = Number.parseInt(rawPage, 10)
    const page = Number.isFinite(parsedPage) ? parsedPage : 0

    await interaction.deferUpdate()

    try {
      const payload =
        (await buildVerificationSummaryView(view, guild, page)) ??
        (await buildVerificationSummaryView('summary', guild))

      if (payload) await interaction.editReply(payload)
    } catch (error) {
      logger.error('No se pudo cargar la vista del resumen de verificación', {
        view,
        page,
        user: interaction.user.id,
        reason: error instanceof Error ? error.message : 'Unknown error'
      })

      await interaction.followUp({
        content: 'No se pudo cargar esta vista. Inténtalo de nuevo.',
        ephemeral: true
      }).catch(() => {})
    }
  }
} satisfies ButtonHandler

import type { ButtonHandler } from '../../types/interactions'
import { reviewCommentModal } from '../../services/tickets'

export default {
  customId: 'services-review-comment',

  async execute(interaction) {
    await interaction.showModal(reviewCommentModal())
  }
} satisfies ButtonHandler

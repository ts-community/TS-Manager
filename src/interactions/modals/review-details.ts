import type { ModalHandler } from '../../types/interactions'
import { handleReviewDetailsSubmit } from '../../services/tickets'

export default {
  customId: 'review-details',

  async execute(interaction) {
    await handleReviewDetailsSubmit(interaction)
  }
} satisfies ModalHandler

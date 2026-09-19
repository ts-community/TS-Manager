import type { ModalHandler } from '../../types/interactions'
import { handleReviewCommentSubmit } from '../../services/tickets'

export default {
  customId: 'review-comment',

  async execute(interaction) {
    await handleReviewCommentSubmit(interaction)
  }
} satisfies ModalHandler

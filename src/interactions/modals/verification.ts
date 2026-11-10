import type { ModalHandler } from '../../types/interactions'
import { handleVerificationModal } from '../../services/verification'

export default {
  customId: 'verification',

  async execute(interaction) {
    await handleVerificationModal(interaction)
  }
} satisfies ModalHandler

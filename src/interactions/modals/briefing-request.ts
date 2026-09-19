import type { ModalHandler } from '../../types/interactions'
import { handleBriefingRequestSubmit } from '../../services/tickets'

export default {
  customId: 'briefing-request',

  async execute(interaction) {
    await handleBriefingRequestSubmit(interaction)
  }
} satisfies ModalHandler

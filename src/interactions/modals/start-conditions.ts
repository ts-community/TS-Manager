import type { ModalHandler } from '../../types/interactions'
import { handleStartConditionsSubmit } from '../../services/tickets'

export default {
  customId: 'start-conditions',

  async execute(interaction) {
    await handleStartConditionsSubmit(interaction)
  }
} satisfies ModalHandler

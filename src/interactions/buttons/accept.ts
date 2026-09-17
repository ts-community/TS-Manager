import type { ButtonHandler } from '../../types/interactions'
import { showPostulacionModal } from '../../services/postulaciones'

export default {
  customId: 'accept',

  async execute(interaction) {
    await showPostulacionModal(interaction, 'accept')
  }
} satisfies ButtonHandler

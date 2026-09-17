import type { ButtonHandler } from '../../types/interactions'
import { showPostulacionModal } from '../../services/postulaciones'

export default {
  customId: 'decline',

  async execute(interaction) {
    await showPostulacionModal(interaction, 'decline')
  }
} satisfies ButtonHandler

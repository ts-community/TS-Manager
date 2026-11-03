import type { ModalHandler } from '../../types/interactions'
import { handlePostulacionSubmit } from '../../services/postulaciones'

export default {
  customId: 'postulacion',

  async execute(interaction) {
    await handlePostulacionSubmit(interaction)
  }
} satisfies ModalHandler

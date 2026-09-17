import type { ModalHandler } from '../../types/interactions'
import { handlePostulacionSubmit } from '../../services/postulaciones'

export default {
  // Coincide con `postulacion:<accept|decline>:<userId>` (el router parte por ':')
  customId: 'postulacion',

  async execute(interaction) {
    await handlePostulacionSubmit(interaction)
  }
} satisfies ModalHandler

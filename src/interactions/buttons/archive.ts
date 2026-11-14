
import type { ButtonHandler } from '../../types/interactions'
import { handlePostulacionArchive } from '../../services/postulaciones'

export default {
  customId: 'archive',

  async execute(interaction) {
    await handlePostulacionArchive(interaction, 'archive')
  }
} satisfies ButtonHandler

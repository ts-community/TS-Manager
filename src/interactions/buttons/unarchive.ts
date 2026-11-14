
import type { ButtonHandler } from '../../types/interactions'
import { handlePostulacionArchive } from '../../services/postulaciones'

export default {
  customId: 'unarchive',

  async execute(interaction) {
    await handlePostulacionArchive(interaction, 'unarchive')
  }
} satisfies ButtonHandler

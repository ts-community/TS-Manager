import type { ButtonInteraction } from 'discord.js'
import { buildNoticePayload } from '../../services/asociaciones'

// CustomId: asoc-btn-eliminar-cancelar:{asociacionId}
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.update(buildNoticePayload('✖️ Eliminación cancelada.') as never)
  }
}

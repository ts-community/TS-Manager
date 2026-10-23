import type { ButtonInteraction } from 'discord.js'
import { buildMessageCard } from '../../services/asociaciones'

// CustomId: asoc-btn-eliminar-cancelar:{asociacionId}
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.update(buildMessageCard('❌ Eliminación cancelada.', { color: 0x95A5A6 }) as never)
  }
}

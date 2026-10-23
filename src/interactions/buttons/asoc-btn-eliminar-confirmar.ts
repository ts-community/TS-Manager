import type { ButtonInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { buildNoticePayload, capitalizeName, schedulePanelsSync } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-btn-eliminar-confirmar:{asociacionId} — elimina (solo staff)
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede eliminar asociaciones.' })
    }

    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) {
      return void interaction.update(buildNoticePayload('La asociación ya no existe.') as never)
    }

    const deleted = await Asociacion.findByIdAndDelete(asociacion.id)
    schedulePanelsSync(interaction.client)

    const content = deleted
      ? `🗑️ La asociación **${capitalizeName(deleted.servidor)}** ha sido eliminada.`
      : 'La asociación ya no existía.'

    await interaction.update(buildNoticePayload(content) as never)
  }
}

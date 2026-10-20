import type { ButtonInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { buildEditorPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-btn-editar:{asociacionId} — abre el editor de campos (solo staff)
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.', ephemeral: true })
    }

    await interaction.update(buildEditorPayload(asociacion))
  }
}

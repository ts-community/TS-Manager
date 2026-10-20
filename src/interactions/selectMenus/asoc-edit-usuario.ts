import type { UserSelectMenuInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { schedulePanelsSync } from '../../services/asociacionesPanel'
import { buildEditorPayload } from '../../services/asociacionesEditor'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-edit-usuario:{campo}:{asociacionId} — campo: representante | staff-encargado
export default {
  async execute(interaction: UserSelectMenuInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.', ephemeral: true })
    }

    const [, campo, asociacionId] = interaction.customId.split(':')
    const asociacion = await Asociacion.findById(asociacionId)
    if (!asociacion || !campo) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    const usuarioId = interaction.values[0]
    if (campo === 'representante') asociacion.representanteId = usuarioId
    else if (campo === 'staff-encargado') asociacion.staffEncargadoId = usuarioId

    await asociacion.save()
    schedulePanelsSync(interaction.client)
    await interaction.update(buildEditorPayload(asociacion))
  }
}

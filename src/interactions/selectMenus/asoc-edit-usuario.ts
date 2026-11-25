import { persistAssociation } from '../../services/associationOperations'
import type { UserSelectMenuInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { schedulePanelsSync, buildEditorPayload } from '../../services/asociaciones'
import { staffRank } from '../../services/permissions'

// CustomId: asoc-edit-usuario:{campo}:{asociacionId} — campo: representante | staff-encargado
export default {
  async execute(interaction: UserSelectMenuInteraction): Promise<void> {
    if (!(await staffRank(interaction)).instructor) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.' })
    }

    const [, campo, asociacionId] = interaction.customId.split(':')
    const asociacion = await Asociacion.findById(asociacionId)
    if (!asociacion || !campo) return void interaction.reply({ content: 'Esta asociación ya no existe.' })

    const usuarioId = interaction.values[0]
    if (campo === 'representante') asociacion.representanteId = usuarioId
    else if (campo === 'staff-encargado') asociacion.staffEncargadoId = usuarioId

    await persistAssociation(asociacion,interaction.guild!,interaction.user.id,interaction.id)

    await interaction.update(buildEditorPayload(asociacion, { canDelete: true }))
  }
}

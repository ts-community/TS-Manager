import { persistAssociation } from '../../services/associationOperations'
import type { ModalSubmitInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { addDays } from '../../services/asociaciones'
import { schedulePanelsSync, buildEditorPayload } from '../../services/asociaciones'
import { staffRank } from '../../services/permissions'

// CustomId: asoc-modal-renovacion:{asociacionId}
export default {
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    if (!(await staffRank(interaction)).instructor) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.' })
    }

    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.' })

    const dias = parseInt(interaction.fields.getTextInputValue('dias').trim(), 10)
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
      return void interaction.reply({ content: 'Introduce un número de días válido (1-365).' })
    }

    asociacion.renovacionDias = dias
    asociacion.nextRenovationDate = addDays(new Date(asociacion.lastRenovationDate as Date), dias)
    asociacion.renovacionAvisada = false
    await persistAssociation(asociacion,interaction.guild!,interaction.user.id,interaction.id)

    if (interaction.isFromMessage()) return void interaction.update(buildEditorPayload(asociacion, { canDelete: true }))
    await interaction.reply({ content: `Frecuencia actualizada a **cada ${dias} días**.` })
  }
}

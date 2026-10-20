import type { ModalSubmitInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { addDays } from '../../services/asociaciones'
import { schedulePanelsSync, buildEditorPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-modal-renovacion:{asociacionId}
export default {
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.', ephemeral: true })
    }

    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    const dias = parseInt(interaction.fields.getTextInputValue('dias').trim(), 10)
    if (!Number.isFinite(dias) || dias < 1 || dias > 9999) {
      return void interaction.reply({ content: 'Introduce un número de días válido (1-9999).', ephemeral: true })
    }

    asociacion.renovacionDias = dias
    asociacion.nextRenovationDate = addDays(new Date(asociacion.lastRenovationDate as Date), dias)
    asociacion.renovacionAvisada = false
    await asociacion.save()
    schedulePanelsSync(interaction.client)
    if (interaction.isFromMessage()) return void interaction.update(buildEditorPayload(asociacion))
    await interaction.reply({ content: `Frecuencia actualizada a **cada ${dias} días**.`, ephemeral: true })
  }
}

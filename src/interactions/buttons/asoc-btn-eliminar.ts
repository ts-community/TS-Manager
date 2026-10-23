import type { ButtonInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { buildRemoveConfirmPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-btn-eliminar:{asociacionId} — crea mensaje público de confirmación (solo staff)
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.' })

    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede eliminar asociaciones.' })
    }

    const confirm = buildRemoveConfirmPayload(asociacion)
    await interaction.followUp(confirm as never)
  }
}

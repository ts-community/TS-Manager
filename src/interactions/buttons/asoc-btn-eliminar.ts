import type { ButtonInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { buildRemoveConfirmPayload } from '../../services/asociacionesEditor'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-btn-eliminar:{asociacionId} — crea mensaje público de confirmación (solo admins)
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede eliminar asociaciones.', ephemeral: true })
    }

    const confirm = buildRemoveConfirmPayload(asociacion)
    // Mensaje público, sin ephemeral
    await interaction.followUp({ embeds: confirm.embeds as never, components: confirm.components })
  }
}

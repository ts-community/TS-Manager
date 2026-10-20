import { PermissionFlagsBits, type ButtonInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { buildAssociationDetailPayload } from '../../services/asociacionesPanel'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-btn-ver:{asociacionId} — vuelve a la tarjeta de detalle
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    await interaction.update(buildAssociationDetailPayload(asociacion, {
      canEdit: await hasPermission(interaction, 'staff'),
      canDelete: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
    }))
  }
}

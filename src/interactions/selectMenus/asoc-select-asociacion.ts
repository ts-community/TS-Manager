import { PermissionFlagsBits, type StringSelectMenuInteraction } from 'discord.js'
import Asociacion, { type AsociacionDocument } from '../../models/Asociacion'
import { buildAssociationDetailPayload } from '../../services/asociacionesPanel'
import { hasPermission } from '../../services/permissions'

// Submenu "detallar una asociación" — CustomId: asoc-select-asociacion (StringSelect)
export default {
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    const asociacionId = interaction.values[0]
    const asociacion: AsociacionDocument | null = await Asociacion.findById(asociacionId)
    if (!asociacion) {
      return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })
    }

    const canEdit = await hasPermission(interaction, 'staff')
    const canDelete = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false

    await interaction.update(buildAssociationDetailPayload(asociacion, { canEdit, canDelete }))
  }
}

import type { StringSelectMenuInteraction } from 'discord.js'
import Asociacion, { type AsociacionDocument } from '../../models/Asociacion'
import { buildAssociationDetailPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// Submenu "detallar una asociación" — CustomId: asoc-select-asociacion (StringSelect)
export default {
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede consultar las asociaciones.' })
    }

    const asociacionId = interaction.values[0]
    const asociacion: AsociacionDocument | null = await Asociacion.findById(asociacionId)
    if (!asociacion) {
      return void interaction.reply({ content: 'Esta asociación ya no existe.' })
    }

    await interaction.update(buildAssociationDetailPayload(asociacion))
  }
}

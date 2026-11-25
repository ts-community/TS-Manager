import type { StringSelectMenuInteraction } from 'discord.js'
import Asociacion, { type AsociacionDocument } from '../../models/Asociacion'
import { buildAssociationDetailPayload } from '../../services/asociaciones'
import { staffRank } from '../../services/permissions'

// Submenu "detallar una asociación" — CustomId: asoc-select-asociacion (StringSelect)
export default {
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!(await staffRank(interaction)).staff) {
      await interaction.reply({ content: 'Solo el staff puede consultar las asociaciones.' })
      return
    }

    const asociacionId = interaction.values[0]
    const asociacion: AsociacionDocument | null = await Asociacion.findById(asociacionId)
    if (!asociacion) {
      await interaction.reply({ content: 'Esta asociación ya no existe.' })
      return
    }

    const manage=(await staffRank(interaction)).instructor
    await interaction.update(buildAssociationDetailPayload(asociacion, { canEdit: manage, canDelete: manage }))
  }
}

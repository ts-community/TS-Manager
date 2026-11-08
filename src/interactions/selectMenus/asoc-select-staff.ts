import {
  StringSelectMenuBuilder,
  type UserSelectMenuInteraction
} from 'discord.js'
import Asociacion from '../../models/Asociacion'
import {
  EMOJI,
  buildAssociationDetailPayload,
  buildAssociationsListPayload,
  buildMessageCard,
  capitalizeName
} from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// Menú "por staff": CustomId: asoc-select-staff (UserSelect); eligible staff → sus asociaciones
export default {
  async execute(interaction: UserSelectMenuInteraction): Promise<void> {
    if (interaction.customId !== 'asoc-select-staff') return

    if (!await hasPermission(interaction, 'staff')) {
      await interaction.reply({ content: 'Solo el staff puede consultar las asociaciones.' })
      return
    }

    const memberId = interaction.values[0]
    const perfil = await interaction.guild?.members.fetch(memberId).catch(() => null)

    const asociaciones = await Asociacion.find({ staffEncargadoId: memberId }).sort({ servidor: 1 })
    if (!asociaciones.length) {
      await interaction.update(buildMessageCard(
        `## ${EMOJI.asociacion} Sin asociaciones\n\n${perfil?.displayName ?? `<@${memberId}>`} no gestiona ninguna asociación actualmente.`
      ))
      return
    }

    if (asociaciones.length === 1) {
      await interaction.update(buildAssociationDetailPayload(asociaciones[0], { canEdit: true, canDelete: true }))
      return
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('asoc-select-asociacion')
      .setPlaceholder('Selecciona una asociación para ver su información')
    for (const a of asociaciones.slice(0, 25)) {
      menu.addOptions({ label: capitalizeName(a.servidor).slice(0, 100), value: a.id })
    }

    await interaction.update(buildAssociationsListPayload(asociaciones, {
      title: `Asociaciones de ${perfil?.displayName ?? 'staff'}`,
      menu
    }))
  }
}

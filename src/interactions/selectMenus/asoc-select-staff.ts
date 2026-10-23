import {
  StringSelectMenuBuilder,
  type UserSelectMenuInteraction
} from 'discord.js'
import Asociacion from '../../models/Asociacion'
import {
  EMOJI,
  buildAssociationDetailPayload,
  buildAssociationsListPayload,
  capitalizeName,
  greenEmbed
} from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// Menú "por staff": CustomId: asoc-select-staff (UserSelect); eligible staff → sus asociaciones
export default {
  async execute(interaction: UserSelectMenuInteraction): Promise<void> {
    if (interaction.customId !== 'asoc-select-staff') return

    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede consultar las asociaciones.' })
    }

    const memberId = interaction.values[0]
    const perfil = await interaction.guild?.members.fetch(memberId).catch(() => null)

    const asociaciones = await Asociacion.find({ staffEncargadoId: memberId }).sort({ servidor: 1 })
    if (!asociaciones.length) {
      return void interaction.update({
        embeds: [greenEmbed()
          .setTitle(`${EMOJI.asociacion} Sin asociaciones`)
          .setDescription(`${perfil?.displayName ?? `<@${memberId}>`} no gestiona ninguna asociación actualmente.`)
          .setTimestamp()],
        components: []
      })
    }

    if (asociaciones.length === 1) {
      return void interaction.update(buildAssociationDetailPayload(asociaciones[0], { canEdit: true, canDelete: true }))
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('asoc-select-asociacion')
      .setPlaceholder('Selecciona una asociación para ver su información')
    for (const a of asociaciones.slice(0, 25)) {
      menu.addOptions({ label: capitalizeName(a.servidor).slice(0, 100), value: a.id })
    }

    await interaction.update(buildAssociationsListPayload(asociaciones, {
      title: `Asociaciones de ${perfil?.displayName ?? 'staff'}`,
      subtitle: `${asociaciones.length} asociaciones`,
      menu
    }))
  }
}

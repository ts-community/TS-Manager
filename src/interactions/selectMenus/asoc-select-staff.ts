import {
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type UserSelectMenuInteraction
} from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { ASOCIACIONES_COLOR, EMOJI, unix } from '../../services/asociaciones'
import { buildAssociationDetailPayload } from '../../services/asociacionesPanel'

// Menú "por staff": CustomId: asoc-select-staff (UserSelect); eligible staff → sus asociaciones
export default {
  async execute(interaction: UserSelectMenuInteraction): Promise<void> {
    if (interaction.customId !== 'asoc-select-staff') return
    const memberId = interaction.values[0]
    const perfil = await interaction.guild?.members.fetch(memberId).catch(() => null)

    const asociaciones = await Asociacion.find({ staffEncargadoId: memberId }).sort({ servidor: 1 })
    if (!asociaciones.length) {
      return void interaction.update({
        embeds: [new EmbedBuilder().setColor(ASOCIACIONES_COLOR)
          .setTitle(`${EMOJI.asociacion} Sin asociaciones`)
          .setDescription(`${perfil?.displayName ?? `<@${memberId}>`} no gestiona ninguna asociación actualmente.`)
          .setTimestamp()],
        components: []
      })
    }

    if (asociaciones.length === 1) {
      const unique = asociaciones[0]
      return void interaction.update(buildAssociationDetailPayload(unique, {
        canEdit: true,
        canDelete: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
      }))
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('asoc-select-asociacion')
      .setPlaceholder('Selecciona una asociación para verla')
    for (const a of asociaciones.slice(0, 25)) {
      menu.addOptions({ label: a.servidor, value: a.id })
    }

    const embed = new EmbedBuilder().setColor(ASOCIACIONES_COLOR)
      .setTitle(`${EMOJI.staff} Asociaciones de ${perfil?.displayName ?? 'staff'}`)
      .setDescription(
        asociaciones
          .slice(0, 25)
          .map(a => {
            const next = unix(a.nextRenovationDate)
            return `**${a.servidor}** (<#${a.canalId}>)\n` +
              `⏱️ Frecuencia: ${a.renovacionDias} días · 📅 Próxima renovación: <t:${next}:R>`
          })
          .join('\n\n') +
        (asociaciones.length > 25 ? `\n-# Mostrando 25 de ${asociaciones.length} asociaciones` : '')
      )
      .setTimestamp()

    await interaction.update({
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
    })
  }
}

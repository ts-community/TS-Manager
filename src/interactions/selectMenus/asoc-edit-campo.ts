import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type StringSelectMenuInteraction
} from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { schedulePanelsSync } from '../../services/asociacionesPanel'
import { buildEditorPayload } from '../../services/asociacionesEditor'
import { hasPermission } from '../../services/permissions'

// Editor de campos de una asociación (solo staff). CustomId: asoc-edit-campo:{asociacionId}
export default {
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    const asociacionId = interaction.customId.split(':')[1]
    const campo = interaction.values[0]
    const asociacion = await Asociacion.findById(asociacionId)
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.', ephemeral: true })
    }

    switch (campo) {
      case 'nombre': {
        const modal = new ModalBuilder()
          .setCustomId(`asoc-modal-nombre:${asociacion.id}`)
          .setTitle('Nombre de la asociación')
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('nombre')
              .setLabel('Nuevo nombre (mayúsculas correctas)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(64)
              .setValue(asociacion.servidor)
          ))
        return void interaction.showModal(modal)
      }
      case 'renovacion': {
        const modal = new ModalBuilder()
          .setCustomId(`asoc-modal-renovacion:${asociacion.id}`)
          .setTitle('Frecuencia de renovación')
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('dias')
              .setLabel('Días entre renovaciones')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(4)
              .setValue(String(asociacion.renovacionDias))
          ))
        return void interaction.showModal(modal)
      }
      case 'canal':
        return void interaction.update({
          components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder()
              .addChannelTypes(0)
              .setCustomId(`asoc-edit-canal:${asociacion.id}`)
              .setPlaceholder('Selecciona el nuevo canal')
          )]
        })
      case 'representante':
      case 'staff-encargado': {
        const fieldLabel = campo === 'representante' ? 'representante' : 'staff encargado'
        return void interaction.update({
          components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId(`asoc-edit-usuario:${campo}:${asociacion.id}`)
              .setPlaceholder(`Selecciona el nuevo ${fieldLabel}`)
          )]
        })
      }
      case 'quitar-representante':
        asociacion.representanteId = null
        await asociacion.save()
        schedulePanelsSync(interaction.client)
        return void interaction.update(buildEditorPayload(asociacion))
      case 'quitar-staff-encargado':
        asociacion.staffEncargadoId = null
        await asociacion.save()
        schedulePanelsSync(interaction.client)
        return void interaction.update(buildEditorPayload(asociacion))
    }
  }
}

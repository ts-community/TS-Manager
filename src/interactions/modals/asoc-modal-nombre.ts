import type { ModalSubmitInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { capitalizeName, schedulePanelsSync, buildEditorPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-modal-nombre:{asociacionId}
export default {
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.' })
    }

    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.' })

    const nuevoNombre = capitalizeName(interaction.fields.getTextInputValue('nombre').trim())
    if (nuevoNombre.length < 1 || nuevoNombre.length > 64) {
      return void interaction.reply({ content: 'El nombre debe tener entre 1 y 64 caracteres.' })
    }

    const escapeRegex = /[.*+?^${}()|[\]\\]/g
    const duplicada = await Asociacion.findOne({ _id: { $ne: asociacion._id }, servidor: { $regex: `^${nuevoNombre.replace(escapeRegex, '\\$&')}$`, $options: 'i' } })
    if (duplicada) {
      return void interaction.reply({ content: `Ya existe una asociación con el nombre **${nuevoNombre}**.` })
    }

    asociacion.servidor = nuevoNombre
    await asociacion.save()
    schedulePanelsSync(interaction.client)
    if (interaction.isFromMessage()) return void interaction.update(buildEditorPayload(asociacion))
    await interaction.reply({ content: `Nombre actualizado a **${nuevoNombre}**.` })
  }
}

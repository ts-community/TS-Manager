import { type StringSelectMenuInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { buildRemoveConfirmPayload } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// Confirmación de eliminación (solo admins) — CustomId: asoc-select-eliminar
export default {
  async execute(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!await hasPermission(interaction, 'staff')) {
      return void interaction.reply({ content: 'Solo el staff puede editar asociaciones.', ephemeral: true })
    }

    const asociacion = await Asociacion.findById(interaction.values[0])
    if (!asociacion) return void interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })

    const confirm = buildRemoveConfirmPayload(asociacion)
    await interaction.followUp({ embeds: confirm.embeds as never, components: confirm.components })
  }
}

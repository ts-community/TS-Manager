import { PermissionFlagsBits, type ButtonInteraction } from 'discord.js'
import Asociacion from '../../models/Asociacion'
import { schedulePanelsSync } from '../../services/asociaciones'
import { hasPermission } from '../../services/permissions'

// CustomId: asoc-btn-eliminar-confirmar:{asociacionId} — solo admins
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return void interaction.reply({ content: 'Solo los admins pueden eliminar asociaciones.', ephemeral: true })
    }

    const asociacion = await Asociacion.findById(interaction.customId.split(':')[1])
    if (!asociacion) {
      await interaction.reply({ content: 'Esta asociación ya no existe.', ephemeral: true })
      return
    }

    const deleted = await Asociacion.findByIdAndDelete(asociacion.id)
    schedulePanelsSync(interaction.client)

    if (deleted) await interaction.message?.edit({ content: `🗑️ La asociación **${deleted.servidor}** ha sido eliminada.`, embeds: [], components: [] }).catch(() => {})
    else await interaction.message?.edit({ content: 'La asociación ya no existía.', embeds: [], components: [] }).catch(() => {})
    await interaction.reply({ content: 'Eliminación completada.', ephemeral: true })
  }
}

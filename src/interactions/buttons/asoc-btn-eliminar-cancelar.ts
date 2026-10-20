import type { ButtonInteraction } from 'discord.js'

// CustomId: asoc-btn-eliminar-cancelar:{asociacionId}
export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    await interaction.message?.edit({ content: '❌ Eliminación cancelada.', embeds: [], components: [] }).catch(() => {})
    await interaction.reply({ content: 'Cancelada.', ephemeral: true })
  }
}

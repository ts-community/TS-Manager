import { ButtonInteraction, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'

export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('insc-modal-verificar')
      .setTitle('Verificación')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Tag de jugador de Brawl Stars')
          .setDescription('Lo ves en tu perfil, debajo de tu nombre')
          .setTextInputComponent(
            new TextInputBuilder().setCustomId('tag').setStyle(TextInputStyle.Short).setPlaceholder('#2PQ8LGY0').setMinLength(3).setMaxLength(20).setRequired(true)
          )
      )
    await interaction.showModal(modal)
  }
}

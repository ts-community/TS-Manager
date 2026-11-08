import { ButtonInteraction, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } from 'discord.js'

export default {
  async execute(interaction: ButtonInteraction): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('insc-modal-equipo')
      .setTitle('Inscribir equipo')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Nombre del equipo')
          .setTextInputComponent(
            new TextInputBuilder().setCustomId('nombre').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true)
          ),
        new LabelBuilder()
          .setLabel('Titulares (2, tú ya cuentas como el 3º)')
          .setUserSelectMenuComponent(
            new UserSelectMenuBuilder().setCustomId('titulares').setMinValues(2).setMaxValues(2).setRequired(true)
          ),
        new LabelBuilder()
          .setLabel('Suplentes (opcional, hasta 2)')
          .setUserSelectMenuComponent(
            new UserSelectMenuBuilder().setCustomId('suplentes').setMinValues(0).setMaxValues(2).setRequired(false)
          )
      )
    await interaction.showModal(modal)
  }
}

import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import { requestServiceTicketClose } from '../../../services/tickets'

export default {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Administración de tickets')
    .addSubcommand(sub =>
      sub
        .setName('cerrar')
        .setDescription('Solicitar el cierre del ticket actual')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand()
    if (sub !== 'cerrar') return
    await requestServiceTicketClose(interaction)
  }
} satisfies SlashCommand

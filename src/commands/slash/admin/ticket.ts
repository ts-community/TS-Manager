import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Ticket from '../../../models/Ticket'
import { describeTicketPhase, normalizeLegacyTicket, requestServiceTicketClose, setTicketPhase, type TicketPhase } from '../../../services/tickets'

const PHASE_CHOICES: Array<{ name: string; value: TicketPhase }> = [
  { name: 'Solicitado', value: 'solicitado' },
  { name: 'En curso', value: 'en_curso' },
  { name: 'En revisión', value: 'en_revision' },
  { name: 'Entregado', value: 'entregado' }
]

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestionar el estado del ticket actual')
    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver el estado actual del ticket')
    )
    .addSubcommand(sub =>
      sub
        .setName('fijar')
        .setDescription('Fijar el estado del ticket')
        .addStringOption(opt =>
          opt
            .setName('estado')
            .setDescription('Nuevo estado')
            .setRequired(true)
            .addChoices(...PHASE_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('cerrar')
        .setDescription('Solicitar el cierre del ticket actual')
    ),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.',
        ephemeral: true
      })
    }

    const ticket = normalizeLegacyTicket(await Ticket.findOne({
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      status: { $ne: 'cerrado' }
    }))
    if (!ticket) {
      return interaction.reply({
        content: 'Este canal no es un ticket abierto.',
        ephemeral: true
      })
    }

    const sub = interaction.options.getSubcommand()

    if (sub === 'cerrar') {
      await requestServiceTicketClose(interaction)
      return
    }

    if (sub === 'ver') {
      const embed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle(`Ticket #${ticket.number} · Servicios`)
        .setDescription(describeTicketPhase(ticket))
      return interaction.reply({ embeds: [embed], ephemeral: true })
    }

    const estado = interaction.options.getString('estado', true) as TicketPhase
    await setTicketPhase(interaction.client, ticket, estado)
    return interaction.reply({
      content: `El estado del ticket ha sido fijado a \`${estado}\`.`,
      ephemeral: true
    })
  }
} satisfies SlashCommand

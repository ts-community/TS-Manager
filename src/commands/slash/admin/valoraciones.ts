import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Review from '../../../models/Review'
import { SERVICE_LABEL } from '../../../services/tickets'

export default {
  data: new SlashCommandBuilder()
    .setName('valoraciones')
    .setDescription('Ver las valoraciones del servicio'),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.',
        ephemeral: true
      })
    }

    const reviews = await Review.find({ guildId: interaction.guild.id }).sort({ createdAt: -1 }).lean()
    if (reviews.length === 0) {
      return interaction.reply({
        content: 'Aún no se han registrado valoraciones.',
        ephemeral: true
      })
    }

    const average = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    const lines = reviews.slice(0, 5).map(review => {
      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
      const comment = review.comment ? ` ${review.comment.slice(0, 200)}` : ''
      return `${stars} <@${review.userId}> \`${SERVICE_LABEL[review.service]}\`${comment}`
    })

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setTitle('Valoraciones del servicio')
      .setDescription(`★ ${average.toFixed(1)}. ${reviews.length} valoraciones.\n\n${lines.join('\n')}`)
    return interaction.reply({ embeds: [embed], ephemeral: true })
  }
} satisfies SlashCommand

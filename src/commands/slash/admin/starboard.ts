import { EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import { getGuildConfig, setStarboardThreshold } from '../../../services/guild'
import { DEFAULT_STARBOARD_THRESHOLD, STARBOARD_CHANNEL_ID } from '../../../services/starboard'

export default {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configurar el starboard')
    .addSubcommand(sub =>
      sub
        .setName('configurar')
        .setDescription('Cambiar cuántas estrellas necesita un mensaje para aparecer en el starboard')
        .addIntegerOption(opt =>
          opt
            .setName('estrellas')
            .setDescription('Número mínimo de ⭐ necesarias')
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver la configuración actual del starboard')
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.'
      })
    }

    const sub = interaction.options.getSubcommand()

    const replyEmbed = (color: 'Red' | 'Green' | 'Blue', description: string, title: string | null = null) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description)

      if (title) embed.setTitle(title)

      return interaction.reply({ embeds: [embed] })
    }

    if (sub === 'configurar') {
      const stars = interaction.options.getInteger('estrellas', true)
      await setStarboardThreshold(stars)
      return replyEmbed(
        'Green',
        `A partir de ahora un mensaje necesita **${stars}** ⭐ para aparecer en <#${STARBOARD_CHANNEL_ID}>.`
      )
    }

    if (sub === 'ver') {
      const config = await getGuildConfig()
      const threshold = config.starboardThreshold ?? DEFAULT_STARBOARD_THRESHOLD
      return replyEmbed(
        'Blue',
        `Canal: <#${STARBOARD_CHANNEL_ID}>\nEstrellas necesarias: **${threshold}** ⭐`,
        'Starboard'
      )
    }
  }
} satisfies SlashCommand

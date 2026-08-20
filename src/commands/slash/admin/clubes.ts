import { SlashCommandBuilder, EmbedBuilder, type ColorResolvable } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Guild from '../../../models/Guild'
import { brawlStarsApiToken } from '../../../config/env'

const CLUB_EMOJI = '<:Club:1275522702446301338>'

function normalizeTag(tag: string): string {
  const value = tag.trim().toUpperCase()
  return value.startsWith('#') ? value : `#${value}`
}

async function getClubName(tag: string): Promise<string | null> {
  if (!brawlStarsApiToken) return null

  const response = await fetch(`https://api.brawlstars.com/v1/clubs/${encodeURIComponent(tag)}`, {
    headers: {
      Authorization: `Bearer ${brawlStarsApiToken}`
    }
  })

  if (!response.ok) return null

  const data = await response.json() as { name?: string }
  return data.name?.trim() || null
}

function formatClubDisplay(name: string | null, tag: string): string {
  if (!name) return `${CLUB_EMOJI} ${tag}`

  return `${CLUB_EMOJI} **${name}** \`${tag}\``
}

export default {
  data: new SlashCommandBuilder()
    .setName('clubes')
    .setDescription('Gestionar tags de clubes de Brawl Stars')
    .addSubcommand(sub =>
      sub
        .setName('agregar')
        .setDescription('Agregar un tag de club')
        .addStringOption(opt =>
          opt
            .setName('tag')
            .setDescription('Tag del club, por ejemplo #2ABC123')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remover')
        .setDescription('Remover un tag de club')
        .addStringOption(opt =>
          opt
            .setName('tag')
            .setDescription('Tag del club a remover')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver los tags de clubes configurados')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand()

    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.',
        ephemeral: true
      })
    }

    const config =
      await Guild.findOne({ guildId: interaction.guild.id }) ||
      await Guild.create({ guildId: interaction.guild.id })

    const replyEmbed = (color: ColorResolvable, description: string, title: string | null = null) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description)

      if (title) embed.setTitle(title)

      return interaction.reply({ embeds: [embed] })
    }

    if (sub === 'agregar') {
      const tag = normalizeTag(interaction.options.getString('tag', true))

      if (config.clubTags.includes(tag)) {
        return replyEmbed('Red', `${tag} ya está configurado.`)
      }

      config.clubTags.push(tag)
      await config.save()

      const clubName = await getClubName(tag)

      return replyEmbed('Green', `${formatClubDisplay(clubName, tag)} añadido a los clubes.`)
    }

    if (sub === 'remover') {
      const tag = normalizeTag(interaction.options.getString('tag', true))

      if (!config.clubTags.includes(tag)) {
        return replyEmbed('Red', `${tag} no está configurado.`)
      }

      config.clubTags = config.clubTags.filter(value => value !== tag)
      await config.save()

      return replyEmbed('Red', `${tag} eliminado de los clubes.`)
    }

    if (sub === 'ver') {
      if (config.clubTags.length === 0) {
        return replyEmbed('Blue', 'No hay tags configurados.', 'Clubes')
      }

      const tags = await Promise.all(
        config.clubTags.map(async tag => {
          const clubName = await getClubName(tag)
          return `• ${formatClubDisplay(clubName, tag)}`
        })
      )
      
      const list = tags.join('\n')

      return replyEmbed('Blue', list, 'Tags de Clubes')
    }
  }
} satisfies SlashCommand
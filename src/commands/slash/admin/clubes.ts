import { SlashCommandBuilder, EmbedBuilder, type ColorResolvable } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Guild from '../../../models/Guild'
import { brawlStarsApiToken } from '../../../config/env'
import { formatCountry, getCountryName } from '../../../config/countries'
import { countryCodeToFlag } from '../../../services/brawlStars'
import {
  DEFAULT_CLUB_COUNTRY,
  findLegacyClubTags,
  isValidCountryCode,
  normalizeCountryCode,
  resolveClubEntries
} from '../../../services/guild'

const CLUB_EMOJI = '<:Club:1275522702446301338>'
const PAIS_HINT = 'Código ISO de 2 letras: `ES`, `MX`, `FR`, `US`… (todos los países soportados)'

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

function formatClubDisplay(name: string | null, tag: string, countryCode: string = DEFAULT_CLUB_COUNTRY): string {
  const country = formatCountry(countryCode)
  if (!name) return `${CLUB_EMOJI} ${tag} · ${country}`

  return `${CLUB_EMOJI} **${name}** \`${tag}\` · ${country}`
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
        .addStringOption(opt =>
          opt
            .setName('pais')
            .setDescription('País para el top local, ej. ES (España), MX (México)')
            .setRequired(false)
            .setMinLength(2)
            .setMaxLength(2)
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
        .setName('pais')
        .setDescription('Cambiar el país del top local de un club')
        .addStringOption(opt =>
          opt
            .setName('tag')
            .setDescription('Tag del club')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('pais')
            .setDescription('Nuevo país, ej. ES (España), MX (México)')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(2)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver los tags de clubes configurados')
    )
    .addSubcommand(sub =>
      sub
        .setName('revisar')
        .setDescription('Verificar que cada club tenga su país asignado')
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

    // Migración automática: los tags guardados en formato antiguo (string)
    // pasan a { tag, countryCode } con ES por defecto para que cada club
    // tenga siempre su país. Se ejecuta sola al usar cualquier subcomando.
    const legacyTags = findLegacyClubTags(config.clubTags)
    if (legacyTags.length > 0) {
      const entries = resolveClubEntries(config.clubTags)
      config.clubTags = entries.map(e => ({ tag: e.tag, countryCode: e.countryCode }))
      config.markModified('clubTags')
      await config.save()
    }

    const replyEmbed = (color: ColorResolvable, description: string, title: string | null = null) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description)

      if (title) embed.setTitle(title)

      return interaction.reply({ embeds: [embed] })
    }

    if (sub === 'agregar') {
      const tag = normalizeTag(interaction.options.getString('tag', true))
      const paisInput = interaction.options.getString('pais', false)

      if (paisInput !== null && !isValidCountryCode(paisInput)) {
        return replyEmbed('Red', `País no válido. ${PAIS_HINT}`)
      }

      const countryCode = normalizeCountryCode(paisInput ?? DEFAULT_CLUB_COUNTRY)
      const entries = resolveClubEntries(config.clubTags)

      if (entries.some(e => e.tag === tag)) {
        return replyEmbed('Red', `${tag} ya está configurado.`)
      }

      config.clubTags.push({ tag, countryCode })
      // Mongoose con Mixed necesita marcar el cambio
      config.markModified('clubTags')
      await config.save()

      const clubName = await getClubName(tag)

      return replyEmbed('Green', `${formatClubDisplay(clubName, tag, countryCode)} añadido a los clubes.`)
    }

    if (sub === 'remover') {
      const tag = normalizeTag(interaction.options.getString('tag', true))
      const entries = resolveClubEntries(config.clubTags)

      if (!entries.some(e => e.tag === tag)) {
        return replyEmbed('Red', `${tag} no está configurado.`)
      }

      config.clubTags = entries
        .filter(e => e.tag !== tag)
        .map(e => ({ tag: e.tag, countryCode: e.countryCode }))
      config.markModified('clubTags')
      await config.save()

      return replyEmbed('Red', `${tag} eliminado de los clubes.`)
    }

    if (sub === 'pais') {
      const tag = normalizeTag(interaction.options.getString('tag', true))
      const paisInput = interaction.options.getString('pais', true)

      if (!isValidCountryCode(paisInput)) {
        return replyEmbed('Red', `País no válido. ${PAIS_HINT}`)
      }

      const countryCode = normalizeCountryCode(paisInput)
      const entries = resolveClubEntries(config.clubTags)
      const existing = entries.find(e => e.tag === tag)

      if (!existing) {
        return replyEmbed('Red', `${tag} no está configurado. Usa \`/clubes agregar\` primero.`)
      }

      config.clubTags = entries.map(e =>
        e.tag === tag ? { tag: e.tag, countryCode } : { tag: e.tag, countryCode: e.countryCode }
      )
      config.markModified('clubTags')
      await config.save()

      const clubName = await getClubName(tag)

      return replyEmbed('Green', `${formatClubDisplay(clubName, tag, countryCode)} actualizado al top local de ${getCountryName(countryCode)}.`)
    }

    if (sub === 'ver') {
      const entries = resolveClubEntries(config.clubTags)

      if (entries.length === 0) {
        return replyEmbed('Blue', 'No hay tags configurados.', 'Clubes')
      }

      const tags = await Promise.all(
        entries.map(async ({ tag, countryCode }) => {
          const clubName = await getClubName(tag)
          return `• ${formatClubDisplay(clubName, tag, countryCode)}`
        })
      )

      const byCountry = new Map<string, number>()
      for (const { countryCode } of entries) {
        byCountry.set(countryCode, (byCountry.get(countryCode) ?? 0) + 1)
      }
      const summary = [...byCountry.entries()]
        .map(([code, count]) => `${countryCodeToFlag(code)} ${getCountryName(code)}: ${count}`)
        .join(' · ')

      const list = `${tags.join('\n')}\n\n**${entries.length} clubes** · ${summary}`

      return replyEmbed('Blue', list, 'Tags de Clubes')
    }

    if (sub === 'revisar') {
      const entries = resolveClubEntries(config.clubTags)

      if (entries.length === 0) {
        return replyEmbed('Blue', 'No hay tags configurados.', 'Revisión de países')
      }

      const withoutCountry = entries.filter(e => !e.explicitCountry)
      const byCountry = new Map<string, string[]>()
      for (const { tag, countryCode } of entries) {
        if (!byCountry.has(countryCode)) byCountry.set(countryCode, [])
        byCountry.get(countryCode)!.push(tag)
      }

      const lines = [...byCountry.entries()].map(([code, tags]) =>
        `${formatCountry(code)} — ${tags.length} club(es): ${tags.map(t => `\`${t}\``).join(', ')}`
      )

      if (withoutCountry.length === 0) {
        lines.push(`\n✅ Todos los clubes tienen su país asignado (${entries.length}/${entries.length}).`)
      } else {
        lines.push(`\n⚠️ ${withoutCountry.length} club(es) usan el país por defecto \`${DEFAULT_CLUB_COUNTRY}\`: ${withoutCountry.map(e => `\`${e.tag}\``).join(', ')}`)
        lines.push(`Asígnalo con \`/clubes pais tag:<tag> pais:<código>\`. ${PAIS_HINT}`)
      }

      return replyEmbed(withoutCountry.length === 0 ? 'Green' : 'Yellow', lines.join('\n'), 'Revisión de países')
    }
  }
} satisfies SlashCommand
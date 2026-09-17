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
  resolveClubEntries,
  type ResolvedClub
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

async function resolveTargetTag(
  entries: ResolvedClub[],
  tagInput: string | null,
  nombreInput: string | null
): Promise<{ tag: string | null; notFoundName: boolean }> {
  if (tagInput?.trim()) return { tag: normalizeTag(tagInput), notFoundName: false }
  if (!nombreInput?.trim()) return { tag: null, notFoundName: false }

  const wanted = nombreInput.trim().toLowerCase()
  const names = await Promise.all(entries.map(async e => ({ tag: e.tag, name: await getClubName(e.tag) })))
  const found = names.find(n => n.name?.toLowerCase() === wanted)

  return found ? { tag: found.tag, notFoundName: false } : { tag: null, notFoundName: true }
}

export default {
  data: new SlashCommandBuilder()
    .setName('clubes')
    .setDescription('Gestionar clubes de Brawl Stars (sin parámetros muestra el resumen)')
    .addStringOption(opt =>
      opt
        .setName('accion')
        .setDescription('Qué hacer: agregar, remover o editar el país')
        .setRequired(false)
        .addChoices(
          { name: 'agregar', value: 'agregar' },
          { name: 'remover', value: 'remover' },
          { name: 'editar', value: 'editar' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('tag')
        .setDescription('Tag del club, por ejemplo #2ABC123')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('nombre')
        .setDescription('Nombre del club (alternativa al tag para remover/editar)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('pais')
        .setDescription('País para el top local, ej. ES (España), MX (México)')
        .setRequired(false)
        .setMinLength(2)
        .setMaxLength(2)
    ),

  async execute(interaction) {
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
    // tenga siempre su país.
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

    const buildResumen = async (): Promise<{ color: ColorResolvable; description: string; title: string }> => {
      const entries = resolveClubEntries(config.clubTags)

      if (entries.length === 0) {
        return {
          color: 'Blue',
          description: `No hay clubes configurados.\n\nAgrega uno con \`/clubes accion:agregar tag:#TU_TAG pais:ES\`. ${PAIS_HINT}`,
          title: 'Clubes'
        }
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

      const lines = [...tags, '', `**${entries.length} clubes** · ${summary}`]

      const withoutCountry = entries.filter(e => !e.explicitCountry)
      if (withoutCountry.length > 0) {
        lines.push('')
        lines.push(`⚠️ ${withoutCountry.length} club(es) usan el país por defecto \`${DEFAULT_CLUB_COUNTRY}\`: ${withoutCountry.map(e => `\`${e.tag}\``).join(', ')}`)
        lines.push(`Cámbialo con \`/clubes accion:editar tag:<tag> pais:<código>\`. ${PAIS_HINT}`)
      }

      return {
        color: withoutCountry.length > 0 ? 'Yellow' : 'Blue',
        description: lines.join('\n'),
        title: 'Clubes'
      }
    }

    const accion = interaction.options.getString('accion', false)
    const tagInput = interaction.options.getString('tag', false)
    const nombreInput = interaction.options.getString('nombre', false)
    const paisInput = interaction.options.getString('pais', false)

    // Sin parámetros: resumen de todos los clubes con sus propiedades.
    if (!accion && !tagInput && !nombreInput && !paisInput) {
      const resumen = await buildResumen()
      return replyEmbed(resumen.color, resumen.description, resumen.title)
    }

    if (!accion) {
      return replyEmbed('Red', 'Indica la acción: `accion:agregar`, `accion:remover` o `accion:editar`.\nSin parámetros muestra el resumen de clubes.')
    }

    if (accion === 'agregar') {
      if (!tagInput?.trim()) {
        return replyEmbed('Red', 'Te falta el `tag` del club. Ejemplo: `/clubes accion:agregar tag:#2ABC123 pais:ES`.')
      }

      if (paisInput !== null && !isValidCountryCode(paisInput)) {
        return replyEmbed('Red', `País no válido. ${PAIS_HINT}`)
      }

      const tag = normalizeTag(tagInput)
      const countryCode = normalizeCountryCode(paisInput ?? DEFAULT_CLUB_COUNTRY)
      const entries = resolveClubEntries(config.clubTags)

      if (entries.some(e => e.tag === tag)) {
        return replyEmbed('Red', `${tag} ya está configurado.`)
      }

      config.clubTags.push({ tag, countryCode })
      config.markModified('clubTags')
      await config.save()

      const clubName = await getClubName(tag)

      return replyEmbed('Green', `${formatClubDisplay(clubName, tag, countryCode)} añadido a los clubes.`)
    }

    if (accion === 'remover') {
      const entries = resolveClubEntries(config.clubTags)
      const { tag, notFoundName } = await resolveTargetTag(entries, tagInput, nombreInput)

      if (notFoundName) {
        return replyEmbed('Red', `No encontré ningún club configurado con el nombre \`${nombreInput?.trim()}\`. Revisa el resumen con \`/clubes\`.`)
      }

      if (!tag) {
        return replyEmbed('Red', 'Te falta el club. Indica `tag:#TU_TAG` o `nombre:Nombre del club`. Ejemplo: `/clubes accion:remover tag:#2ABC123`.')
      }

      if (!entries.some(e => e.tag === tag)) {
        return replyEmbed('Red', `${tag} no está configurado. Revisa el resumen con \`/clubes\`.`)
      }

      config.clubTags = entries
        .filter(e => e.tag !== tag)
        .map(e => ({ tag: e.tag, countryCode: e.countryCode }))
      config.markModified('clubTags')
      await config.save()

      return replyEmbed('Red', `${tag} eliminado de los clubes.`)
    }

    if (accion === 'editar') {
      const entries = resolveClubEntries(config.clubTags)
      const { tag, notFoundName } = await resolveTargetTag(entries, tagInput, nombreInput)

      if (notFoundName) {
        return replyEmbed('Red', `No encontré ningún club configurado con el nombre \`${nombreInput?.trim()}\`. Revisa el resumen con \`/clubes\`.`)
      }

      const faltan: string[] = []
      if (!tag) faltan.push('`tag` (o `nombre`)')
      if (!paisInput) faltan.push('`pais`')

      if (faltan.length > 0) {
        return replyEmbed('Red', `Te falta ${faltan.join(' y ')}. Ejemplo: \`/clubes accion:editar tag:#2ABC123 pais:MX\`. ${PAIS_HINT}`)
      }

      if (!isValidCountryCode(paisInput)) {
        return replyEmbed('Red', `País no válido. ${PAIS_HINT}`)
      }

      const countryCode = normalizeCountryCode(paisInput)
      const existing = entries.find(e => e.tag === tag)

      if (!existing) {
        return replyEmbed('Red', `${tag} no está configurado. Agrégalo primero con \`/clubes accion:agregar tag:${tag}\`.`)
      }

      config.clubTags = entries.map(e =>
        e.tag === tag ? { tag: e.tag, countryCode } : { tag: e.tag, countryCode: e.countryCode }
      )
      config.markModified('clubTags')
      await config.save()

      const clubName = await getClubName(tag!)

      return replyEmbed('Green', `${formatClubDisplay(clubName, tag!, countryCode)} actualizado al top local de ${getCountryName(countryCode)}.`)
    }

    return replyEmbed('Red', 'Acción no válida. Usa `accion:agregar`, `accion:remover` o `accion:editar`. Sin parámetros muestra el resumen de clubes.')
  }
} satisfies SlashCommand

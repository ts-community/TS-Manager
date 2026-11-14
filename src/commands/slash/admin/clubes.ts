import { SlashCommandBuilder, EmbedBuilder, type ColorResolvable, type Guild as DiscordGuild } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Guild from '../../../models/Guild'
import { brawlStarsApiToken } from '../../../config/env'
import { COUNTRIES, formatCountry, getCountryName } from '../../../config/countries'
import {
  countryCodeToFlag,
  DEFAULT_CLUB_COUNTRY,
  ensureClubRole,
  findLegacyClubTags,
  isValidCountryCode,
  normalizeCountryCode,
  resolveClubEntries,
  type ResolvedClub
} from '../../../services/clubs'

const CLUB_EMOJI = '<:Club:1275522702446301338>'
const COUNTRY_EMOJI = '🌍'
const ROLE_EMOJI = '🏷️'
const PAIS_HINT = 'Código ISO de 2 letras: `ES`, `MX`, `FR`, `US`… (todos los países soportados)'
const CLUB_NAME_CACHE_TTL_MS = 10 * 60 * 1000

const clubNameCache = new Map<string, { value: string | null; expiresAt: number }>()

function normalizeTag(tag: string): string {
  const value = tag.trim().toUpperCase()
  return value.startsWith('#') ? value : `#${value}`
}

async function getClubName(tag: string): Promise<string | null> {
  if (!brawlStarsApiToken) return null

  const key = normalizeTag(tag)
  const cached = clubNameCache.get(key)

  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    const response = await fetch(`https://api.brawlstars.com/v1/clubs/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${brawlStarsApiToken}`
      }
    })

    const value = response.ok
      ? ((await response.json() as { name?: string }).name?.trim() || null)
      : null

    clubNameCache.set(key, { value, expiresAt: Date.now() + CLUB_NAME_CACHE_TTL_MS })
    return value
  } catch {
    return null
  }
}

function formatClubDisplay(name: string | null, tag: string, countryCode: string = DEFAULT_CLUB_COUNTRY): string {
  const country = formatCountry(countryCode)
  if (!name) return `${CLUB_EMOJI} \`${tag}\` ${country}`

  return `${CLUB_EMOJI} **${name}** \`${tag}\` ${country}`
}

async function resolveTargetTag(
  entries: ResolvedClub[],
  tagInput: string | null,
  nombreInput: string | null
): Promise<{ tag: string | null; notFoundName: boolean }> {
  if (tagInput?.trim()) return { tag: normalizeTag(tagInput), notFoundName: false }
  if (!nombreInput?.trim()) return { tag: null, notFoundName: false }

  const wanted = nombreInput.trim().toLowerCase()
  const wantedTag = normalizeTag(nombreInput)
  const names = await Promise.all(entries.map(async e => ({ tag: e.tag, name: await getClubName(e.tag) })))
  const found = names.find(
    n => n.name?.toLowerCase() === wanted || n.tag === wantedTag
  )

  return found ? { tag: found.tag, notFoundName: false } : { tag: null, notFoundName: true }
}

function assignableRoles(guild: DiscordGuild, query: string) {
  const me = guild.members.me
  if (!me) return []

  const highest = me.roles.highest.position
  return guild.roles.cache
    .filter(role =>
      role.id !== guild.id &&
      !role.managed &&
      role.position < highest &&
      (!query || role.name.toLowerCase().includes(query))
    )
    .sort((a, b) => b.position - a.position)
    .first(25)
}

export default {
  data: new SlashCommandBuilder()
    .setName('clubes')
    .setDescription('Gestionar clubes de Brawl Stars (sin parámetros muestra el resumen)')
    .addStringOption(opt =>
      opt
        .setName('accion')
        .setDescription('Qué hacer: agregar, remover o editar el país/rol')
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
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('nombre')
        .setDescription('Nombre del club (alternativa al tag para remover/editar)')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('pais')
        .setDescription('País para el top local, ej. ES (España), MX (México)')
        .setRequired(false)
        .setMinLength(2)
        .setMaxLength(2)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('rol')
        .setDescription('Rol de Discord que representará a este club (autocompletado)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const guild = interaction.guild

    if (!guild) {
      await interaction.respond([])
      return
    }

    const focused = interaction.options.getFocused(true)
    const query = String(focused.value ?? '').trim()
    const lower = query.toLowerCase()
    const config = await Guild.findOne({ guildId: guild.id })
    const entries = resolveClubEntries(config?.clubTags ?? [])

    if (focused.name === 'pais') {
      const configured = new Set(entries.map(entry => entry.countryCode))
      const choices = COUNTRIES
        .filter(country =>
          !lower ||
          country.name.toLowerCase().includes(lower) ||
          country.code.toLowerCase().includes(lower)
        )
        .sort((a, b) =>
          Number(configured.has(b.code)) - Number(configured.has(a.code)) ||
          a.name.localeCompare(b.name, 'es')
        )
        .slice(0, 25)
        .map(country => ({
          name: `${country.flag} ${country.name} (${country.code})${configured.has(country.code) ? ' — en uso' : ''}`,
          value: country.code
        }))

      await interaction.respond(choices)
      return
    }

    if (focused.name === 'rol') {
      const roles = assignableRoles(guild, lower)
      await interaction.respond(
        roles.map(role => ({
          name: `${ROLE_EMOJI} ${role.name}`.slice(0, 100),
          value: role.id
        }))
      )
      return
    }

    if (focused.name === 'tag' || focused.name === 'nombre') {
      const resolved = await Promise.all(
        entries.map(async entry => ({ ...entry, name: await getClubName(entry.tag) }))
      )

      const choices = resolved
        .filter(entry =>
          !lower ||
          entry.tag.toLowerCase().includes(lower) ||
          entry.name?.toLowerCase().includes(lower)
        )
        .slice(0, 25)
        .flatMap(entry => {
          if (focused.name === 'nombre' && !entry.name) return []

          return [{
            name: `${CLUB_EMOJI} ${entry.name ?? 'Club sin nombre'} ${entry.tag}`.slice(0, 100),
            value: focused.name === 'tag' ? entry.tag : entry.name!
          }]
        })

      await interaction.respond(choices)
      return
    }

    await interaction.respond([])
  },

  async execute(interaction) {
    const guild = interaction.guild

    if (!guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.',
        ephemeral: true
      })
    }

    const config =
      await Guild.findOne({ guildId: guild.id }) ||
      await Guild.create({ guildId: guild.id })

    // Migración automática: los tags guardados en formato antiguo (string)
    // pasan a { tag, countryCode } con ES por defecto para que cada club
    // tenga siempre su país.
    const legacyTags = findLegacyClubTags(config.clubTags)
    if (legacyTags.length > 0) {
      const entries = resolveClubEntries(config.clubTags)
      config.clubTags = entries.map(e => ({ tag: e.tag, countryCode: e.countryCode, roleId: e.roleId }))
      config.markModified('clubTags')
      await config.save()
    }

    const replyEmbed = (color: ColorResolvable, description: string, title: string | null = null) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description)

      if (title) embed.setTitle(title)

      return interaction.reply({
        embeds: [embed],
        allowedMentions: { parse: [] }
      })
    }

    const buildResumen = async (): Promise<{ color: ColorResolvable; description: string; title: string }> => {
      const entries = resolveClubEntries(config.clubTags)
      const title = 'Clubes oficiales'

      if (entries.length === 0) {
        return {
          color: 'Blue',
          description: [
            `${CLUB_EMOJI} **No hay clubes configurados.**`,
            '',
            '> Agrega el primero con `/clubes accion:agregar tag:#TU_TAG pais:ES`.',
            `-# ${PAIS_HINT}`
          ].join('\n'),
          title
        }
      }

      const resolved = await Promise.all(
        entries.map(async entry => ({ ...entry, name: await getClubName(entry.tag) }))
      )

      const lines: string[] = [
        `> ${CLUB_EMOJI} **${entries.length}** ${entries.length === 1 ? 'club configurado' : 'clubes configurados'}`
      ]

      for (const { tag, name, countryCode, roleId } of resolved) {
        lines.push('')
        lines.push(`${CLUB_EMOJI} **${name ?? 'Club sin nombre'}** \`${tag}\``)
        lines.push(
          `> ${countryCodeToFlag(countryCode)} ${getCountryName(countryCode)}${roleId ? `    <@&${roleId}>` : ''}`
        )
      }

      const byCountry = new Map<string, number>()
      for (const { countryCode } of entries) {
        byCountry.set(countryCode, (byCountry.get(countryCode) ?? 0) + 1)
      }

      lines.push('')
      lines.push(`${COUNTRY_EMOJI} **Top local por país**`)
      lines.push(
        `> ${[...byCountry.entries()]
          .map(([code, count]) => `${countryCodeToFlag(code)} ${getCountryName(code)} **${count}**`)
          .join('    ')}`
      )

      const withoutCountry = entries.filter(e => !e.explicitCountry)
      const withoutRole = entries.filter(e => !e.roleId)
      const warnings: string[] = []

      if (withoutCountry.length > 0) {
        warnings.push(
          `> ${COUNTRY_EMOJI} **${withoutCountry.length}** ${withoutCountry.length === 1 ? 'club usa' : 'clubes usan'} el país por defecto \`${DEFAULT_CLUB_COUNTRY}\`: ${withoutCountry.map(e => `\`${e.tag}\``).join(', ')}`
        )
      }

      if (withoutRole.length > 0) {
        warnings.push(
          `> ${ROLE_EMOJI} **${withoutRole.length}** ${withoutRole.length === 1 ? 'club no tiene' : 'clubes no tienen'} rol asignado: ${withoutRole.map(e => `\`${e.tag}\``).join(', ')}`
        )
      }

      if (warnings.length > 0) {
        lines.push('')
        lines.push('⚠️ **Configuración pendiente**')
        lines.push(...warnings)
        lines.push('-# Corrige cada club con `/clubes accion:editar tag:<tag> pais:<código> rol:@Rol`.')
      }

      return {
        color: warnings.length > 0 ? 'Yellow' : 'Blue',
        description: lines.join('\n'),
        title
      }
    }

    const accion = interaction.options.getString('accion', false)
    const tagInput = interaction.options.getString('tag', false)
    const nombreInput = interaction.options.getString('nombre', false)
    const paisInput = interaction.options.getString('pais', false)
    const roleInput = interaction.options.getString('rol', false)
    const roleOption = roleInput
      ? guild.roles.cache.get(roleInput) ??
        guild.roles.cache.find(role => role.name.toLowerCase() === roleInput.toLowerCase()) ??
        await guild.roles.fetch(roleInput).catch(() => null)
      : null

    if (roleInput && !roleOption) {
      return replyEmbed('Red', `❌ No encontré el rol \`${roleInput}\`. Elígelo del autocompletado o usa su ID.`)
    }

    // Sin parámetros: resumen de todos los clubes con sus propiedades.
    if (!accion && !tagInput && !nombreInput && !paisInput && !roleOption) {
      const resumen = await buildResumen()
      return replyEmbed(resumen.color, resumen.description, resumen.title)
    }

    if (!accion) {
      return replyEmbed('Red', 'ℹ️ Indica la acción: `accion:agregar`, `accion:remover` o `accion:editar`.\nSin parámetros muestra el resumen de clubes.')
    }

    if (accion === 'agregar') {
      if (!tagInput?.trim()) {
        return replyEmbed('Red', '❌ Te falta el `tag` del club. Ejemplo: `/clubes accion:agregar tag:#2ABC123 pais:ES`.')
      }

      if (paisInput !== null && !isValidCountryCode(paisInput)) {
        return replyEmbed('Red', `❌ País no válido. ${PAIS_HINT}`)
      }

      const tag = normalizeTag(tagInput)
      const countryCode = normalizeCountryCode(paisInput ?? DEFAULT_CLUB_COUNTRY)
      const entries = resolveClubEntries(config.clubTags)

      if (entries.some(e => e.tag === tag)) {
        return replyEmbed('Red', `❌ ${tag} ya está configurado.`)
      }

      const clubName = await getClubName(tag)
      const role = clubName
        ? await ensureClubRole(guild, clubName, entries.map(e => e.roleId))
        : null

      config.clubTags.push({ tag, countryCode, roleId: role?.id ?? null })
      config.markModified('clubTags')
      await config.save()

      const roleNote = role
        ? ` Se creó el rol ${role}.`
        : clubName
          ? ' No se pudo crear el rol del club; asígnalo manualmente con `/clubes accion:editar`.'
          : ' Añade el rol del club con `/clubes accion:editar`.'

      return replyEmbed('Green', `✅ ${formatClubDisplay(clubName, tag, countryCode)} añadido a los clubes.${roleNote}`)
    }

    if (accion === 'remover') {
      const entries = resolveClubEntries(config.clubTags)
      const { tag, notFoundName } = await resolveTargetTag(entries, tagInput, nombreInput)

      if (notFoundName) {
        return replyEmbed('Red', `❌ No encontré ningún club configurado con el nombre \`${nombreInput?.trim()}\`. Revisa el resumen con \`/clubes\`.`)
      }

      if (!tag) {
        return replyEmbed('Red', '❌ Te falta el club. Indica `tag:#TU_TAG` o `nombre:Nombre del club`. Ejemplo: `/clubes accion:remover tag:#2ABC123`.')
      }

      if (!entries.some(e => e.tag === tag)) {
        return replyEmbed('Red', `❌ ${tag} no está configurado. Revisa el resumen con \`/clubes\`.`)
      }

      config.clubTags = entries
        .filter(e => e.tag !== tag)
        .map(e => ({ tag: e.tag, countryCode: e.countryCode, roleId: e.roleId }))
      config.markModified('clubTags')
      await config.save()

      return replyEmbed('Red', `🗑️ ${tag} eliminado de los clubes.`)
    }

    if (accion === 'editar') {
      const entries = resolveClubEntries(config.clubTags)
      const { tag, notFoundName } = await resolveTargetTag(entries, tagInput, nombreInput)

      if (notFoundName) {
        return replyEmbed('Red', `❌ No encontré ningún club configurado con el nombre \`${nombreInput?.trim()}\`. Revisa el resumen con \`/clubes\`.`)
      }

      if (!tag) {
        return replyEmbed('Red', '❌ Te falta el club. Indica `tag:#TU_TAG` o `nombre:Nombre del club`. Ejemplo: `/clubes accion:editar tag:#2ABC123 pais:MX`.')
      }

      if (!paisInput && !roleOption) {
        return replyEmbed('Red', '❌ Indica al menos `pais` o `rol`. Ejemplos: `/clubes accion:editar tag:#2ABC123 pais:MX` o `/clubes accion:editar tag:#2ABC123 rol:@Rol`.')
      }

      if (paisInput && !isValidCountryCode(paisInput)) {
        return replyEmbed('Red', `❌ País no válido. ${PAIS_HINT}`)
      }

      const existing = entries.find(e => e.tag === tag)

      if (!existing) {
        return replyEmbed('Red', `❌ ${tag} no está configurado. Agrégalo primero con \`/clubes accion:agregar tag:${tag}\`.`)
      }

      const countryCode = paisInput ? normalizeCountryCode(paisInput) : existing.countryCode
      const roleId = roleOption ? roleOption.id : existing.roleId

      config.clubTags = entries.map(e =>
        e.tag === tag
          ? { tag: e.tag, countryCode, roleId: roleId ?? null }
          : { tag: e.tag, countryCode: e.countryCode, roleId: e.roleId ?? null }
      )
      config.markModified('clubTags')
      await config.save()

      const clubName = await getClubName(tag)
      const changes: string[] = []

      if (paisInput) changes.push(`top local de ${getCountryName(countryCode)}`)
      if (roleOption) changes.push(`rol ${roleOption}`)

      return replyEmbed('Green', `✏️ ${formatClubDisplay(clubName, tag, countryCode)} actualizado: ${changes.join(' y ')}.`)
    }

    return replyEmbed('Red', '❌ Acción no válida. Usa `accion:agregar`, `accion:remover` o `accion:editar`. Sin parámetros muestra el resumen de clubes.')
  }
} satisfies SlashCommand

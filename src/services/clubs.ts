import { ChannelType, EmbedBuilder, type Client } from 'discord.js'
import { brawlStarsApiToken, guildId } from '../config/env'
import { formatCountry, getCountryFlag, isSupportedCountryCode, normalizeCountryInput } from '../config/countries'
import { getGuildConfig } from './guild'
import logger from '../utils/logger'

export interface ResolvedClub {
  tag: string
  countryCode: string
  /** true si el país viene de una entrada explícita, false si es el ES por defecto heredado */
  explicitCountry: boolean
}

export const DEFAULT_CLUB_COUNTRY = 'ES'

export function normalizeCountryCode(input: unknown, fallback = DEFAULT_CLUB_COUNTRY): string {
  const code = normalizeCountryInput(input)
  if (code && isSupportedCountryCode(code)) return code
  const fb = normalizeCountryInput(fallback)
  return fb && isSupportedCountryCode(fb) ? fb : DEFAULT_CLUB_COUNTRY
}

export function isValidCountryCode(input: unknown): input is string {
  return isSupportedCountryCode(input)
}

/** Tags en formato antiguo (string suelto) que aún no tienen país explícito. */
export function findLegacyClubTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return []
  const out: string[] = []
  for (const raw of rawTags) {
    if (typeof raw === 'string' && raw.trim()) {
      const value = raw.trim().toUpperCase()
      out.push(value.startsWith('#') ? value : `#${value}`)
    }
  }
  return [...new Set(out)]
}

function normalizeTagWithHash(tag: string): string {
  const value = tag.trim().toUpperCase()
  return value.startsWith('#') ? value : `#${value}`
}

/**
 * Normaliza clubTags aceptando el formato antiguo (string) y el nuevo
 * ({ tag, countryCode }). Devuelve tags con # y país en mayúsculas.
 */
export function resolveClubEntries(rawTags: unknown): ResolvedClub[] {
  if (!Array.isArray(rawTags)) return []

  const seen = new Set<string>()
  const entries: ResolvedClub[] = []

  for (const raw of rawTags) {
    let tag: string | null = null
    let country = DEFAULT_CLUB_COUNTRY
    let explicitCountry = false

    if (typeof raw === 'string') {
      tag = normalizeTagWithHash(raw)
    } else if (raw && typeof raw === 'object') {
      const obj = raw as { tag?: unknown; countryCode?: unknown; country?: unknown; pais?: unknown }
      if (typeof obj.tag === 'string' && obj.tag.trim()) {
        tag = normalizeTagWithHash(obj.tag)
      }
      const cc = obj.countryCode ?? obj.country ?? obj.pais
      const normalized = normalizeCountryInput(cc)
      if (normalized && isSupportedCountryCode(normalized)) {
        country = normalized
        explicitCountry = true
      }
    }

    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    entries.push({ tag, countryCode: country, explicitCountry })
  }

  return entries
}

const CLUB_EMOJI = '<:Club:1275522702446301338>'
const EMOJI_MEMBERS = '<:members:1467129799771426931>'
const EMOJI_PRESIDENT = '<:presidente:1467129797992906917>'
const EMOJI_CLOSED = '<:clubcerrado:1467127831078375569>'
const EMOJI_INVITE_ONLY = '<:soloinvitacion:1467127419088666727>'
const EMOJI_OPEN = '<:clubabierto:1467127417364811917>'
const EMOJI_TROPHIES = '<:copas:1467126361864016025>'
const EMOJI_TOP_GLOBAL = '<:topglobal:1467116653149032565>'
const EMOJI_REQUIREMENT = '<:requisitodecopas:1385558827826544640>'
const EMOJI_VICE_PRESIDENT = '<:vice:1467129801281376362>'
const EMOJI_VETERAN = '<:vete:1467126232326868992>'
const EMOJI_CLUBS = '<:club:1467133380905795848>'
const EMOJI_MEMBERS_COUNT = '<:members:1467129799771426931>'



export interface BrawlClubInfo {
  tag: string
  name: string
  trophies: number
  requiredTrophies: number
  membersCount: number
  presidentName: string | null
  presidentTag: string | null
  vicePresidentName: string | null
  vicePresidentTag: string | null
  vicePresidentCount: number
  veteranCount: number
  rank: number | null
  globalRank: number | null
  localRank: number | null
  countryCode: string
  locationName: string | null
  locationCountryCode: string | null
  type: 'open' | 'inviteOnly' | 'closed' | string
}

export function countryCodeToFlag(code: string): string {
  return getCountryFlag(code)
}

export function formatClubCountry(code: string): string {
  return formatCountry(code)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value)
}

function formatStatus(type: BrawlClubInfo['type']): { emoji: string; label: string } {
  if (type === 'open') return { emoji: EMOJI_OPEN, label: 'Abierto' }
  if (type === 'inviteOnly') return { emoji: EMOJI_INVITE_ONLY, label: 'Invitación' }
  return { emoji: EMOJI_CLOSED, label: 'Cerrado' }
}

function formatUpdateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date)
}

function normalizeTag(tag: string): string {
  const value = tag.trim().toUpperCase()
  return value.startsWith('#') ? value : `#${value}`
}

async function fetchClubInfo(tag: string, countryCode: string = DEFAULT_CLUB_COUNTRY): Promise<BrawlClubInfo | null> {
  if (!brawlStarsApiToken) return null

  const response = await fetch(`https://api.brawlstars.com/v1/clubs/${encodeURIComponent(tag)}`, {
    headers: {
      Authorization: `Bearer ${brawlStarsApiToken}`
    }
  })

  if (!response.ok) return null

  const data = await response.json() as {
    name?: string
    tag?: string
    trophies?: number
    requiredTrophies?: number
    rank?: number
    type?: string
    location?: {
      name?: string
      countryCode?: string
    }
    members?: Array<{
      name?: string
      tag?: string
      role?: string
    }>
  }

  const president = data.members?.find(member => member.role === 'president')
  const vicePresident = data.members?.find(member => member.role === 'vicePresident')
  const vicePresidentCount = data.members?.filter(member => member.role === 'vicePresident').length ?? 0
  const veteranCount = data.members?.filter(member => member.role === 'elder' || member.role === 'veteran').length ?? 0

  return {
    tag: normalizeTag(data.tag || tag),
    name: data.name?.trim() || normalizeTag(tag),
    trophies: data.trophies ?? 0,
    requiredTrophies: data.requiredTrophies ?? 0,
    membersCount: data.members?.length ?? 0,
    presidentName: president?.name?.trim() || null,
    presidentTag: president?.tag ? normalizeTag(president.tag) : null,
    vicePresidentName: vicePresident?.name?.trim() || null,
    vicePresidentTag: vicePresident?.tag ? normalizeTag(vicePresident.tag) : null,
    vicePresidentCount,
    veteranCount,
    rank: null,
    globalRank: null,
    localRank: null,
    countryCode: countryCode.trim().toUpperCase() || DEFAULT_CLUB_COUNTRY,
    locationName: data.location?.name?.trim() || null,
    locationCountryCode: data.location?.countryCode?.trim().toUpperCase() || null,
    type: data.type || 'closed'
  }
}

async function fetchRankingMap(countryCode: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!brawlStarsApiToken) return map

  const code = countryCode.trim().toLowerCase() === 'global'
    ? 'global'
    : countryCode.trim().toUpperCase()

  const response = await fetch(`https://api.brawlstars.com/v1/rankings/${code}/clubs`, {
    headers: {
      Authorization: `Bearer ${brawlStarsApiToken}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    logger.warn('Brawl Stars: fallo al obtener ranking', { country: code, status: response.status })
    return map
  }

  const data = await response.json() as { items?: Array<{ tag?: string; rank?: number }> }
  for (const item of data.items ?? []) {
    if (item.tag && typeof item.rank === 'number') {
      map.set(item.tag.trim().toUpperCase(), item.rank)
    }
  }

  return map
}

/**
 * Resuelve top global + top local por club.
 * El país local sale de la config de cada club (/clubes agregar <tag> <pais>).
 */
async function resolveClubRanks(clubs: BrawlClubInfo[]): Promise<void> {
  if (clubs.length === 0) return

  const countries = [...new Set(clubs.map(c => c.countryCode))]
  const [globalMap, ...localMaps] = await Promise.all([
    fetchRankingMap('global'),
    ...countries.map(cc => fetchRankingMap(cc))
  ])
  const localByCountry = new Map(countries.map((cc, i) => [cc, localMaps[i]]))

  for (const club of clubs) {
    const key = club.tag.trim().toUpperCase()
    club.globalRank = globalMap.get(key) ?? null
    club.localRank = localByCountry.get(club.countryCode)?.get(key) ?? null
    club.rank = club.globalRank
  }
}

function createClubUrl(tag: string): string {
  return `https://brawltimeninja.com/club/${encodeURIComponent(normalizeTag(tag))}`
}

function createPlayerUrl(tag: string): string {
  return `https://brawltimeninja.com/player/${encodeURIComponent(normalizeTag(tag))}`
}

function formatClubName(club: BrawlClubInfo): string {
  return `[${club.name}](${createClubUrl(club.tag)})`
}

function formatPresident(club: BrawlClubInfo): string {
  if (!club.presidentName || !club.presidentTag) return 'Sin presidente'

  return `[${club.presidentName}](${createPlayerUrl(club.presidentTag)})`
}

function formatVicePresident(club: BrawlClubInfo): string {
  if (!club.vicePresidentName || !club.vicePresidentTag) return 'Sin vicepresidente'

  return `[${club.vicePresidentName}](${createPlayerUrl(club.vicePresidentTag)})`
}

function formatTopRanks(club: BrawlClubInfo): string | null {
  const parts: string[] = []
  if (club.localRank) parts.push(`\`#${formatNumber(club.localRank)}\` ${countryCodeToFlag(club.countryCode)}`)
  if (club.globalRank) parts.push(`\`#${formatNumber(club.globalRank)}\` ${EMOJI_TOP_GLOBAL}`)
  if (parts.length === 0) return null

  return parts.join(' ')
}

function createSummaryEmbed(clubs: BrawlClubInfo[], updatedAt: string, thumbnailUrl?: string): EmbedBuilder {
  const totalTrophies = clubs.reduce((sum, club) => sum + club.trophies, 0)
  const totalMembers = clubs.reduce((sum, club) => sum + club.membersCount, 0)
  const averageTrophies = clubs.length > 0 ? Math.round(totalTrophies / clubs.length) : 0
  const totalVicePresidents = clubs.reduce((sum, club) => sum + club.vicePresidentCount, 0)
  const totalVeterans = clubs.reduce((sum, club) => sum + club.veteranCount, 0)

  const embed = new EmbedBuilder()
    .setColor('#6f2cff')
    .setDescription('## 📊 Info Clubes TS')
    .addFields(
      { name: 'Total Trofeos:', value: `${EMOJI_TROPHIES} ${formatNumber(totalTrophies)}`, inline: true },
      { name: 'Total Clubs:', value: `${EMOJI_CLUBS} ${formatNumber(clubs.length)}`, inline: true },
      { name: 'Total Miembros:', value: `${EMOJI_MEMBERS_COUNT} ${formatNumber(totalMembers)}`, inline: true },
      { name: 'Promedio Trofeos:', value: `${EMOJI_TROPHIES} ${formatNumber(averageTrophies)}`, inline: true },
      { name: 'Vicepresidentes:', value: `${EMOJI_VICE_PRESIDENT} ${formatNumber(totalVicePresidents)}`, inline: true },
      { name: 'Veteranos:', value: `${EMOJI_VETERAN} ${formatNumber(totalVeterans)}`, inline: true }
    )
    .setFooter({ text: `Última actualización: ${updatedAt}` })

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl)

  return embed
}

function createClubListEmbed(clubs: BrawlClubInfo[], updatedAt: string): EmbedBuilder {
  const visibleClubs = clubs.slice(0, 24)

  const fields = visibleClubs.map(club => {
    const status = formatStatus(club.type)
    const topRanks = formatTopRanks(club)
    const lines = [
      `**${CLUB_EMOJI} ${formatClubName(club)}**`,
      `${EMOJI_TROPHIES} \`${formatNumber(club.trophies)}\``,
      ...(topRanks ? [topRanks] : []),
      `${EMOJI_PRESIDENT} ${formatPresident(club)}`,
      `${EMOJI_REQUIREMENT} \`${formatNumber(club.requiredTrophies)}\``,
      `${EMOJI_MEMBERS} \`${formatNumber(club.membersCount)}\``,
      `${status.emoji} ${status.label}`
    ]

    return {
      name: '\u200b',
      value: lines.join('\n'),
      inline: true
    }
  })

  if (clubs.length > visibleClubs.length) {
    fields.push({
      name: '\u200b',
      value: `Y ${formatNumber(clubs.length - visibleClubs.length)} clubes más`,
      inline: false
    })
  }

  return new EmbedBuilder()
    .setColor('#22d3ee')
    .setTitle(`### ${CLUB_EMOJI} Clubes TS`)
    .addFields(fields)
    .setFooter({ text: `Última actualización: ${updatedAt}` })
}

export async function buildBrawlStarsEmbeds(client: Client): Promise<EmbedBuilder[] | null> {
  if (!brawlStarsApiToken) return null

  const config = await getGuildConfig()
  const entries = resolveClubEntries(config.clubTags)

  if (entries.length === 0) return null

  const clubs = await Promise.all(entries.map(e => fetchClubInfo(e.tag, e.countryCode)))
  const validClubs = clubs.filter((club): club is BrawlClubInfo => club !== null)

  if (validClubs.length === 0) return null

  await resolveClubRanks(validClubs)

  validClubs.sort((a, b) => b.trophies - a.trophies)

  const updatedAt = formatUpdateTime(new Date())
  const thumbnailUrl = client.user?.displayAvatarURL() ?? undefined

  return [
    createSummaryEmbed(validClubs, updatedAt, thumbnailUrl),
    createClubListEmbed(validClubs, updatedAt)
  ]
}

// --- Plantilla de promoción de clubes (texto para copiar/pegar) ---

// IDs fijos del servidor para la plantilla
const PLANTILLA_GUILD_ID = '1093864130030612521'
const PLANTILLA_CHANNEL_ID = '1335991815026905159'
const PLANTILLA_TIMESTAMP_MESSAGE_ID = '1335992875753930825'
const PLANTILLA_MESSAGE_ID = '1335992876856774697'

async function fetchTemplateClub(tag: string): Promise<{ name?: string; trophies?: number; requiredTrophies?: number } | null> {
  const response = await fetch(`https://api.brawlstars.com/v1/clubs/%23${tag}`, {
    headers: {
      Authorization: `Bearer ${brawlStarsApiToken}`,
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    logger.warn('Plantilla clubes: fallo al obtener club', { tag, status: response.status })
    return null
  }

  return (await response.json()) as { name?: string; trophies?: number; requiredTrophies?: number }
}

function formatTemplateTimestamp(date: Date): string {
  return date.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function buildTimestampContent(formattedDate: string): string {
  return `
# Plantilla de Promoción de Clubes
> Esta plantilla, pensada para promocionar los clubes de la comunidad en canales cómo <#1211751809534660608> de otros servidores es editada automaticamente con información del servidor y los clubes de la comunidad cada 2 minutos.
    
## Cómo y quién puede promocionar
> Cualquier usuario con acceso a este canal podra utilizar la plantilla.
> 
> **Pasos a seguir:**
> - **1. Copia la plantilla en tu portapapeles.**
> *Asegurate de hacerlo cada vez que quieras promocionar, para que la plantilla incluya información actualizada.*
> - **2. Únete a un servidor y ve a su canal pensado para promocionar clubes.**
> *En este servidor el canal seria <#1211751809534660608>.*
> - **3. Pega la plantilla en el canal.**
> *Asegurate de que en los anteriores 2 mensajes nadie haya publicado la plantilla.*
    
## Servidores donde se puede promocionar
> [GuilleVGX - Brawl Stars](https://discord.gg/77sQHhmZkm)
> [GoDeik TEAM](https://discord.gg/h2mSWgcMag)
> [Templo de los ricochets (iKaoss community)](https://discord.gg/6VhNHVMgcr)
> [Rol & Role coaching](https://discord.gg/b7eZh27aDH)
> [Brawl Stars Fénix](https://discord.gg/T2QCXxXX8a)
> [ELPIPEKAS - BRAWL STARS](https://discord.gg/pPpdwrMuBk)
> [Pizza BS](https://discord.gg/jcmeX4bS9g)
> [Cats World BS](https://discord.gg/n6qqa5CyN7)
> [Team Turtle](https://discord.gg/jg9Yet8pNW)
    
*Plantilla actualizada cada 2 min, última actualización a las \`${formattedDate}\`.*
    ** **
`
}

function formatTemplateRequired(required: number): string {
  const num = required < 1000
    ? `${required}`
    : `${`${Math.round((required / 1000) * 10) / 10}`.replace(/\.0$/, '')}k`
  return `+ ${num.padStart(4)} 🏆`
}

function formatTemplateRanks(globalRank: number | null, localRank: number | null, flag: string): string {
  const parts: string[] = []
  if (localRank) parts.push(`${`#${localRank}`.padEnd(4)} ${flag}`)
  if (globalRank) parts.push(`${`#${globalRank}`.padEnd(4)} 🌍`)

  return parts.join(' ')
}

function buildPromoContent(members: string, clubs: number, clubsValues: string): string {
  return `
# \`T\` \`S\`   \`C\` \`O\` \`M\` \`U\` \`N\` \`I\` \`T\` \`Y\`
** **
**__Somos una amplia cadena de clubes que cuenta cuenta con clubes tanto en el top Español como en el Global __**
   
### 📙 QUE OFRECEMOS
> - \`${clubs}\` clubes de Brawl Stars
> - Comunidad de Discord con \`${members}\` miembros
> - Staff experimentado en la creación de clubes

### 🔎 QUE BUSCAMOS
> - Miembros activos para nuestros clubes
> - Personas interesadas en la creación de clubes

### 🛡️ NUESTROS CLUBES
\`\`\`${clubsValues}\`\`\`

### 📨 ¡INTERESADOS AL MD!
`
}

/**
 * Actualiza los dos mensajes de la plantilla de promoción de clubes.
 * Edita el mensaje de instrucciones/timestamp y el de promo con datos live.
 */
export async function refreshClubTemplate(client: Client): Promise<void> {
  if (!brawlStarsApiToken) {
    logger.warn('Plantilla clubes omitida: falta BRAWL_STARS_API_TOKEN')
    return
  }

  try {
    const config = await getGuildConfig()
    const entries = resolveClubEntries(config.clubTags)

    if (entries.length === 0) {
      logger.warn('Plantilla clubes omitida: no hay clubTags configurados')
      return
    }

    const guild = client.guilds.cache.get(PLANTILLA_GUILD_ID ?? guildId)
      ?? await client.guilds.fetch(PLANTILLA_GUILD_ID ?? guildId).catch(() => null)
    if (!guild) {
      logger.warn('Plantilla clubes: guild no encontrada')
      return
    }

    const channel = await guild.channels.fetch(PLANTILLA_CHANNEL_ID).catch(() => null)
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn('Plantilla clubes: canal no válido', { channelId: PLANTILLA_CHANNEL_ID })
      return
    }

    const [timestampMsg, promoMsg] = await Promise.all([
      channel.messages.fetch(PLANTILLA_TIMESTAMP_MESSAGE_ID).catch(() => null),
      channel.messages.fetch(PLANTILLA_MESSAGE_ID).catch(() => null)
    ])

    if (!timestampMsg || !promoMsg) {
      logger.warn('Plantilla clubes: mensajes no encontrados')
      return
    }

    const countries = [...new Set(entries.map(e => e.countryCode))]
    const [globalRanks, ...localRankMaps] = await Promise.all([
      fetchRankingMap('global'),
      ...countries.map(cc => fetchRankingMap(cc))
    ])
    const localByCountry = new Map(countries.map((cc, i) => [cc, localRankMaps[i]]))
    const details: Array<{ value: string; trophies: number }> = []

    for (const { tag, countryCode } of entries) {
      const clubTag = tag.replace(/^#+/, '')
      const club = await fetchTemplateClub(clubTag)
      if (!club) continue

      const name = (club.name ?? tag).slice(0, 17).padEnd(17)
      const trophies = club.trophies ?? 0
      const trophiesNum = trophies.toLocaleString('es').padStart(10)
      const required = club.requiredTrophies ?? 0
      const requiredText = formatTemplateRequired(required)

      const key = tag.trim().toUpperCase()
      const globalRank = globalRanks.get(key) ?? null
      const localRank = localByCountry.get(countryCode)?.get(key) ?? null
      const flag = countryCodeToFlag(countryCode)
      const rankingText = formatTemplateRanks(globalRank, localRank, flag)

      const line = `${name}${trophiesNum} 🏆  ${requiredText}  ${rankingText}`.trimEnd()

      details.push({
        value: line,
        trophies
      })
    }

    if (details.length === 0) {
      logger.warn('Plantilla clubes: sin datos válidos de clubes')
      return
    }

    const formattedDate = formatTemplateTimestamp(new Date())
    const members = `+${Math.floor(guild.memberCount / 100) * 100}`
    const clubsValues = details
      .sort((a, b) => b.trophies - a.trophies)
      .map((item) => item.value)
      .join('\n')

    await timestampMsg.edit(buildTimestampContent(formattedDate))
    await promoMsg.edit(buildPromoContent(members, entries.length, clubsValues))

    logger.info('Plantilla clubes actualizada', { clubs: details.length })
  } catch (error) {
    logger.error('Plantilla clubes: error al actualizar', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
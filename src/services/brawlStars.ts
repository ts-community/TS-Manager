import { EmbedBuilder } from 'discord.js'
import { brawlStarsApiToken } from '../config/env'
import { getGuildConfig } from './guild'

const CLUB_EMOJI = '<:Club:1275522702446301338>'
const EMOJI_MEMBERS = '<:miembros:1467129799771426931>'
const EMOJI_PRESIDENT = '<:presidente:1467129797992906917>'
const EMOJI_CLOSED = '<:clubcerrado:1467127831078375569>'
const EMOJI_INVITE_ONLY = '<:soloinvitacion:1467127419088666727>'
const EMOJI_OPEN = '<:clubabierto:1467127417364811917>'
const EMOJI_TROPHIES = '<:copas:1467126361864016025>'
const EMOJI_TOP_GLOBAL = '<:topglobal:1467116653149032565>'
const EMOJI_REQUIREMENT = '<:requisitodecopas:1385558827826544640>'
const FLAG_SPAIN = '🇪🇸'
const EMOJI_VICE_PRESIDENT = '<:vice:1467129801281376362>'
const EMOJI_VETERAN = '<:vete:1467126232326868992>'



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
  locationName: string | null
  locationCountryCode: string | null
  type: 'open' | 'inviteOnly' | 'closed' | string
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

async function fetchClubInfo(tag: string): Promise<BrawlClubInfo | null> {
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
    rank: typeof data.rank === 'number' ? data.rank : null,
    locationName: data.location?.name?.trim() || null,
    locationCountryCode: data.location?.countryCode?.trim().toUpperCase() || null,
    type: data.type || 'closed'
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

function formatRank(club: BrawlClubInfo): string {
  if (!club.rank) return 'Sin ranking global'

  return `Top Global #${formatNumber(club.rank)}`
}

function formatLocation(club: BrawlClubInfo): string {
  return 'España'
}

function formatSpainTop(club: BrawlClubInfo): string | null {
  if (!club.rank || club.rank > 1000) return null

  return `Top #${formatNumber(club.rank)}`
}

function createSummaryEmbed(clubs: BrawlClubInfo[], updatedAt: string): EmbedBuilder {
  const totalTrophies = clubs.reduce((sum, club) => sum + club.trophies, 0)
  const totalMembers = clubs.reduce((sum, club) => sum + club.membersCount, 0)
  const averageTrophies = clubs.length > 0 ? Math.round(totalTrophies / clubs.length) : 0
  const totalVicePresidents = clubs.reduce((sum, club) => sum + club.vicePresidentCount, 0)
  const totalVeterans = clubs.reduce((sum, club) => sum + club.veteranCount, 0)

  return new EmbedBuilder()
    .setColor('#6f2cff')
    .setTitle('Info Clubes TS')
    .addFields(
      { name: 'Total Trofeos:', value: `${EMOJI_TROPHIES} ${formatNumber(totalTrophies)}`, inline: true },
      { name: 'Total Clubs:', value: `🔴 ${formatNumber(clubs.length)}`, inline: true },
      { name: 'Total Miembros:', value: `👥 ${formatNumber(totalMembers)}`, inline: true },
      { name: 'Promedio Trofeos:', value: `${EMOJI_TROPHIES} ${formatNumber(averageTrophies)}`, inline: true },
      { name: 'Vicepresidentes:', value: `${EMOJI_VICE_PRESIDENT} ${formatNumber(totalVicePresidents)}`, inline: true },
      { name: 'Veteranos:', value: `${EMOJI_VETERAN} ${formatNumber(totalVeterans)}`, inline: true }
    )
    .setFooter({ text: `Última actualización: ${updatedAt}` })
}

function createClubListEmbed(clubs: BrawlClubInfo[], updatedAt: string): EmbedBuilder {
  const visibleClubs = clubs.slice(0, 24)

  const fields = visibleClubs.map(club => {
    const status = formatStatus(club.type)
    const spainTop = formatSpainTop(club)
    const lines = [
      `**${CLUB_EMOJI} ${formatClubName(club)}**`,
      `${EMOJI_TROPHIES} \`${formatNumber(club.trophies)}\``,
      `${EMOJI_PRESIDENT} ${formatPresident(club)}`,
      `${EMOJI_REQUIREMENT} \`${formatNumber(club.requiredTrophies)}\``,
      `${EMOJI_MEMBERS} \`${formatNumber(club.membersCount)}\``,
      `${status.emoji} ${status.label}`
    ]

    if (spainTop) {
      lines.splice(2, 0, `${FLAG_SPAIN} ${spainTop}`)
    }

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
    .setTitle('Clubes TS - Página 1')
    .addFields(fields)
    .setFooter({ text: `Última actualización: ${updatedAt}` })
}

export async function buildBrawlStarsEmbeds(): Promise<EmbedBuilder[] | null> {
  if (!brawlStarsApiToken) return null

  const config = await getGuildConfig()
  const tags = [...new Set(config.clubTags.map(normalizeTag))]

  if (tags.length === 0) return null

  const clubs = await Promise.all(tags.map(tag => fetchClubInfo(tag)))
  const validClubs = clubs.filter((club): club is BrawlClubInfo => club !== null)

  if (validClubs.length === 0) return null

  validClubs.sort((a, b) => b.trophies - a.trophies)

  const updatedAt = formatUpdateTime(new Date())

  return [
    createSummaryEmbed(validClubs, updatedAt),
    createClubListEmbed(validClubs, updatedAt)
  ]
}
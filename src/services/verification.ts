import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextChannel
} from 'discord.js'
import { guildId } from '../config/env'
import {
  CLUB_ROLE_EMOJI,
  PRESIDENT_ROLE_ID,
  REVERIFY_INITIAL_DELAY_MS,
  REVERIFY_INTERVAL_MS,
  TROPHY_ROLES,
  UNVERIFIED_ROLE_ID,
  VERIFIED_ROLE_ID,
  VERIFICATION_CHANNEL_ID,
  VERIFICATION_LOG_THREAD_ID,
  VETERAN_ROLE_ID,
  VICE_PRESIDENT_ROLE_ID,
  VICTORY_ROLES,
  type TierRole
} from '../config/verification'
import {
  BrawlStarsApiError,
  getBrawlClubMembers,
  getBrawlClubRank,
  getBrawlPlayer,
  normalizeBrawlTag,
  type BrawlClubRole,
  type BrawlPlayer
} from './brawlStars'
import { resolveClubEntries, type ResolvedClub } from './clubs'
import { getGuildConfig, setGuildConfigCache } from './guild'
import GuildModel from '../models/Guild'
import User from '../models/User'
import type { UserDocument } from '../models/User'
import logger from '../utils/logger'

const PANEL_ACCENT = 0x3B82F6
const API_DELAY_MS = 300

// Emojis custom del servidor
const EMOJI_PRESIDENT = '<:presidente:1467129797992906917>'
const EMOJI_VICE_PRESIDENT = '<:vice:1467129801281376362>'
const EMOJI_VETERAN = '<:vete:1467126232326868992>'
const EMOJI_TROPHIES = '<:copas:1467126361864016025>'
const EMOJI_WINS3VS3 = '<:wins3vs3:1570519008581787788>'
const EMOJI_CLUB = '<:club:1467133380905795848>'

interface SyncResult {
  added: string[]
  removed: string[]
  failed: string[]
}

interface VerificationResult {
  ok: boolean
  message: string
  player?: BrawlPlayer
  roles?: SyncResult
  rank?: BrawlClubRole | null
}

const RANK_LABELS: Record<string, string> = {
  president: 'Presidente',
  vicePresident: 'Vicepresidente',
  senior: 'Veterano',
  member: 'Miembro'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function tierRoleId(tiers: TierRole[], value: number): string | null {
  let best: TierRole | null = null

  for (const tier of tiers) {
    if (!tier.roleId) continue
    if (value >= tier.min && (!best || tier.min > best.min)) best = tier
  }

  return best?.roleId ?? null
}

function rankRoleId(rank: BrawlClubRole | null): string | null {
  switch (rank) {
    case 'president':
      return PRESIDENT_ROLE_ID || null
    case 'vicePresident':
      return VICE_PRESIDENT_ROLE_ID || null
    case 'senior':
      return VETERAN_ROLE_ID || null
    default:
      return null
  }
}

function isClubRoleName(name: string): boolean {
  return name.startsWith(`${CLUB_ROLE_EMOJI} Miembro `)
}

function collectManagedRoleIds(clubs: ResolvedClub[], guild?: Guild): Set<string> {
  const managed = new Set<string>()

  for (const tier of [...TROPHY_ROLES, ...VICTORY_ROLES]) {
    if (tier.roleId) managed.add(tier.roleId)
  }

  for (const id of [PRESIDENT_ROLE_ID, VICE_PRESIDENT_ROLE_ID, VETERAN_ROLE_ID, VERIFIED_ROLE_ID]) {
    if (id) managed.add(id)
  }

  for (const club of clubs) {
    if (club.roleId) managed.add(club.roleId)
  }

  // Los roles de club que ya no pertenecen a la configuración actual también
  // se gestionan: si un club se elimina, sus miembros no deben conservar el rol.
  if (guild) {
    for (const role of guild.roles.cache.values()) {
      if (isClubRoleName(role.name)) managed.add(role.id)
    }
  }

  return managed
}

export function buildVerificationPanel(): { flags: number, components: ContainerBuilder[] } {
  const container = new ContainerBuilder().setAccentColor(PANEL_ACCENT)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '## 🔰 Verificación de Brawl Stars',
      '-# Vincula tu cuenta para acceder a todos los canales y recibir tus roles automáticamente.'
    ].join('\n'))
  )
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '**¿Qué consigues al verificarte?**',
      '- ✅ Acceso completo al servidor.',
      `- ${EMOJI_TROPHIES} Roles automáticos por copas y victorias 3v3.`,
      `- ${EMOJI_CLUB} Rol de tu club oficial.`,
      `- ${EMOJI_PRESIDENT} Rol de tu rango: presidente, vicepresidente o veterano.`,
      '',
      '**¿Cómo funciona?**',
      '1. Pulsa **Verificar**.',
      '2. Escribe tu tag tal como aparece en tu perfil del juego.',
      '3. El bot comprobará tu cuenta y aplicará tus roles.',
      '',
      `-# Solo se permite una cuenta por usuario. Los datos se revisan cada 12 horas.`
    ].join('\n'))
  )
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('verification:verify')
        .setLabel('Verificar')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('verification:refresh')
        .setLabel('Actualizar roles')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    )
  )

  return { flags: MessageFlags.IsComponentsV2, components: [container] }
}

export async function publishVerificationPanel(client: Client): Promise<void> {
  const channel = await client.channels.fetch(VERIFICATION_CHANNEL_ID).catch(() => null)

  if (!channel || !channel.isSendable() || !channel.isTextBased()) {
    throw new Error('El canal de verificación no es válido o el bot no tiene permisos para enviar mensajes.')
  }

  const textChannel = channel as TextChannel
  const config = await getGuildConfig(true)
  const payload = buildVerificationPanel()

  if (config.verificationPanelMessageId) {
    try {
      const message = await textChannel.messages.fetch(config.verificationPanelMessageId)
      await message.edit(payload as never)
      return
    } catch {
      // El mensaje ya no existe: se vuelve a crear abajo.
    }
  }

  const message = await textChannel.send(payload as never)
  config.verificationPanelMessageId = message.id
  await GuildModel.updateOne({ guildId: config.guildId }, { $set: { verificationPanelMessageId: message.id } })
  setGuildConfigCache(config)
  logger.success('Panel de verificación publicado')
}

export async function isUserVerified(_guildId: string, discordId: string): Promise<boolean> {
  return Boolean(await User.exists({ discordId, brawlId: { $ne: null } }))
}

export async function sendVerificationLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const config = await getGuildConfig()
    const threadId = config.verificationThreadId || VERIFICATION_LOG_THREAD_ID
    const channel = await guild.channels.fetch(threadId).catch(() => null)

    if (!channel?.isThread()) {
      logger.warn('No se pudo enviar el log de verificación: hilo no encontrado.')
      return
    }

    if (channel.archived) await channel.setArchived(false).catch(() => {})
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } })
  } catch (error) {
    logger.error('No se pudo enviar el log de verificación', {
      reason: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

function roleMentions(ids: string[]): string {
  return ids.map((id) => `<@&${id}>`).join(' ')
}

const PAGE_SIZE = 10

export type VerificationView = 'summary' | 'clubs' | 'trophies' | 'wins3v3' | 'ranked'

export interface VerificationV2Payload {
  flags: number
  components: ContainerBuilder[]
}

interface Paginated<T> {
  items: T[]
  page: number
  totalPages: number
}

function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Number.isFinite(page) ? Math.trunc(page) : 0
  const currentPage = Math.min(Math.max(0, safePage), totalPages - 1)

  return {
    items: items.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    page: currentPage,
    totalPages
  }
}

function separatorBuilder(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
}

function textDisplay(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

function rankEmoji(rank: string | null): string {
  if (rank === 'president') return EMOJI_PRESIDENT
  if (rank === 'vicePresident') return EMOJI_VICE_PRESIDENT
  if (rank === 'senior') return EMOJI_VETERAN

  return '⚔️'
}

const SUMMARY_BUTTONS: Array<{ id: VerificationView; label: string; emoji: string }> = [
  { id: 'clubs', label: 'Clubes', emoji: EMOJI_CLUB },
  { id: 'trophies', label: 'Top Copas', emoji: EMOJI_TROPHIES },
  { id: 'wins3v3', label: 'Top 3v3', emoji: EMOJI_WINS3VS3 },
  { id: 'ranked', label: 'Rankeds', emoji: '⚔️' }
]

function buildSummaryNavigation(active: VerificationView): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>()

  for (const button of SUMMARY_BUTTONS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`verification:summary:${button.id}`)
        .setLabel(button.label)
        .setEmoji(button.emoji)
        .setStyle(button.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(button.id === active)
    )
  }

  if (active !== 'summary') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('verification:summary:summary')
        .setLabel('Volver')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary)
    )
  }

  return row
}

function buildSummaryPagination(
  view: VerificationView,
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder> | null {
  if (totalPages <= 1) return null

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`verification:summary:${view}:${page - 1}`)
      .setLabel('Anterior')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`verification:summary:${view}:${page + 1}`)
      .setLabel('Siguiente')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  )
}

function entryCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export async function buildVerificationSummary(guild: Guild): Promise<VerificationV2Payload> {
  const [config, entries] = await Promise.all([
    getGuildConfig(true),
    User.find({ brawlId: { $ne: null } }).sort({ trophies: -1 }).lean()
  ])

  const officialClubs = resolveClubEntries(config.clubTags)
  const officialTags = new Set(officialClubs.map((club) => normalizeBrawlTag(club.tag)))

  const total = entries.length
  const withClub = entries.filter((entry) => entry.clubTag).length
  const inOfficialClub = entries.filter(
    (entry) => entry.clubTag && officialTags.has(normalizeBrawlTag(entry.clubTag))
  ).length
  const withoutClub = total - withClub
  const inOtherClubs = withClub - inOfficialClub
  const withRanked = entries.filter((entry) => entry.rankedElo !== null && entry.rankedElo !== undefined).length

  let lastChecked: Date | null = null

  for (const entry of entries) {
    if (entry.lastCheckedAt && (!lastChecked || entry.lastCheckedAt > lastChecked)) lastChecked = entry.lastCheckedAt
  }

  const lines = [
    '## 📊 Resumen de verificación',
    '',
    `✅ **${entryCountLabel(total, 'cuenta verificada', 'cuentas verificadas')}**`,
    `-# de **${guild.memberCount.toLocaleString('es-ES')}** ${guild.memberCount === 1 ? 'miembro' : 'miembros'}`,
    '',
    `${EMOJI_CLUB} **Clubes oficiales:** **${inOfficialClub}**`,
    `🌐 **Otros clubes:** **${inOtherClubs}**`,
    `🚫 **Sin club:** **${withoutClub}**`,
    `⚔️ **Con ranked:** **${withRanked}**`
  ]

  if (officialClubs.length === 0) {
    lines.push('-# ⚠️ No hay clubes oficiales configurados en este servidor.')
  }

  if (lastChecked) {
    lines.push(`-# Última comprobación: <t:${Math.floor(lastChecked.getTime() / 1000)}:R>`)
  }

  const container = new ContainerBuilder().setAccentColor(PANEL_ACCENT)
  container.addTextDisplayComponents(textDisplay(lines.join('\n')))
  container.addSeparatorComponents(separatorBuilder())
  container.addTextDisplayComponents(textDisplay('**Explora el resumen:**'))
  container.addActionRowComponents(buildSummaryNavigation('summary'))

  return { flags: MessageFlags.IsComponentsV2, components: [container] }
}

export async function buildVerificationSummaryView(
  view: string,
  guild: Guild,
  page = 0
): Promise<VerificationV2Payload | null> {
  if (view === 'summary' || view === 'main') {
    return buildVerificationSummary(guild)
  }

  const [config, entries] = await Promise.all([
    getGuildConfig(true),
    User.find({ brawlId: { $ne: null } }).lean()
  ])
  const container = new ContainerBuilder().setAccentColor(PANEL_ACCENT)

  if (view === 'clubs') {
    const officialClubs = resolveClubEntries(config.clubTags)
    const officialTags = new Set(officialClubs.map((club) => normalizeBrawlTag(club.tag)))
    const clubData = new Map<string, { name: string; count: number; ranks: Map<string, number> }>()

    for (const entry of entries) {
      if (!entry.clubTag) continue

      const tag = normalizeBrawlTag(entry.clubTag)
      if (!officialTags.has(tag)) continue

      const data = clubData.get(tag) ?? {
        name: entry.clubName ?? `#${tag}`,
        count: 0,
        ranks: new Map<string, number>()
      }
      data.count += 1
      if (entry.clubRank) data.ranks.set(entry.clubRank, (data.ranks.get(entry.clubRank) ?? 0) + 1)
      clubData.set(tag, data)
    }

    const sortedClubs = [...clubData.entries()].sort((a, b) => b[1].count - a[1].count)
    const pageData = paginate(sortedClubs, page)

    if (!sortedClubs.length) {
      container.addTextDisplayComponents(
        textDisplay(
          [
            `## ${EMOJI_CLUB} Clubes oficiales`,
            '',
            officialClubs.length === 0
              ? 'No hay clubes oficiales configurados en este servidor.'
              : 'Ningún miembro verificado pertenece a los clubes oficiales.'
          ].join('\n')
        )
      )
    } else {
      const lines = pageData.items.map(([tag, data], index) => {
        const position = pageData.page * PAGE_SIZE + index + 1
        const rankParts = [...data.ranks.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([rank, count]) => `${rankEmoji(rank)} ${rankLabel(rank)}: **${count}**`)

        return [
          `**${position}. ${data.name}** \`#${tag}\``,
          `> ${EMOJI_CLUB} **${entryCountLabel(data.count, 'miembro', 'miembros')}**`,
          rankParts.length ? `> ${rankParts.join('     ')}` : null
        ].filter(Boolean).join('\n')
      })

      container.addTextDisplayComponents(
        textDisplay([
          `## ${EMOJI_CLUB} Clubes oficiales`,
          `-# Página **${pageData.page + 1}/${pageData.totalPages}** — **${entryCountLabel(sortedClubs.length, 'club', 'clubes')}**`,
          '',
          lines.join('\n\n')
        ].join('\n'))
      )
    }

    container.addSeparatorComponents(separatorBuilder())
    const pagination = buildSummaryPagination('clubs', pageData.page, pageData.totalPages)
    if (pagination) container.addActionRowComponents(pagination)
    container.addActionRowComponents(buildSummaryNavigation('clubs'))

    return { flags: MessageFlags.IsComponentsV2, components: [container] }
  }

  if (view === 'trophies' || view === 'wins3v3') {
    const isTrophies = view === 'trophies'
    const sorted = [...entries].sort((a, b) =>
      isTrophies
        ? (b.trophies ?? 0) - (a.trophies ?? 0)
        : (b.victories ?? 0) - (a.victories ?? 0)
    )
    const pageData = paginate(sorted, page)
    const title = isTrophies ? '## 🏆 Top por copas' : '## ⚔️ Top por victorias 3v3'
    const emoji = isTrophies ? EMOJI_TROPHIES : EMOJI_WINS3VS3

    if (!sorted.length) {
      container.addTextDisplayComponents(
        textDisplay([title, '', 'No hay miembros verificados.'].join('\n'))
      )
    } else {
      const lines = pageData.items.map((entry, index) => {
        const position = pageData.page * PAGE_SIZE + index + 1
        const value = isTrophies ? entry.trophies ?? 0 : entry.victories ?? 0

        return [
          `**${position}. ${entry.playerName ?? 'Desconocido'}** \`#${entry.brawlId}\``,
          `> ${emoji} **${value.toLocaleString('es-ES')}**`
        ].join('\n')
      })

      container.addTextDisplayComponents(
        textDisplay([
          title,
          `-# Página **${pageData.page + 1}/${pageData.totalPages}** — **${entryCountLabel(sorted.length, 'cuenta', 'cuentas')}**`,
          '',
          lines.join('\n\n')
        ].join('\n'))
      )
    }

    container.addSeparatorComponents(separatorBuilder())
    const pagination = buildSummaryPagination(view, pageData.page, pageData.totalPages)
    if (pagination) container.addActionRowComponents(pagination)
    container.addActionRowComponents(buildSummaryNavigation(view))

    return { flags: MessageFlags.IsComponentsV2, components: [container] }
  }

  if (view === 'ranked') {
    const ranked = entries
      .filter((entry) => typeof entry.rankedElo === 'number')
      .sort((a, b) => (b.rankedElo ?? 0) - (a.rankedElo ?? 0))
    const pageData = paginate(ranked, page)

    if (!ranked.length) {
      container.addTextDisplayComponents(
        textDisplay(
          [
            '## ⚔️ Rankeds',
            '',
            'No hay datos de ranked registrados todavía.',
            '-# Se actualizan al verificar o refrescar la cuenta. Los jugadores sin ranked no aparecen.'
          ].join('\n')
        )
      )
    } else {
      const lines = pageData.items.map((entry, index) => {
        const position = pageData.page * PAGE_SIZE + index + 1
        const current = `${entry.rankedRankName ?? 'Sin rango'} — **${(entry.rankedElo ?? 0).toLocaleString('es-ES')} elo**`
        const peak = entry.highestAllTimeRankedElo !== null && entry.highestAllTimeRankedElo !== undefined
          ? `> 🏔️ **Máximo:** ${entry.highestAllTimeRankedRankName ?? 'Sin rango'} — **${entry.highestAllTimeRankedElo.toLocaleString('es-ES')} elo**`
          : null

        return [
          `**${position}. ${entry.playerName ?? 'Desconocido'}** \`#${entry.brawlId}\``,
          `> ⚔️ **Actual:** ${current}`,
          peak
        ].filter(Boolean).join('\n')
      })

      container.addTextDisplayComponents(
        textDisplay([
          '## ⚔️ Rankeds',
          `-# Página **${pageData.page + 1}/${pageData.totalPages}** — **${entryCountLabel(ranked.length, 'cuenta con ranked', 'cuentas con ranked')}**`,
          '',
          lines.join('\n\n')
        ].join('\n'))
      )
    }

    container.addSeparatorComponents(separatorBuilder())
    const pagination = buildSummaryPagination('ranked', pageData.page, pageData.totalPages)
    if (pagination) container.addActionRowComponents(pagination)
    container.addActionRowComponents(buildSummaryNavigation('ranked'))

    return { flags: MessageFlags.IsComponentsV2, components: [container] }
  }

  return null
}

export async function syncMemberRoles(
  member: GuildMember,
  player: BrawlPlayer,
  rank: BrawlClubRole | null,
  clubs: ResolvedClub[]
): Promise<SyncResult> {
  const clubTag = player.club?.tag ? normalizeBrawlTag(player.club.tag) : null
  const club = clubTag ? clubs.find((entry) => normalizeBrawlTag(entry.tag) === clubTag) : undefined
  const clubRoleId = club?.roleId ?? null
  const isRegisteredClub = club !== undefined

  const desired = new Set<string>()
  if (VERIFIED_ROLE_ID) desired.add(VERIFIED_ROLE_ID)

  const trophyRole = tierRoleId(TROPHY_ROLES, player.trophies)
  if (trophyRole) desired.add(trophyRole)

  const victoryRole = tierRoleId(VICTORY_ROLES, player['3vs3Victories'] ?? 0)
  if (victoryRole) desired.add(victoryRole)

  // Solo asignar rol de rango si el club está registrado en la base de datos
  if (isRegisteredClub) {
    const rankRole = rankRoleId(rank)
    if (rankRole) desired.add(rankRole)
  }

  if (clubRoleId) desired.add(clubRoleId)

  const managed = collectManagedRoleIds(clubs, member.guild)
  const added: string[] = []
  const removed: string[] = []
  const failed: string[] = []

  for (const roleId of desired) {
    if (member.roles.cache.has(roleId)) continue

    try {
      await member.roles.add(roleId, 'Verificación de Brawl Stars')
      added.push(roleId)
    } catch (error) {
      failed.push(roleId)
      logger.warn(`No se pudo añadir el rol ${roleId} a ${member.id}: ${(error as Error).message}`)
    }
  }

  for (const roleId of managed) {
    if (desired.has(roleId) || !member.roles.cache.has(roleId)) continue

    try {
      await member.roles.remove(roleId, 'Verificación de Brawl Stars')
      removed.push(roleId)
    } catch (error) {
      failed.push(roleId)
      logger.warn(`No se pudo quitar el rol ${roleId} a ${member.id}: ${(error as Error).message}`)
    }
  }

  if (UNVERIFIED_ROLE_ID && member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    try {
      await member.roles.remove(UNVERIFIED_ROLE_ID, 'Verificación de Brawl Stars')
      removed.push(UNVERIFIED_ROLE_ID)
    } catch (error) {
      failed.push(UNVERIFIED_ROLE_ID)
      logger.warn(`No se pudo quitar el rol de no verificado a ${member.id}: ${(error as Error).message}`)
    }
  }

  return { added, removed, failed }
}

export async function applyUnverifiedRoles(member: GuildMember, clubs: ResolvedClub[]): Promise<void> {
  const managed = collectManagedRoleIds(clubs, member.guild)

  for (const roleId of managed) {
    if (!member.roles.cache.has(roleId)) continue

    await member.roles.remove(roleId, 'Verificación de Brawl Stars').catch((error: Error) => {
      logger.warn(`No se pudo quitar el rol ${roleId} a ${member.id}: ${error.message}`)
    })
  }

  if (UNVERIFIED_ROLE_ID && !member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
    await member.roles.add(UNVERIFIED_ROLE_ID, 'Verificación de Brawl Stars').catch((error: Error) => {
      logger.warn(`No se pudo añadir el rol de no verificado a ${member.id}: ${error.message}`)
    })
  }
}

export async function unverifyMember(
  guild: Guild,
  member: GuildMember,
  actorId?: string
): Promise<{ hadRecord: boolean; previousTag: string | null; previousName: string | null }> {
  const config = await getGuildConfig(true)
  const clubs = resolveClubEntries(config.clubTags)
  const entry = await User.findOne({ discordId: member.id })
  const previousTag = entry?.brawlId ?? null
  const previousName = entry?.playerName ?? null

  if (entry) {
    entry.brawlId = null
    entry.playerName = null
    entry.trophies = null
    entry.victories = null
    entry.clubTag = null
    entry.clubName = null
    entry.clubRank = null
    entry.rankedSeasonId = null
    entry.rankedRank = null
    entry.rankedRankName = null
    entry.rankedElo = null
    entry.highestAllTimeRankedElo = null
    entry.highestAllTimeRankedRank = null
    entry.highestAllTimeRankedRankName = null
    entry.verifiedAt = null
    entry.lastCheckedAt = null
    await entry.save()
  }

  await applyUnverifiedRoles(member, clubs)

  const embed = new EmbedBuilder()
    .setColor('Orange')
    .setTitle('🔓 Usuario desverificado')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '👤 Usuario', value: `<@${member.id}>\n\`${member.user.tag}\`` },
      { name: '🏷️ Estado', value: 'Se le aplicó el rol de **no verificado**.', inline: true }
    )

  if (previousTag) {
    embed.addFields({
      name: '🎮 Cuenta desvinculada',
      value: `**${previousName ?? 'Desconocido'}**\n\`#${previousTag}\``,
      inline: true
    })
  }

  if (actorId && actorId !== member.id) {
    embed.addFields({ name: '🛡️ Acción por', value: `<@${actorId}>`, inline: true })
  }

  embed.setTimestamp()

  await sendVerificationLog(guild, embed)

  return { hadRecord: Boolean(previousTag), previousTag, previousName }
}

export async function verifyMember(
  guild: Guild,
  member: GuildMember,
  rawTag: string,
  actorId?: string
): Promise<VerificationResult> {
  const tag = normalizeBrawlTag(rawTag)

  if (!tag) {
    return { ok: false, message: 'Escribe un tag de Brawl Stars válido.' }
  }

  const existing = await User.findOne({ discordId: member.id })
  const usedByOther = await User.findOne({ brawlId: tag })

  if (usedByOther && usedByOther.discordId !== member.id) {
    return { ok: false, message: 'Esa cuenta de Brawl Stars ya está vinculada a otro usuario.' }
  }

  let player: BrawlPlayer

  try {
    player = await getBrawlPlayer(tag)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se pudo consultar la cuenta de Brawl Stars.'
    }
  }

  const config = await getGuildConfig(true)
  const clubs = resolveClubEntries(config.clubTags)
  const clubTag = player.club?.tag ? normalizeBrawlTag(player.club.tag) : null
  const rank = clubTag ? await getBrawlClubRank(clubTag, tag) : null
  const roles = await syncMemberRoles(member, player, rank, clubs)

  const now = new Date()
  const isFirstTime = !existing || !existing.brawlId

  try {
    await User.findOneAndUpdate(
      { discordId: member.id },
      {
        $set: {
          brawlId: tag,
          playerName: player.name,
          trophies: player.trophies,
          victories: player['3vs3Victories'] ?? 0,
          rankedSeasonId: player.rankedSeasonId ?? null,
          rankedRank: player.rankedRank ?? null,
          rankedRankName: player.rankedRankName ?? null,
          rankedElo: player.rankedElo ?? null,
          highestAllTimeRankedElo: player.highestAllTimeRankedElo ?? null,
          highestAllTimeRankedRank: player.highestAllTimeRankedRank ?? null,
          highestAllTimeRankedRankName: player.highestAllTimeRankedRankName ?? null,
          clubTag,
          clubName: clubTag ? player.club?.name ?? null : null,
          clubRank: rank,
          verifiedAt: isFirstTime ? now : existing?.verifiedAt ?? now,
          lastCheckedAt: now
        },
        $setOnInsert: { teamId: null }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { ok: false, message: 'Esa cuenta de Brawl Stars ya está vinculada a otro usuario.' }
    }

    throw error
  }

  const previousTag = existing ? existing.brawlId : null
  const title = isFirstTime
    ? 'Usuario verificado'
    : previousTag !== tag
      ? 'Tag actualizado'
      : 'Cuenta re-verificada'

  const embed = new EmbedBuilder()
    .setColor(previousTag && previousTag !== tag ? 'Blue' : 'Green')
    .setTitle(`✅ ${title}`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '👤 Usuario', value: `<@${member.id}>\n\`${member.user.tag}\`` },
      { name: '🎮 Jugador', value: `**${player.name}**`, inline: true },
      { name: '🏷️ Tag', value: `\`#${tag}\``, inline: true },
      { name: `${EMOJI_TROPHIES} Copas`, value: player.trophies.toLocaleString('es-ES'), inline: true },
      { name: `${EMOJI_WINS3VS3} Victorias 3v3`, value: (player['3vs3Victories'] ?? 0).toLocaleString('es-ES'), inline: true }
    )

  if (player.club?.name) {
    const clubTag = player.club.tag ? normalizeBrawlTag(player.club.tag) : null
    embed.addFields({
      name: `${EMOJI_CLUB} Club`,
      value: clubTag ? `**${player.club.name}**\n\`#${clubTag}\`` : `**${player.club.name}**`,
      inline: true
    })
  }
  if (rank) embed.addFields({ name: '🎖️ Rango', value: rankLabel(rank), inline: true })
  if (previousTag && previousTag !== tag) {
    embed.addFields({ name: '🏷️ Tag anterior', value: `\`#${previousTag}\``, inline: true })
  }
  if (actorId && actorId !== member.id) {
    embed.addFields({ name: '🛡️ Acción por', value: `<@${actorId}>`, inline: true })
  }
  if (roles.added.length) {
    embed.addFields({ name: '➕ Roles añadidos', value: roleMentions(roles.added) })
  }
  if (roles.removed.length) {
    embed.addFields({ name: '➖ Roles quitados', value: roleMentions(roles.removed) })
  }
  if (roles.failed.length) {
    embed.setFooter({ text: `No se pudieron aplicar ${roles.failed.length} rol(es)` })
  }

  embed.setTimestamp()

  await sendVerificationLog(guild, embed)

  return { ok: true, message: 'Cuenta verificada correctamente.', player, roles, rank }
}

export interface VerificationMessageOptions {
  title: string
  description?: string
  details?: string[]
  accent?: number
  footer?: string
}

export function buildVerificationMessage(options: VerificationMessageOptions): VerificationV2Payload {
  const container = new ContainerBuilder().setAccentColor(options.accent ?? PANEL_ACCENT)
  const header = [`## ${options.title}`]

  if (options.description) header.push('', options.description)

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header.join('\n')))

  if (options.details?.length) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(options.details.join('\n'))
    )
  }

  if (options.footer) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${options.footer}`)
    )
  }

  return { flags: MessageFlags.IsComponentsV2, components: [container] }
}

export function buildVerificationResultMessage(
  result: VerificationResult,
  options: { title?: string; accent?: number; footer?: string } = {}
): VerificationV2Payload {
  if (!result.ok || !result.player) {
    return buildVerificationMessage({
      title: options.title ?? '❌ No se pudo verificar',
      description: result.message,
      accent: options.accent ?? 0xef4444,
      footer: options.footer
    })
  }

  const player = result.player
  const tag = normalizeBrawlTag(player.tag)
  const title = options.title ?? '✅ Cuenta verificada'
  const container = new ContainerBuilder().setAccentColor(options.accent ?? 0x22c55e)
  const details = [
    `**👤 Jugador:** **${player.name}**`,
    `**🏷️ Tag:** \`#${tag}\``,
    `${EMOJI_TROPHIES} **Copas:** **${player.trophies.toLocaleString('es-ES')}**`,
    `${EMOJI_WINS3VS3} **Victorias 3v3:** **${(player['3vs3Victories'] ?? 0).toLocaleString('es-ES')}**`
  ]

  if (player.club?.name) {
    const clubTag = player.club.tag ? normalizeBrawlTag(player.club.tag) : null
    details.push(
      `${EMOJI_CLUB} **Club:** **${player.club.name}**${clubTag ? ` \`#${clubTag}\`` : ''}`
    )
  }

  if (result.rank) {
    details.push(`**Rango:** ${rankEmoji(result.rank)} **${rankLabel(result.rank)}**`)
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([`## ${title}`, '', ...details].join('\n'))
  )

  if (result.roles?.added.length || result.roles?.removed.length) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )

    const roleLines: string[] = []

    if (result.roles?.added.length) {
      roleLines.push(`**➕ Roles añadidos:** ${roleMentions(result.roles.added)}`)
    }

    if (result.roles?.removed.length) {
      roleLines.push(`**➖ Roles quitados:** ${roleMentions(result.roles.removed)}`)
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(roleLines.join('\n')))
  }

  const footers = [options.footer ?? '']

  if (result.roles?.failed.length) {
    footers.push(
      `No se pudieron aplicar ${result.roles.failed.length} rol(es). Avisa a un administrador.`
    )
  }

  const footer = footers.filter(Boolean).join(' ')

  if (footer) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`))
  }

  return { flags: MessageFlags.IsComponentsV2, components: [container] }
}

export async function handleVerificationModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild

  if (!guild) {
    await interaction.reply({ content: 'Esta acción solo funciona dentro del servidor.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await guild.members.fetch(interaction.user.id).catch(() => null)

  if (!member) {
    await interaction.editReply(
      buildVerificationMessage({
        title: '⚠️ No encontrado',
        description: 'No se pudo encontrar tu usuario en el servidor.',
        accent: 0xf59e0b
      })
    )
    return
  }

  try {
    const result = await verifyMember(guild, member, interaction.fields.getTextInputValue('tag'))
    await interaction.editReply(buildVerificationResultMessage(result))
  } catch (error) {
    logger.error('Error verificando una cuenta', {
      user: interaction.user.id,
      reason: error instanceof Error ? error.message : 'Unknown error'
    })
    await interaction.editReply(
      buildVerificationMessage({
        title: '❌ Error',
        description: 'Ocurrió un error al verificar tu cuenta. Inténtalo de nuevo más tarde.',
        accent: 0xef4444
      })
    )
  }
}

export async function refreshMemberRoles(interaction: ButtonInteraction): Promise<void> {
  const guild = interaction.guild

  if (!guild) {
    await interaction.reply({ content: 'Esta acción solo funciona dentro del servidor.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })

  const member = await guild.members.fetch(interaction.user.id).catch(() => null)

  if (!member) {
    await interaction.editReply(
      buildVerificationMessage({
        title: '⚠️ No encontrado',
        description: 'No se pudo encontrar tu usuario en el servidor.',
        accent: 0xf59e0b
      })
    )
    return
  }

  const user = await User.findOne({ discordId: member.id })

  if (!user || !user.brawlId) {
    await interaction.editReply(
      buildVerificationMessage({
        title: '🔗 Cuenta sin vincular',
        description: 'Todavía no tienes una cuenta vinculada. Pulsa **Verificar** primero.',
        accent: 0xf59e0b
      })
    )
    return
  }

  try {
    const player = await getBrawlPlayer(user.brawlId)
    const config = await getGuildConfig(true)
    const clubs = resolveClubEntries(config.clubTags)
    const clubTag = player.club?.tag ? normalizeBrawlTag(player.club.tag) : null
    const rank = clubTag ? await getBrawlClubRank(clubTag, user.brawlId) : null
    const roles = await syncMemberRoles(member, player, rank, clubs)

    user.playerName = player.name
    user.trophies = player.trophies
    user.victories = player['3vs3Victories'] ?? 0
    user.rankedSeasonId = player.rankedSeasonId ?? null
    user.rankedRank = player.rankedRank ?? null
    user.rankedRankName = player.rankedRankName ?? null
    user.rankedElo = player.rankedElo ?? null
    user.highestAllTimeRankedElo = player.highestAllTimeRankedElo ?? null
    user.highestAllTimeRankedRank = player.highestAllTimeRankedRank ?? null
    user.highestAllTimeRankedRankName = player.highestAllTimeRankedRankName ?? null
    user.clubTag = clubTag
    user.clubName = clubTag ? player.club?.name ?? null : null
    user.clubRank = rank
    user.lastCheckedAt = new Date()
    await user.save()

    if (roles.added.length || roles.removed.length) {
      const embed = new EmbedBuilder()
        .setColor(0x3B82F6)
        .setTitle('Roles actualizados')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: 'Usuario', value: `<@${member.id}> (\`${member.user.tag}\`)` },
          { name: 'Jugador Brawl Stars', value: `**${player.name}**\n\`#${normalizeBrawlTag(player.tag)}\`` }
        )

      if (roles.added.length) embed.addFields({ name: 'Roles añadidos', value: roleMentions(roles.added) })
      if (roles.removed.length) embed.addFields({ name: 'Roles quitados', value: roleMentions(roles.removed) })
      if (player.club?.name) embed.addFields({ name: 'Club', value: player.club.name, inline: true })
      if (rank) embed.addFields({ name: 'Rango', value: rankLabel(rank), inline: true })
      embed.setTimestamp()

      await sendVerificationLog(guild, embed)
    }

    await interaction.editReply(
      buildVerificationResultMessage(
        { ok: true, message: 'Roles actualizados.', player, roles, rank },
        { title: '🔄 Roles actualizados' }
      )
    )
  } catch (error) {
    if (error instanceof BrawlStarsApiError && error.status === 404) {
      const config = await getGuildConfig(true)
      const clubs = resolveClubEntries(config.clubTags)
      await applyUnverifiedRoles(member, clubs)
      const brawlTag = user.brawlId
      user.brawlId = null
      user.playerName = null
      user.trophies = null
      user.victories = null
      user.clubTag = null
      user.clubName = null
      user.clubRank = null
      user.rankedSeasonId = null
      user.rankedRank = null
      user.rankedRankName = null
      user.rankedElo = null
      user.highestAllTimeRankedElo = null
      user.highestAllTimeRankedRank = null
      user.highestAllTimeRankedRankName = null
      user.verifiedAt = null
      user.lastCheckedAt = null
      await user.save()

      await sendVerificationLog(
        guild,
        new EmbedBuilder()
          .setColor('Orange')
          .setTitle('Cuenta no encontrada')
          .setDescription(`<@${member.id}> ya no tiene la cuenta \`#${brawlTag}\`. Se le marcó como no verificado.`)
          .setTimestamp()
      )

      await interaction.editReply(
        buildVerificationMessage({
          title: '⚠️ Cuenta no encontrada',
          description:
            'Tu cuenta ya no existe o cambió de tag. Se te ha marcado como no verificado; vuelve a verificarte con el botón **Verificar**.',
          accent: 0xf59e0b
        })
      )
      return
    }

    const message = error instanceof Error ? error.message : 'No se pudo consultar la cuenta.'
    await interaction.editReply(
      buildVerificationMessage({
        title: '❌ Error',
        description: message,
        accent: 0xef4444
      })
    )
  }
}

interface ManagedRoleUser {
  discordId: string
  brawlId?: string | null
  trophies?: number | null
  victories?: number | null
  clubTag?: string | null
  clubRank?: string | null
}

function buildExpectedManagedRoles(user: ManagedRoleUser | undefined, clubs: ResolvedClub[]): Set<string> {
  const desired = new Set<string>()
  if (!user?.brawlId) return desired

  if (VERIFIED_ROLE_ID) desired.add(VERIFIED_ROLE_ID)

  const trophyRole = tierRoleId(TROPHY_ROLES, user.trophies ?? 0)
  if (trophyRole) desired.add(trophyRole)

  const victoryRole = tierRoleId(VICTORY_ROLES, user.victories ?? 0)
  if (victoryRole) desired.add(victoryRole)

  const clubTag = user.clubTag ? normalizeBrawlTag(user.clubTag) : null
  const club = clubTag ? clubs.find((entry) => normalizeBrawlTag(entry.tag) === clubTag) : undefined

  if (club) {
    if (club.roleId) desired.add(club.roleId)

    const rankRole = rankRoleId((user.clubRank ?? null) as BrawlClubRole | null)
    if (rankRole) desired.add(rankRole)
  }

  return desired
}

async function cleanupOrphanManagedRoles(
  guild: Guild,
  members: Iterable<GuildMember>,
  users: ManagedRoleUser[],
  clubs: ResolvedClub[]
): Promise<number> {
  const byDiscordId = new Map(users.map((user) => [user.discordId, user]))
  const managed = [...collectManagedRoleIds(clubs, guild)]
  let cleaned = 0

  for (const member of members) {
    const held = managed.filter((roleId) => member.roles.cache.has(roleId))
    if (!held.length) continue

    const user = byDiscordId.get(member.id)
    const desired = buildExpectedManagedRoles(user, clubs)
    const toRemove = held.filter((roleId) => !desired.has(roleId))

    if (toRemove.length) {
      try {
        await member.roles.remove(
          toRemove,
          'Verificación de Brawl Stars: roles que ya no corresponden'
        )
        cleaned += toRemove.length
      } catch (error) {
        logger.warn(`No se pudieron limpiar los roles de ${member.id}: ${(error as Error).message}`)
      }
    }

    if (!user?.brawlId && UNVERIFIED_ROLE_ID && !member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
      await member.roles
        .add(UNVERIFIED_ROLE_ID, 'Verificación de Brawl Stars: cuenta no verificada')
        .catch((error: Error) => {
          logger.warn(`No se pudo añadir el rol de no verificado a ${member.id}: ${error.message}`)
        })
    }
  }

  return cleaned
}

export async function reverifyAllMembers(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null)

  if (!guild) {
    logger.warn('No se pudo re-verificar: servidor no encontrado.')
    return
  }

  const members = await guild.members.fetch()
  const config = await getGuildConfig(true)
  const clubs = resolveClubEntries(config.clubTags)
  const allUsers = await User.find({})
  const users = allUsers.filter((user) => Boolean(user.brawlId))
  const rankCache = new Map<string, Map<string, BrawlClubRole>>()
  const getRank = async (clubTag: string, playerTag: string): Promise<BrawlClubRole | null> => {
    let cached = rankCache.get(clubTag)

    if (!cached) {
      try {
        const clubMembers = await getBrawlClubMembers(clubTag)
        cached = new Map(clubMembers.map((clubMember) => [clubMember.tag, clubMember.role]))
        rankCache.set(clubTag, cached)
      } catch (error) {
        logger.warn(`No se pudo cargar el club ${clubTag}: ${(error as Error).message}`)
        return null
      }
      await sleep(API_DELAY_MS)
    }

    return cached.get(normalizeBrawlTag(playerTag)) ?? null
  }

  let updated = 0
  let unlinked = 0
  let skipped = 0

  for (const user of users) {
    const member = members.get(user.discordId)

    if (!member) {
      user.brawlId = null
      user.playerName = null
      user.trophies = null
      user.victories = null
      user.clubTag = null
      user.clubName = null
      user.clubRank = null
      user.rankedSeasonId = null
      user.rankedRank = null
      user.rankedRankName = null
      user.rankedElo = null
      user.highestAllTimeRankedElo = null
      user.highestAllTimeRankedRank = null
      user.highestAllTimeRankedRankName = null
      user.verifiedAt = null
      user.lastCheckedAt = null
      await user.save()
      unlinked += 1
      continue
    }

    let player: BrawlPlayer

    try {
      player = await getBrawlPlayer(user.brawlId!)
    } catch (error) {
      if (error instanceof BrawlStarsApiError && error.status === 404) {
        await applyUnverifiedRoles(member, clubs)
        const brawlTag = user.brawlId
        user.brawlId = null
        user.playerName = null
        user.trophies = null
        user.victories = null
        user.clubTag = null
        user.clubName = null
        user.clubRank = null
user.rankedSeasonId = null
        user.rankedRank = null
        user.rankedRankName = null
        user.rankedElo = null
        user.highestAllTimeRankedElo = null
        user.highestAllTimeRankedRank = null
        user.highestAllTimeRankedRankName = null
        user.verifiedAt = null
        user.lastCheckedAt = null
        await user.save()
        unlinked += 1

        await sendVerificationLog(
          guild,
          new EmbedBuilder()
            .setColor('Orange')
            .setTitle('Cuenta no encontrada (revisión automática)')
            .setDescription(`<@${user.discordId}> ya no tiene la cuenta \`#${brawlTag}\`. Se le marcó como no verificado.`)
            .setTimestamp()
        )
      } else {
        skipped += 1
        logger.warn(`No se pudo re-verificar a ${user.discordId}: ${(error as Error).message}`)
      }

      await sleep(API_DELAY_MS)
      continue
    }

    const clubTag = player.club?.tag ? normalizeBrawlTag(player.club.tag) : null
    const rank = clubTag ? await getRank(clubTag, user.brawlId!) : null

    try {
      await syncMemberRoles(member, player, rank, clubs)
    } catch (error) {
      skipped += 1
      logger.warn(`No se pudieron sincronizar los roles de ${user.discordId}: ${(error as Error).message}`)
      await sleep(API_DELAY_MS)
      continue
    }

    user.playerName = player.name
    user.trophies = player.trophies
    user.victories = player['3vs3Victories'] ?? 0
    user.rankedSeasonId = player.rankedSeasonId ?? null
    user.rankedRank = player.rankedRank ?? null
    user.rankedRankName = player.rankedRankName ?? null
    user.rankedElo = player.rankedElo ?? null
    user.highestAllTimeRankedElo = player.highestAllTimeRankedElo ?? null
    user.highestAllTimeRankedRank = player.highestAllTimeRankedRank ?? null
    user.highestAllTimeRankedRankName = player.highestAllTimeRankedRankName ?? null
    user.clubTag = clubTag
    user.clubName = clubTag ? player.club?.name ?? null : null
    user.clubRank = rank
    user.lastCheckedAt = new Date()
    await user.save()
    updated += 1
    await sleep(API_DELAY_MS)
  }

  const cleanedRoles = await cleanupOrphanManagedRoles(guild, members.values(), allUsers, clubs)

  logger.success(
    `Re-verificación completada: ${updated} actualizados, ${unlinked} sin cuenta, ${skipped} omitidos, ${cleanedRoles} roles corregidos.`
  )
}

/** Intervalo con retardo inicial para no golpear la API nada más arrancar. */
export function scheduleReverify(client: Client, delayMs = REVERIFY_INITIAL_DELAY_MS): void {
  const run = (): void => {
    void reverifyAllMembers(client)
      .catch((error: unknown) => {
        logger.error('Fallo en la re-verificación periódica', {
          reason: error instanceof Error ? error.message : String(error)
        })
      })
      .finally(() => {
        setTimeout(run, REVERIFY_INTERVAL_MS).unref?.()
      })
  }

  setTimeout(run, delayMs).unref?.()
}

export function rankLabel(rank: string | null): string {
  return rank ? RANK_LABELS[rank] ?? rank : 'Sin club'
}

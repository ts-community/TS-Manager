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
import Verification from '../models/Verification'
import User from '../models/User'
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

function collectManagedRoleIds(clubs: ResolvedClub[]): Set<string> {
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

  return managed
}

export function buildVerificationPanel(): { flags: number, components: ContainerBuilder[] } {
  const container = new ContainerBuilder().setAccentColor(PANEL_ACCENT)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '## 🔰 Verificación de Brawl Stars',
      'Vincula tu cuenta de Brawl Stars para acceder a todos los canales y recibir tus roles automáticamente.'
    ].join('\n'))
  )
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '**¿Qué consigues al verificarte?**',
      '- Acceso completo al servidor.',
      '- Roles automáticos por copas y victorias 3v3.',
      '- Rol de tu club y de tu rango (presidente, vicepresidente o veterano).',
      '',
      '**¿Cómo funciona?**',
      '1. Pulsa **Verificar**.',
      '2. Escribe tu tag (lo encuentras en tu perfil del juego).',
      '3. El bot comprobará tu cuenta y aplicará tus roles.',
      '',
      '-# Solo se permite una cuenta de Brawl Stars por usuario. El bot revisa los datos cada 12 horas.'
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
    logger.warn('No se pudo publicar el panel de verificación: canal no válido o sin permisos.')
    return
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

export async function isUserVerified(guildId: string, discordId: string): Promise<boolean> {
  return Boolean(await Verification.exists({ guildId, userId: discordId }))
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

export async function buildVerificationSummary(guild: Guild): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
  const entries = await Verification.find({ guildId: guild.id }).sort({ trophies: -1 })

  const total = entries.length
  const withClub = entries.filter((entry) => entry.clubTag).length
  const withoutClub = total - withClub

  const clubCounts = new Map<string, number>()
  const rankCounts = new Map<string, number>()
  let lastChecked: Date | null = null

  for (const entry of entries) {
    if (entry.clubName) clubCounts.set(entry.clubName, (clubCounts.get(entry.clubName) ?? 0) + 1)
    if (entry.clubRank) rankCounts.set(entry.clubRank, (rankCounts.get(entry.clubRank) ?? 0) + 1)
    if (entry.lastCheckedAt && (!lastChecked || entry.lastCheckedAt > lastChecked)) lastChecked = entry.lastCheckedAt
  }

  const topClubs = [...clubCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const ranks = [...rankCounts.entries()].sort((a, b) => b[1] - a[1])
  const topPlayers = entries.slice(0, 10)

  // Resumen principal con emojis
  const summaryLines = [
    `## 📊 Resumen de verificación`,
    '',
    `✅ **${total}** cuenta(s) verificada(s) de **${guild.memberCount}** miembro(s)`,
    `${EMOJI_CLUB} Con club: **${withClub}** · Sin club: **${withoutClub}**`
  ]
  if (lastChecked) {
    summaryLines.push(`-# Última comprobación: ${lastChecked.toLocaleString('es-ES')}`)
  }

  const embed = new EmbedBuilder()
    .setColor(PANEL_ACCENT)
    .setDescription(summaryLines.join('\n'))

  // Botones para cambiar entre vistas
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('verification:summary:clubs')
      .setLabel('Clubes')
      .setEmoji(EMOJI_CLUB)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('verification:summary:trophies')
      .setLabel('Top Copas')
      .setEmoji(EMOJI_TROPHIES)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('verification:summary:wins3v3')
      .setLabel('Top Wins 3v3')
      .setEmoji(EMOJI_WINS3VS3)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('verification:summary:ranks')
      .setLabel('Rangos')
      .setEmoji(EMOJI_PRESIDENT)
      .setStyle(ButtonStyle.Secondary)
  )

  return { embed, components: [buttonRow] }
}

export async function syncMemberRoles(
  member: GuildMember,
  player: BrawlPlayer,
  rank: BrawlClubRole | null,
  clubs: ResolvedClub[]
): Promise<SyncResult> {
  const clubTag = player.club ? normalizeBrawlTag(player.club.tag) : null
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

  const managed = collectManagedRoleIds(clubs)
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
  const managed = collectManagedRoleIds(clubs)

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
): Promise<{ hadRecord: boolean }> {
  const config = await getGuildConfig(true)
  const clubs = resolveClubEntries(config.clubTags)
  const entry = await Verification.findOneAndDelete({ guildId: guild.id, userId: member.id })

  await applyUnverifiedRoles(member, clubs)

  const embed = new EmbedBuilder()
    .setColor('Orange')
    .setTitle('Usuario desverificado')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Usuario', value: `<@${member.id}> (\`${member.user.tag}\`)` })

  if (entry) {
    embed.addFields({ name: 'Cuenta', value: `**${entry.playerName}** · \`#${entry.tag}\`` })
  }

  if (actorId && actorId !== member.id) {
    embed.addFields({ name: 'Acción por', value: `<@${actorId}>` })
  }

  embed.setTimestamp()

  await sendVerificationLog(guild, embed)

  return { hadRecord: Boolean(entry) }
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

  const existing = await Verification.findOne({ guildId: guild.id, userId: member.id })
  const usedByOther = await Verification.findOne({ guildId: guild.id, tag })

  if (usedByOther && usedByOther.userId !== member.id) {
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
  const clubTag = player.club ? normalizeBrawlTag(player.club.tag) : null
  const rank = clubTag ? await getBrawlClubRank(clubTag, tag) : null
  const roles = await syncMemberRoles(member, player, rank, clubs)

  try {
    await Verification.findOneAndUpdate(
      { guildId: guild.id, userId: member.id },
      {
        $set: {
          guildId: guild.id,
          userId: member.id,
          tag,
          playerName: player.name,
          trophies: player.trophies,
          victories: player['3vs3Victories'] ?? 0,
          clubTag,
          clubName: player.club?.name ?? null,
          clubRank: rank,
          verifiedAt: new Date(),
          lastCheckedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { ok: false, message: 'Esa cuenta de Brawl Stars ya está vinculada a otro usuario.' }
    }

    throw error
  }

  try {
    await User.findOneAndUpdate(
      { discordId: member.id },
      { $set: { brawlId: tag }, $setOnInsert: { teamId: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) {
      logger.warn(`No se pudo sincronizar el tag de ${member.id} en la colección de usuarios: ${(error as Error).message}`)
    }
  }

  const previousTag = existing ? normalizeBrawlTag(existing.tag) : null
  const title = !existing
    ? 'Usuario verificado'
    : previousTag !== tag
      ? 'Tag actualizado'
      : 'Cuenta re-verificada'

  const embed = new EmbedBuilder()
    .setColor(previousTag && previousTag !== tag ? 'Blue' : 'Green')
    .setTitle(title)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'Usuario', value: `<@${member.id}> (\`${member.user.tag}\`)` },
      { name: 'Jugador Brawl Stars', value: `**${player.name}** · \`#${tag}\`` },
      { name: 'Copas', value: player.trophies.toLocaleString('es-ES'), inline: true },
      { name: 'Victorias 3v3', value: (player['3vs3Victories'] ?? 0).toLocaleString('es-ES'), inline: true }
    )

  if (player.club) embed.addFields({ name: 'Club', value: player.club.name })
  if (rank) embed.addFields({ name: 'Rango', value: rankLabel(rank), inline: true })
  if (previousTag && previousTag !== tag) {
    embed.addFields({ name: 'Tag anterior', value: `\`#${previousTag}\``, inline: true })
  }
  if (actorId && actorId !== member.id) {
    embed.addFields({ name: 'Acción por', value: `<@${actorId}>` })
  }
  if (roles.added.length) {
    embed.addFields({ name: 'Roles añadidos', value: roleMentions(roles.added) })
  }
  if (roles.failed.length) {
    embed.setFooter({ text: `No se pudieron aplicar ${roles.failed.length} rol(es)` })
  }

  embed.setTimestamp()

  await sendVerificationLog(guild, embed)

  return { ok: true, message: 'Cuenta verificada correctamente.', player, roles, rank }
}

export function buildResultEmbed(result: VerificationResult): EmbedBuilder {
  if (!result.ok || !result.player) {
    return new EmbedBuilder()
      .setColor('Red')
      .setTitle('No se pudo verificar')
      .setDescription(result.message)
  }

  const player = result.player
  const lines: string[] = []

  lines.push(`**Jugador:** ${player.name}`)
  lines.push(`**Tag:** #${normalizeBrawlTag(player.tag)}`)
  lines.push(`${EMOJI_TROPHIES} **Copas:** ${player.trophies.toLocaleString('es-ES')}`)
  lines.push(`${EMOJI_WINS3VS3} **Victorias 3v3:** ${(player['3vs3Victories'] ?? 0).toLocaleString('es-ES')}`)

  if (player.club) {
    lines.push(`${EMOJI_CLUB} **Club:** ${player.club.name}`)
    if (result.rank) {
      const rankEmoji = result.rank === 'president' ? EMOJI_PRESIDENT : result.rank === 'vicePresident' ? EMOJI_VICE_PRESIDENT : EMOJI_VETERAN
      lines.push(`${rankEmoji} **Rango:** ${rankLabel(result.rank)}`)
    }
  }

  if (result.roles?.added.length) {
    lines.push('', `Roles añadidos: ${result.roles.added.map((id) => `<@&${id}>`).join(' ')}`)
  }

  if (result.roles?.failed.length) {
    lines.push(`-# No se pudieron aplicar ${result.roles.failed.length} rol(es). Avisa a un administrador.`)
  }

  return new EmbedBuilder()
    .setColor('Green')
    .setTitle('✅ Cuenta verificada')
    .setDescription(lines.join('\n'))
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
    await interaction.editReply({ content: 'No se pudo encontrar tu usuario en el servidor.' })
    return
  }

  try {
    const result = await verifyMember(guild, member, interaction.fields.getTextInputValue('tag'))
    await interaction.editReply({ embeds: [buildResultEmbed(result)] })
  } catch (error) {
    logger.error('Error verificando una cuenta', {
      user: interaction.user.id,
      reason: error instanceof Error ? error.message : 'Unknown error'
    })
    await interaction.editReply({ content: 'Ocurrió un error al verificar tu cuenta. Inténtalo de nuevo más tarde.' })
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
    await interaction.editReply({ content: 'No se pudo encontrar tu usuario en el servidor.' })
    return
  }

  const entry = await Verification.findOne({ guildId: guild.id, userId: member.id })

  if (!entry) {
    await interaction.editReply({ content: 'Todavía no tienes una cuenta vinculada. Pulsa **Verificar** primero.' })
    return
  }

  try {
    const player = await getBrawlPlayer(entry.tag)
    const config = await getGuildConfig(true)
    const clubs = resolveClubEntries(config.clubTags)
    const clubTag = player.club ? normalizeBrawlTag(player.club.tag) : null
    const rank = clubTag ? await getBrawlClubRank(clubTag, entry.tag) : null
    const roles = await syncMemberRoles(member, player, rank, clubs)

    entry.playerName = player.name
    entry.trophies = player.trophies
    entry.victories = player['3vs3Victories'] ?? 0
    entry.clubTag = clubTag
    entry.clubName = player.club?.name ?? null
    entry.clubRank = rank
    entry.lastCheckedAt = new Date()
    await entry.save()

    if (roles.added.length || roles.removed.length) {
      const embed = new EmbedBuilder()
        .setColor(0x3B82F6)
        .setTitle('Roles actualizados')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: 'Usuario', value: `<@${member.id}> (\`${member.user.tag}\`)` },
          { name: 'Jugador Brawl Stars', value: `**${player.name}** · \`#${normalizeBrawlTag(player.tag)}\`` }
        )

      if (roles.added.length) embed.addFields({ name: 'Roles añadidos', value: roleMentions(roles.added) })
      if (roles.removed.length) embed.addFields({ name: 'Roles quitados', value: roleMentions(roles.removed) })
      if (player.club) embed.addFields({ name: 'Club', value: player.club.name, inline: true })
      if (rank) embed.addFields({ name: 'Rango', value: rankLabel(rank), inline: true })
      embed.setTimestamp()

      await sendVerificationLog(guild, embed)
    }

    await interaction.editReply({ embeds: [buildResultEmbed({ ok: true, message: 'Roles actualizados.', player, roles, rank })] })
  } catch (error) {
    if (error instanceof BrawlStarsApiError && error.status === 404) {
      const config = await getGuildConfig(true)
      const clubs = resolveClubEntries(config.clubTags)
      await applyUnverifiedRoles(member, clubs)
      await Verification.deleteOne({ _id: entry._id })

      await sendVerificationLog(
        guild,
        new EmbedBuilder()
          .setColor('Orange')
          .setTitle('Cuenta no encontrada')
          .setDescription(`<@${member.id}> ya no tiene la cuenta \`#${entry.tag}\`. Se le marcó como no verificado.`)
          .setTimestamp()
      )

      await interaction.editReply({
        content: 'Tu cuenta ya no existe o cambió de tag. Se te ha marcado como no verificado; vuelve a verificarte con el botón **Verificar**.'
      })
      return
    }

    const message = error instanceof Error ? error.message : 'No se pudo consultar la cuenta.'
    await interaction.editReply({ content: message })
  }
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
  const entries = await Verification.find({ guildId: guild.id })

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

  for (const entry of entries) {
    const member = members.get(entry.userId)

    if (!member) {
      await Verification.deleteOne({ _id: entry._id })
      unlinked += 1
      continue
    }

    let player: BrawlPlayer

    try {
      player = await getBrawlPlayer(entry.tag)
    } catch (error) {
      if (error instanceof BrawlStarsApiError && error.status === 404) {
        await applyUnverifiedRoles(member, clubs)
        await Verification.deleteOne({ _id: entry._id })
        unlinked += 1

        await sendVerificationLog(
          guild,
          new EmbedBuilder()
            .setColor('Orange')
            .setTitle('Cuenta no encontrada (revisión automática)')
            .setDescription(`<@${entry.userId}> ya no tiene la cuenta \`#${entry.tag}\`. Se le marcó como no verificado.`)
            .setTimestamp()
        )
      } else {
        skipped += 1
        logger.warn(`No se pudo re-verificar a ${entry.userId}: ${(error as Error).message}`)
      }

      await sleep(API_DELAY_MS)
      continue
    }

    const clubTag = player.club ? normalizeBrawlTag(player.club.tag) : null
    const rank = clubTag ? await getRank(clubTag, entry.tag) : null

    try {
      await syncMemberRoles(member, player, rank, clubs)
    } catch (error) {
      skipped += 1
      logger.warn(`No se pudieron sincronizar los roles de ${entry.userId}: ${(error as Error).message}`)
      await sleep(API_DELAY_MS)
      continue
    }

    entry.playerName = player.name
    entry.trophies = player.trophies
    entry.victories = player['3vs3Victories'] ?? 0
    entry.clubTag = clubTag
    entry.clubName = player.club?.name ?? null
    entry.clubRank = rank
    entry.lastCheckedAt = new Date()
    await entry.save()
    updated += 1
    await sleep(API_DELAY_MS)
  }

  logger.success(`Re-verificación completada: ${updated} actualizados, ${unlinked} sin cuenta, ${skipped} omitidos.`)
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

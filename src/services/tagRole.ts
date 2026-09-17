import {
  EmbedBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type ThreadChannel
} from 'discord.js'
import { token } from '../config/env'
import logger from '../utils/logger'

// Configuración de la etiqueta TS (valores fijos del servidor)
const TAG = 'TS'
const TAG_GUILD_ID = '1093864130030612521'
const TAG_ROLE_ID = '1380228270729199798'
const TAG_ROLE_NAME = 'Etiqueta TS'
const TAG_LOG_THREAD_ID = '1470813578964504656'
const TAG_EMOJI = '<:tag:1470863668051837059>'

const REQUEST_DELAY = 800

interface PrimaryGuild {
  tag?: string | null
  identity_guild_id?: string | null
}

let guildRef: Guild | null = null
let threadRef: ThreadChannel | null = null
let membersArray: GuildMember[] = []
let scanIndex = 0
let scanRunning = false
let started = false

const processing = new Set<string>()
const priorityQueue: string[] = []

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchTag(userId: string): Promise<PrimaryGuild | null> {
  while (true) {
    try {
      const response = await fetch(`https://discord.com/api/v10/users/${userId}`, {
        headers: { Authorization: `Bot ${token}` }
      })

      if (response.status === 429) {
        const data = (await response.json().catch(() => ({}))) as { retry_after?: number }
        const retry = data.retry_after ?? 1
        logger.warn('[TAG] Rate limit', { userId, retry })
        await sleep(retry * 1000 + 100)
        continue
      }

      if (!response.ok) return null

      const data = (await response.json()) as {
        primary_guild?: PrimaryGuild | null
        clan?: PrimaryGuild | null
      }
      return data.primary_guild ?? data.clan ?? null
    } catch {
      return null
    }
  }
}

async function applyRole(member: GuildMember, hasCorrectTag: boolean): Promise<void> {
  const hasRole = member.roles.cache.has(TAG_ROLE_ID)
  const guildName = member.guild.name
  const guildIcon = member.guild.iconURL() ?? undefined

  if (hasCorrectTag && !hasRole) {
    await member.roles.add(TAG_ROLE_ID).catch(() => null)
    logger.info(`[TAG] + Rol añadido a ${member.user.tag}`)

    await member
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setAuthor({ name: guildName, iconURL: guildIcon })
            .setDescription(
              `### ${TAG_EMOJI} Etiqueta detectada\n` +
                `Se te ha otorgado el rol **${TAG_ROLE_NAME}** por tener la etiqueta ${TAG_EMOJI} **${TAG}**`
            )
            .setTimestamp()
        ]
      })
      .catch(() => null)

    await threadRef
      ?.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setDescription(
              `### ${TAG_EMOJI} Etiqueta establecida\n` +
                `Rol <@&${TAG_ROLE_ID}> otorgado a <@${member.user.id}> por tener la etiqueta ${TAG_EMOJI} **${TAG}**`
            )
            .setTimestamp()
        ]
      })
      .catch(() => null)
  }

  if (!hasCorrectTag && hasRole) {
    await member.roles.remove(TAG_ROLE_ID).catch(() => null)
    logger.info(`[TAG] - Rol quitado a ${member.user.tag}`)

    await member
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setAuthor({ name: guildName, iconURL: guildIcon })
            .setDescription(
              `${TAG_EMOJI} Etiqueta eliminada\n` +
                `Se te ha retirado el rol **${TAG_ROLE_NAME}** por no tener la etiqueta ${TAG_EMOJI} **${TAG}**`
            )
            .setTimestamp()
        ]
      })
      .catch(() => null)

    await threadRef
      ?.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setDescription(
              `### ${TAG_EMOJI} Etiqueta retirada\n` +
                `Rol <@&${TAG_ROLE_ID}> retirado a <@${member.user.id}> por no tener la etiqueta ${TAG_EMOJI} **${TAG}**`
            )
            .setTimestamp()
        ]
      })
      .catch(() => null)
  }
}

async function verifyMember(member: GuildMember): Promise<void> {
  if (!member || member.user?.bot) return
  if (processing.has(member.id)) return

  processing.add(member.id)
  try {
    const tagData = await fetchTag(member.id)
    await member.fetch().catch(() => null)

    const hasCorrectTag =
      tagData?.tag === TAG && tagData?.identity_guild_id === guildRef?.id

    await applyRole(member, hasCorrectTag)
  } catch (error) {
    logger.error(`[TAG] Error verificando ${member?.user?.tag}`, {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  } finally {
    processing.delete(member.id)
  }
}

async function mainLoop(): Promise<void> {
  if (scanRunning || !guildRef) return
  scanRunning = true
  logger.info('[TAG] Motor iniciado')

  while (true) {
    let member: GuildMember | null | undefined = null

    if (priorityQueue.length > 0 && guildRef) {
      const id = priorityQueue.shift()!
      member =
        guildRef.members.cache.get(id) ??
        (await guildRef.members.fetch(id).catch(() => null))
    }

    if (!member && guildRef) {
      if (scanIndex >= membersArray.length) {
        scanIndex = 0
        membersArray = [...guildRef.members.cache.values()].filter((m) => !m.user.bot)
        logger.info(`[TAG] Nuevo ciclo — ${membersArray.length} miembros`)
      }

      member = membersArray[scanIndex]
      scanIndex++
    }

    if (member) await verifyMember(member)

    await sleep(REQUEST_DELAY)
  }
}

function enqueuePriority(id: string): void {
  if (!priorityQueue.includes(id) && !processing.has(id)) {
    priorityQueue.unshift(id)
  }
}

/**
 * Arranca el gestor del rol por etiqueta de clan (TS).
 * Replica el motor del bot legado, con el bug de `interaction` corregido
 * (se usa member.guild en lugar de una variable inexistente).
 */
export async function startTagRoleManager(client: Client): Promise<void> {
  if (started) return
  started = true

  guildRef = await client.guilds.fetch(TAG_GUILD_ID).catch(() => null)
  if (!guildRef) {
    logger.error('[TAG] Guild no encontrada', { guildId: TAG_GUILD_ID })
    return
  }

  await guildRef.members.fetch().catch(() => null)

  membersArray = [...guildRef.members.cache.values()].filter((m) => !m.user.bot)
  logger.info(`[TAG] Iniciado — ${membersArray.length} miembros`)

  const channel = await client.channels.fetch(TAG_LOG_THREAD_ID).catch(() => null)
  threadRef = channel?.isThread() ? (channel as ThreadChannel) : null
  if (!threadRef) logger.warn('[TAG] Thread de log no encontrado')

  client.on('messageCreate', (msg: Message) => {
    if (!msg.inGuild() || msg.guild.id !== guildRef?.id) return
    if (msg.author.bot) return
    enqueuePriority(msg.author.id)
  })

  client.on('guildMemberUpdate', (_old, newMember) => {
    if (newMember.guild.id !== guildRef?.id) return
    enqueuePriority(newMember.id)
  })

  client.on('guildMemberAdd', (member) => {
    if (member.guild.id !== guildRef?.id) return
    membersArray.push(member as GuildMember)
    enqueuePriority(member.id)
  })

  client.on('guildMemberRemove', (member) => {
    if (member.guild.id !== guildRef?.id) return
    membersArray = membersArray.filter((m) => m.id !== member.id)
  })

  void mainLoop()
}

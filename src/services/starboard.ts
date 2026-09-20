import {
  EmbedBuilder,
  type Client,
  type Message,
  type MessageReaction,
  type TextBasedChannel
} from 'discord.js'
import { guildId } from '../config/env'
import type { GuildDocument } from '../models/Guild'
import Guild from '../models/Guild'
import { getGuildConfig, setGuildConfigCache } from './guild'
import logger from '../utils/logger'

export const STARBOARD_CHANNEL_ID = '1317531432909930639'
export const STARBOARD_EMOJI = '⭐'
export const DEFAULT_STARBOARD_THRESHOLD = 3
const FETCH_LIMIT = 100

export async function setStarboardThreshold(stars: number): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $set: { starboardThreshold: stars } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update starboard configuration')
  }

  setGuildConfigCache(config)

  return config
}

function buildPayload(message: Message, stars: number) {
  const raw = message.content?.trim() ?? ''
  const attachments = [...message.attachments.values()]
  const image = attachments.find(
    a => a.contentType?.startsWith('image/') ?? /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? '')
  )
  const others = attachments.filter(a => a !== image)

  let description = raw.length > 0 ? raw.slice(0, 3900) : '*(mensaje sin texto)*'
  if (others.length > 0) {
    description += `\n\n${others.map(a => `[📎 ${a.name ?? 'adjunto'}](${a.url})`).join('\n')}`.slice(0, 4096 - description.length - 1)
  }
  description += `\n-# [🔗 Ir al mensaje](${message.url})`

  const embed = new EmbedBuilder()
    .setColor('Gold')
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL()
    })
    .setDescription(description.slice(0, 4096))
    .setFooter({ text: message.id })
    .setTimestamp(message.createdAt)

  if (image) embed.setImage(image.url)

  return {
    content: `${STARBOARD_EMOJI} **${stars}** estrellas | en <#${message.channel.id}>`,
    embeds: [embed]
  }
}

async function findEntry(channel: TextBasedChannel, originalId: string) {
  const messages = await channel.messages.fetch({ limit: FETCH_LIMIT })
  return (
    messages.find(
      m => m.author.bot && m.embeds.some(e => e.footer?.text === originalId)
    ) ?? null
  )
}

export async function countStars(reaction: MessageReaction, message: Message): Promise<number> {
  const users = await reaction.users.fetch()
  let count = 0
  for (const user of users.values()) {
    if (user.bot) continue
    count++
  }
  return count
}

export async function syncStarboard(client: Client, message: Message, stars: number): Promise<void> {
  try {
    const config = await getGuildConfig()
    const threshold = config.starboardThreshold ?? DEFAULT_STARBOARD_THRESHOLD

    const channel = await client.channels.fetch(STARBOARD_CHANNEL_ID).catch(() => null)
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      logger.warn('Starboard channel not available', { channelId: STARBOARD_CHANNEL_ID })
      return
    }

    const existing = await findEntry(channel, message.id)

    if (stars < threshold) {
      if (existing) await existing.delete().catch(() => null)
      return
    }

    const payload = buildPayload(message, stars)

    if (existing) {
      await existing.edit(payload).catch(() => null)
    } else {
      await channel.send(payload).catch(() => null)
    }
  } catch (error) {
    logger.error('Starboard sync failed', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

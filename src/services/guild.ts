import { guildId } from '../config/env'
import type { GuildDocument } from '../models/Guild'
import Guild from '../models/Guild'

let configCache: GuildDocument | null = null
let cacheTime = 0
const CACHE_DURATION = 60_000

async function loadGuildConfig(): Promise<GuildDocument> {
  let config = await Guild.findOne({ guildId })

  if (!config) {
    config = await Guild.create({ guildId })
  }

  return config
}

export async function getGuildConfig(forceRefresh = false): Promise<GuildDocument> {
  const now = Date.now()

  if (!forceRefresh && configCache && now - cacheTime < CACHE_DURATION) {
    return configCache
  }

  configCache = await loadGuildConfig()
  cacheTime = now

  return configCache
}

export async function addPurgeChannel(channelId: string, intervalMinutes: number): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $push: { purgeChannels: { channelId, intervalMinutes } } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update purge channel configuration')
  }

  configCache = config
  cacheTime = Date.now()

  return config
}

export async function setStarboardThreshold(stars: number): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $set: { starboardThreshold: stars } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update starboard configuration')
  }

  configCache = config
  cacheTime = Date.now()

  return config
}

export async function removePurgeChannel(channelId: string): Promise<GuildDocument> {
  const config = await Guild.findOneAndUpdate(
    { guildId },
    { $pull: { purgeChannels: { channelId } } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  if (!config) {
    throw new Error('Failed to update purge channel configuration')
  }

  configCache = config
  cacheTime = Date.now()

  return config
}
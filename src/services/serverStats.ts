import { GatewayIntentBits, type Client } from 'discord.js'
import { guildId } from '../config/env'
import Guild from '../models/Guild'

export async function syncPresenceStats(client: Client): Promise<void> {
  if (!client.options.intents.has(GatewayIntentBits.GuildPresences)) return

  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null)
  if (!guild) return
  if (guild.presences.cache.size === 0) return

  const onlineCount = guild.presences.cache.filter(presence => presence.status !== 'offline').size

  await Guild.updateOne(
    { guildId },
    { $set: { onlineCount, statsUpdatedAt: new Date() } },
    { upsert: true }
  )
}

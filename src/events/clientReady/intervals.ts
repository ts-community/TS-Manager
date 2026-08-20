import { ChannelType } from 'discord.js'
import type { Event } from '../../types/events'
import { runInterval } from '../../utils/interval'
import { buildBrawlStarsEmbeds } from '../../services/brawlStars'
import { getGuildConfig } from '../../services/guild'
import {
  brawlStarsChannelId,
  brawlStarsMessageId
} from '../../config/env'

const lastPurgedAt = new Map<string, number>()

export default {
  once: true,

  async execute(client) {
    runInterval(
      [
        async function refreshBrawlStarsEmbed() {
          if (!brawlStarsChannelId || !brawlStarsMessageId) return

          const embeds = await buildBrawlStarsEmbeds()
          if (!embeds) return

          const channel = await client.channels.fetch(brawlStarsChannelId)
          if (!channel || channel.type !== ChannelType.GuildText) return

          const message = await channel.messages.fetch(brawlStarsMessageId)
          await message.edit({ embeds })
        }
      ],
      1000 * 20
    )

    runInterval(
      [
        async function purgeChannels() {
          const config = await getGuildConfig()
          const now = Date.now()

          for (const { channelId, intervalMinutes } of config.purgeChannels) {
            const last = lastPurgedAt.get(channelId) ?? now
            if (now - last < intervalMinutes * 60_000) continue

            lastPurgedAt.set(channelId, now)

            const channel = await client.channels.fetch(channelId).catch(() => null)
            if (!channel || !channel.isTextBased() || channel.isDMBased()) continue

            const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null)
            if (!messages || messages.size === 0) continue

            await channel.bulkDelete(messages, true).catch(() => null)
          }
        }
      ],
      1000 * 60
    )
  }
} satisfies Event<'clientReady'>
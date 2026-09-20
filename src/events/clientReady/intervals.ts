import { ChannelType } from 'discord.js'
import type { Event } from '../../types/events'
import { runInterval } from '../../utils/interval'
import { buildBrawlStarsEmbeds, refreshClubTemplate } from '../../services/clubs'
import { getGuildConfig } from '../../services/guild'
import {
  BUSCAR_EQUIPO_CHANNEL_ID,
  isBuscarEquipoSticky,
  refreshBuscarEquipoSticky
} from '../../services/buscarEquipo'
import logger from '../../utils/logger'
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

          const embeds = await buildBrawlStarsEmbeds(client)
          if (!embeds) return

          const channel = await client.channels.fetch(brawlStarsChannelId)
          if (!channel || channel.type !== ChannelType.GuildText) return

          const message = await channel.messages.fetch(brawlStarsMessageId)
          await message.edit({ embeds })
        }
      ],
      1000 * 20
    )

    // Plantilla de promoción de clubes (legacy): edita los 2 mensajes con datos live.
    runInterval(
      [
        async function refreshPlantillaClubes() {
          await refreshClubTemplate(client)
        }
      ],
      1000 * 60 * 15
    )

    runInterval(
      [
        async function purgeChannels() {
          const config = await getGuildConfig()
          const now = Date.now()
          const botUserId = client.user?.id

          for (const { channelId, intervalMinutes } of config.purgeChannels) {
            const last = lastPurgedAt.get(channelId) ?? 0
            if (now - last < intervalMinutes * 60_000) continue

            lastPurgedAt.set(channelId, now)

            const channel = await client.channels.fetch(channelId).catch((error) => {
              logger.warn('Purge: no se pudo obtener el canal', {
                channelId,
                reason: error instanceof Error ? error.message : String(error)
              })
              return null
            })
            if (!channel || !channel.isTextBased() || channel.isDMBased()) continue

            const messages = await channel.messages.fetch({ limit: 100 }).catch((error) => {
              logger.warn('Purge: no se pudieron leer mensajes', {
                channelId,
                reason: error instanceof Error ? error.message : String(error)
              })
              return null
            })
            if (!messages || messages.size === 0) continue

            // El sticky solo aplica a su canal; en el resto no se perdona nada por ser bot.
            const deletable = messages.filter(
              m => !m.pinned && (channelId !== BUSCAR_EQUIPO_CHANNEL_ID || !isBuscarEquipoSticky(m, botUserId))
            )
            if (deletable.size === 0) continue

            const deleted = await channel.bulkDelete(deletable, true).catch((error) => {
              logger.warn('Purge: bulkDelete falló (revisa permiso Gestionar mensajes)', {
                channelId,
                count: deletable.size,
                reason: error instanceof Error ? error.message : String(error)
              })
              return null
            })
            if (!deleted) continue

            // bulkDelete con filterOld=true ignora mensajes de +14 días: se avisa, no se rompe nada.
            if (deleted.size < deletable.size) {
              logger.warn('Purge: quedaron mensajes sin borrar (límite 14 días de Discord)', {
                channelId,
                requested: deletable.size,
                deleted: deleted.size
              })
            }

            if (channelId === BUSCAR_EQUIPO_CHANNEL_ID) {
              await refreshBuscarEquipoSticky(client)
            }
          }
        }
      ],
      1000 * 60
    )
  }
} satisfies Event<'clientReady'>
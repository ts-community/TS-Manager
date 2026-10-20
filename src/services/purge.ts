import type { Client } from 'discord.js'
import { BUSCAR_EQUIPO_CHANNEL_ID } from './buscarEquipo'
import { getGuildConfig } from './guild'
import logger from '../utils/logger'

const lastPurgedAt = new Map<string, number>()

/** Purga los canales configurados en Guild.purgeChannels según su intervalo. */
export async function runChannelPurges(client: Client): Promise<void> {
  const config = await getGuildConfig()
  const now = Date.now()

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

    // El canal de buscar equipo nunca se purgea con este sistema.
    const deletable = messages.filter(
      m => !m.pinned && channelId !== BUSCAR_EQUIPO_CHANNEL_ID
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
  }
}

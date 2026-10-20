import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import {
  BUSCAR_EQUIPO_CHANNEL_ID,
  BUSCAR_EQUIPO_ROLE_ID
} from '../../services/buscarEquipo'

const WINDOW_MS = 5 * 60 * 1000
const MAX_PINGS_IN_WINDOW = 3
const TIMEOUT_MS = 10 * 60 * 1000

/** Fechas de los últimos pings manuales de cada usuario en el canal de buscar equipo. */
const pingsByUser = new Map<string, number[]>()

export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (message.channelId !== BUSCAR_EQUIPO_CHANNEL_ID) return
    if (message.author.bot || !message.member) return

    if (!message.mentions.roles.has(BUSCAR_EQUIPO_ROLE_ID)) return

    const member = message.member
    if (!member.moderatable) return

    const now = Date.now()
    let pings = (pingsByUser.get(member.id) ?? []).filter(time => now - time < WINDOW_MS)
    
    // Poda: removemos usuarios inactivos para evitar crecimiento infinito
    if (pings.length === 0) {
      pingsByUser.delete(member.id)
    }

    pings.push(now)
    pingsByUser.set(member.id, pings)

    if (pings.length < MAX_PINGS_IN_WINDOW) return

    // Solo se sanciona en el ping que cruza el límite, no en cada spam posterior.
    if (pings.length !== MAX_PINGS_IN_WINDOW) return

    pingsByUser.set(member.id, [])

    await member.timeout(TIMEOUT_MS, 'Demasiadas menciones al rol de Buscar Equipo').catch(() => null)

    await message.reply({
      content: '🕐 Timeout de 10 minutos por abusar de las menciones al rol de Buscar Equipo en poco tiempo. Mientras dure, no se podrá enviar mensajes en el servidor.',
      allowedMentions: { parse: [] }
    }).catch(() => null)
  }
} satisfies Event<'messageCreate'>

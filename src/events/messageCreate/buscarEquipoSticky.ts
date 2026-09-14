import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import {
  BUSCAR_EQUIPO_CHANNEL_ID,
  isBuscarEquipoSticky,
  scheduleBuscarEquipoRefresh
} from '../../services/buscarEquipo'

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (message.channelId !== BUSCAR_EQUIPO_CHANNEL_ID) return
    if (!message.guild) return

    // Ignorar nuestro propio sticky para no entrar en bucle.
    if (isBuscarEquipoSticky(message, client.user?.id)) return

    // Cualquier otro mensaje (usuarios u otros bots) -> recolocar el embed abajo.
    scheduleBuscarEquipoRefresh(client)
  }
} satisfies Event<'messageCreate'>

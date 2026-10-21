import type { Event } from '#types/events'
import { schedulePanelsSync } from '../../services/asociaciones-sync'

export default {
  once: true,

  async execute(client: import('discord.js').Client) {
    // Sincroniza los paneles al arrancar (con debounce)
    schedulePanelsSync(client, 15_000)
  }
} satisfies Event<'clientReady'>
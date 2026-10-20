import type { Event } from '#types/events'
import { runInterval } from '../../utils/interval'
import { checkBumpReminders } from '../../services/bumps'

export default {
  once: true,

  async execute(client: import('discord.js').Client) {
    runInterval([() => checkBumpReminders(client)], 1000 * 60)
  }
} satisfies Event<'clientReady'>
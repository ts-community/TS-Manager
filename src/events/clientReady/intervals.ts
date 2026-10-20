import type { Event } from '#types/events'
import { runInterval } from '../../utils/interval'
import { expireBlacklist } from '../../services/economyBlacklist'
import { refreshBrawlStarsEmbed, refreshClubTemplate } from '../../services/clubs'
import { runChannelPurges } from '../../services/purge'
import { checkBumpReminders } from '../../services/bumps'
import { scanNextTagMember } from '../../services/tagRole'
import { checkDueAsociaciones } from '../../services/asociaciones'

const SECOND = 1000
const MINUTE = 60 * SECOND

// Todas las tareas periódicas del bot viven en sus módulos y se registran aquí.
export default {
  once: true,

  async execute(client: import('discord.js').Client) {
    runInterval([expireBlacklist.bind(null, client)], 30 * SECOND)
    runInterval([refreshBrawlStarsEmbed.bind(null, client)], 20 * SECOND)
    runInterval([refreshClubTemplate.bind(null, client)], 15 * MINUTE)
    runInterval([runChannelPurges.bind(null, client)], MINUTE)
    runInterval([checkBumpReminders.bind(null, client)], MINUTE)
    runInterval([checkDueAsociaciones.bind(null, client)], 30 * MINUTE)
    runInterval([scanNextTagMember], 800)
  }
} satisfies Event<'clientReady'>

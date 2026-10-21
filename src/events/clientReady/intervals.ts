import type { Event } from '#types/events'
import { runInterval } from '../../utils/interval'
import { expireBlacklist } from '../../services/economyBlacklist'
import { refreshBrawlStarsEmbed, refreshClubTemplate } from '../../services/clubs'
import { runChannelPurges } from '../../services/purge'
import { checkBumpReminders } from '../../services/bumps'
import { scanNextTagMember } from '../../services/tagRole'
import { checkDueAsociaciones, checkRepresentantesAusentes } from '../../services/asociaciones'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * 60 * MINUTE

// Todas las tareas periódicas del bot viven en sus módulos y se registran aquí.
export default {
  once: true,

  async execute(client: import('discord.js').Client) {
    runInterval([scanNextTagMember], 800)

    runInterval([
      runChannelPurges.bind(null, client),
      checkBumpReminders.bind(null, client)
    ], MINUTE)

    runInterval([
      refreshBrawlStarsEmbed.bind(null, client),
      refreshClubTemplate.bind(null, client),
    ], 15 * MINUTE)

    runInterval([
      expireBlacklist.bind(null, client),
      checkDueAsociaciones.bind(null, client)
    ], HOUR)

    runInterval([checkRepresentantesAusentes.bind(null, client)], DAY)
  }
} satisfies Event<'clientReady'>

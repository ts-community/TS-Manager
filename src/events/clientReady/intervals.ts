import type { Event } from '#types/events'
import { runInterval } from '../../utils/interval'
import { expireBlacklist } from '../../services/economyBlacklist'
import { refreshBrawlStarsEmbed, refreshClubTemplate } from '../../services/clubs'
import { runChannelPurges } from '../../services/purge'
import { checkBumpReminders } from '../../services/bumps'
import { scanNextTagMember, startTagRoleManager } from '../../services/tagRole'
import { checkDueAsociaciones, checkRepresentantesAusentes, schedulePanelsSync } from '../../services/asociaciones'
import logger from '../../utils/logger'

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE

// Todas las tareas periódicas del bot viven en sus módulos y se registran aquí.
export default {
  once: true,

  async execute(client: import('discord.js').Client) {
    // Sincroniza los paneles al arrancar (con debounce) — primero de todo, no depende del resto
    schedulePanelsSync(client, 15_000)

    // El gestor de roles por etiqueta no debe bloquear/fallar el resto del arranque
    startTagRoleManager(client).catch(error => {
      logger.error('TagRole: error arrancando el gestor', {
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    })

    runInterval([expireBlacklist.bind(null, client)], 30 * SECOND)
    runInterval([refreshBrawlStarsEmbed.bind(null, client)], 20 * SECOND)
    runInterval([refreshClubTemplate.bind(null, client)], 15 * MINUTE)
    runInterval([runChannelPurges.bind(null, client)], MINUTE)
    runInterval([checkBumpReminders.bind(null, client)], MINUTE)
    runInterval([checkDueAsociaciones.bind(null, client)], 30 * MINUTE)
    // Comprobación espaciada: si un representante sigue ausente, vuelve a avisar en cada pasada
    runInterval([checkRepresentantesAusentes.bind(null, client)], DAY)
    runInterval([scanNextTagMember], 800)
  }
} satisfies Event<'clientReady'>

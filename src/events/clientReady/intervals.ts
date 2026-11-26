import { startAssociationHttp } from '../../services/associationHttp'
import { checkDueSurveys, syncSurveys, invalidateSurveyHistory } from '../../services/surveyDelivery'
import type { Event } from '#types/events'

import { runInterval } from '../../utils/interval'
import mongoose from 'mongoose'
import { once } from 'node:events'

import { expireBlacklist } from '../../services/blacklist'
import {
  refreshBrawlStarsEmbed,
  refreshClubTemplate
} from '../../services/clubs'
import { runChannelPurges } from '../../services/purge'
import { checkBumpReminders } from '../../services/bumps'
import { scanNextTagMember } from '../../services/tagRole'
import {
  checkDueAsociaciones,
  checkRepresentantesAusentes
} from '../../services/asociaciones'
import { scheduleReverify } from '../../services/verification'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Todas las tareas periódicas del bot viven en sus módulos y se registran aquí.
export default {
  once: true,

  async execute(client: import('discord.js').Client) {
    // initialize.ts conecta Mongo en este mismo clientReady: sin esperar, la
    // primera pasada de encuestas fallaba y la horaria no volvía hasta 1 h después.
    if (mongoose.connection.readyState !== 1) await once(mongoose.connection, 'connected')
    startAssociationHttp(client)
    client.on('shardResume',invalidateSurveyHistory)
    runInterval([scanNextTagMember], 800)

    runInterval([
      syncSurveys.bind(null, client),
      runChannelPurges.bind(null, client),
      checkBumpReminders.bind(null, client)
    ], MINUTE)

    runInterval([
      refreshBrawlStarsEmbed.bind(null, client),
      refreshClubTemplate.bind(null, client)
    ], 15 * MINUTE)

    runInterval([
      expireBlacklist.bind(null, client),
      checkDueAsociaciones.bind(null, client),
      checkDueSurveys.bind(null, client)
    ], HOUR)

    runInterval([
      checkRepresentantesAusentes.bind(null, client)
    ], DAY)

    // Re-verifica a todos los usuarios cada 12h (con un retardo inicial).
    scheduleReverify(client)
  }
} satisfies Event<'clientReady'>

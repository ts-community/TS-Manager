import mongoose from 'mongoose'
import type { Event } from '#types/events'
import { ActivityType, Client } from 'discord.js'
import { mongoURL } from '../../config/env'
import logger from '../../utils/logger'
import { publishServiceThreads } from '../../services/services'
import { schedulePanelsSync } from '../../services/asociaciones'
import { startTagRoleManager } from '../../services/tagRole'

export default {
  once: true,
  
  async execute(client: Client) {
    if (!client.user) return
    logger.success(`Logged in as ${client.user.tag}`)

    try {
      await publishServiceThreads(client)
      logger.success('Service threads checked')
    } catch (error) {
      logger.error('Service threads could not be published', {
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    await mongoose.connect(mongoURL)
    logger.success('Database connected\n')

    // Sincroniza los paneles a los 15s de arrancar (con debounce para no re-renderizar por cada cambio)
    // Va después de conectar la BD porque syncPanels consulta las asociaciones
    schedulePanelsSync(client, 15_000)

    // El gestor del rol por etiqueta TS no debe bloquear/fallar el resto del arranque
    startTagRoleManager(client).catch(error => {
      logger.error('TagRole: error arrancando el gestor', {
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    })

    if (process.env.NODE_ENV === 'development') {
      logger.info('Looking for file changes...\n')
    }

    // Estado profesional del bot (se aplica al arrancar y rota cada 15 min)
    const actividades = [
      '.gg/tscommunity',
      '#TSCommunity'
    ]

    const setRandomStatus = () => {
      if (!client.user) return
      client.user.setPresence({
        activities: [{ name: actividades[Math.floor(Math.random() * actividades.length)], type: ActivityType.Watching }]
      })
    }

    setRandomStatus()
    setInterval(setRandomStatus, 1000 * 60 * 15)
  }
} satisfies Event<'clientReady'>
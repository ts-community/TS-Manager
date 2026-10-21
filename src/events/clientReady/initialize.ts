import mongoose from 'mongoose'
import type { Event } from '#types/events'
import { Client } from 'discord.js'
import { mongoURL } from '../../config/env'
import logger from '../../utils/logger'
import { publishServiceThreads } from '../../services/services'
import { schedulePanelsSync } from '../../services/asociaciones-sync'

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

    if (process.env.NODE_ENV === 'development') {
      logger.info('Looking for file changes...\n')
    }

    // Estado profesional del bot
    const actividades = [
      '.gg/tscommunity',
      '#TSCommunity',
    ]

    setInterval(() => {
      if (!client.user) return
      const status = actividades[Math.floor(Math.random() * actividades.length)]
      client.user.setActivity({ name: status, type: 3 })
    }, 1000 * 60 * 15)

    // Sincroniza los paneles al arrancar (con debounce) y reordena la categoría si hace falta
    schedulePanelsSync(client, 15_000)
  }
} satisfies Event<'clientReady'>
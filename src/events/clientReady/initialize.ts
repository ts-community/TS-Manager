import mongoose from 'mongoose'
import { ActivityType } from 'discord.js'
import type { Event } from '../../types/events'
import { mongoURL } from '../../config/env'
import logger from '../../utils/logger'
import { publishServiceThreads } from '../../services/services'

export default {
  once: true,
  
  async execute(client) {
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

    const activities = [
      'En desarrollo'
    ]

    setInterval(() => {
      const status = activities[Math.floor(Math.random() * activities.length)]
      client.user.setActivity({ name: status, type: ActivityType.Custom })
    }, 1000 * 60)
  }
} satisfies Event<'clientReady'>
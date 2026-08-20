import mongoose from 'mongoose'
import { ActivityType } from 'discord.js'
import type { Event } from '../../types/events'
import { mongoURL } from '../../config/env'
import logger from '../../utils/logger'

export default {
  once: true,
  
  async execute(client) {
    logger.success(`Logged in as ${client.user.tag}`)

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
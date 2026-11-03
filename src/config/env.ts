import 'dotenv/config'
import logger from '../utils/logger'

const requiredEnv = ['TOKEN', 'MONGO_URL', 'GUILD_ID', 'PREFIX'] as const

for (const key of requiredEnv) {
  if (!process.env[key]) {
    logger.fatal.bold(`Environment variable ${key} not defined`)
    process.exit(1)
  }
}

export const token = process.env.TOKEN!
export const mongoURL = process.env.MONGO_URL!
export const guildId = process.env.GUILD_ID!
export const prefix = process.env.PREFIX!
export const brawlStarsChannelId = process.env.BRAWL_STARS_CHANNEL_ID || process.env.RAWL_STARS_CHANNEL_ID || ''
export const brawlStarsMessageId = process.env.BRAWL_STARS_MESSAGE_ID || ''
export const brawlStarsApiToken = process.env.BRAWL_STARS_API_TOKEN || ''
export const tsApiUrl = process.env.TS_API_URL || 'http://localhost:4322'
export const internalApiKey = process.env.INTERNAL_API_KEY || ''
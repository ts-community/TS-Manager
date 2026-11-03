import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'
import { token } from './config/env'

import loadCommands from './handlers/commands'
import loadEvents from './handlers/events'

import logger from './utils/logger'

const PRESENCE_FLAGS = (1 << 12) | (1 << 13)

async function presenceIntentAllowed(): Promise<boolean> {
  try {
    const response = await fetch('https://discord.com/api/v10/oauth2/applications/@me', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return false

    const application = await response.json() as { flags?: number }
    return typeof application.flags === 'number' && (application.flags & PRESENCE_FLAGS) !== 0
  } catch {
    return false
  }
}

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.MessageContent
]

if (await presenceIntentAllowed()) {
  intents.push(GatewayIntentBits.GuildPresences)
} else {
  logger.info('Presence Intent no habilitado: el online exacto se obtendrá del widget del servidor')
}

const client = new Client({
  intents,
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
})

client.prefixCommands = new Collection()
client.slashCommands = new Collection()
client.contextMenuCommands = new Collection()

process.on('unhandledRejection', (error: unknown) => {
  const err = error instanceof Error
    ? error
    : new Error(String(error))

  logger.error.bold('Unhandled rejection', {
    message: err.message,
    at: err.stack?.split('\n')[1]?.match(/([^/]+:\d+:\d+)/)?.[1] || 'unknown'
  })
})

process.on('uncaughtException', (error) => {
  logger.fatal.bold('Uncaught exception', {
    message: error?.message,
    at: error?.stack?.split('\n')[1]?.match(/([^/]+:\d+:\d+)/)?.[1] || 'unknown'
  })
  process.exit(1)
})

logger.info('Starting up...\n')

await loadCommands(client)
await loadEvents(client)

console.log()
await client.login(token)
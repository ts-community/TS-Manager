import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js'
import { token } from './config/env'

import loadCommands from './handlers/commands'
import loadEvents from './handlers/events'

import logger from './utils/logger'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
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
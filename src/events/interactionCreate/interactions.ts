import { EmbedBuilder } from 'discord.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Event } from '../../types/events'
import logger from '../../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function importHandler(folder: string, name: string) {
  for (const extension of ['.ts', '.js']) {
    const handlerPath = path.join(__dirname, '../../interactions', folder, `${name}${extension}`)
    if (!fs.existsSync(handlerPath)) continue

    const handler = await import(pathToFileURL(handlerPath).href)
    return handler.default
  }

  return null
}

async function loadHandler(folder: string, customId: string) {
  const exactHandler = await importHandler(folder, customId)
  if (exactHandler) return exactHandler

  if (customId.includes(':')) {
    return importHandler(folder, customId.split(':')[0])
  }

  return null
}

export default {
  async execute(interaction, client) {
    try {
      let handler = null
      let folder = ''
      let id = ''

      if (interaction.isButton()) {
        folder = 'buttons'
        id = interaction.customId
      } else if (interaction.isModalSubmit()) {
        folder = 'modals'
        id = interaction.customId
      } else if (interaction.isAnySelectMenu()) {
        folder = 'selectMenus'
        id = interaction.customId
      }

      if (folder) {
        handler = await loadHandler(folder, id)
      }

      if (!handler) return

      await handler.execute(interaction, client)
    } catch (error) {
      logger.error('Component handler failed', {
        type: interaction.type,
        customId: 'customId' in interaction ? interaction.customId : 'unknown',
        user: interaction.user.tag,
        message: error instanceof Error ? error.message : 'Unknown error',
        at: error instanceof Error
          ? error.stack?.split('\n')[1]?.match(/([^/]+:\d+:\d+)/)?.[1] ?? 'unknown'
          : 'unknown'
      })

      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('Ocurrió un error al procesar la interacción')

      const reply = { embeds: [embed], ephemeral: true }

      if (!interaction.isRepliable()) return

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {})
      } else {
        await interaction.reply(reply).catch(() => {})
      }
    }
  }
} satisfies Event<'interactionCreate'>
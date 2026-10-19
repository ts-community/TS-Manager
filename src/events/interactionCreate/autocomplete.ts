import type { Event } from '../../types/events'
import logger from '../../utils/logger'

export default {
  async execute(interaction, client) {
    if (!interaction.isAutocomplete()) return

    const command = client.slashCommands.get(interaction.commandName)
    if (!command?.autocomplete) return

    try {
      await command.autocomplete(interaction, client)
    } catch (error) {
      logger.error('Autocomplete failed', {
        command: interaction.commandName,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'interactionCreate'>

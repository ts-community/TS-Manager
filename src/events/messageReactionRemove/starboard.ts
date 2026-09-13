import type { Message, MessageReaction } from 'discord.js'
import type { Event } from '../../types/events'
import { STARBOARD_CHANNEL_ID, STARBOARD_EMOJI, countStars, syncStarboard } from '../../services/starboard'
import logger from '../../utils/logger'

export default {
  async execute(reaction, user, _details, client) {
    try {
      if (reaction.partial) await reaction.fetch()
      const fullReaction = reaction as MessageReaction
      if (fullReaction.emoji.name !== STARBOARD_EMOJI) return

      if (user.partial) await user.fetch()
      if (user.bot) return

      if (fullReaction.message.partial) await fullReaction.message.fetch()
      const message = fullReaction.message as Message
      if (!message.guild || message.author?.bot) return
      if (message.channel.id === STARBOARD_CHANNEL_ID) return

      const stars = await countStars(fullReaction, message)
      await syncStarboard(client, message, stars)
    } catch (error) {
      logger.error('Starboard reaction remove failed', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageReactionRemove'>

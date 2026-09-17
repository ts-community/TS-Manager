import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import logger from '../../utils/logger'

// Canal donde se publican las encuestas + rol a pinguear
const ENCUESTAS_CHANNEL_ID = '1128317797529833552'
const ENCUESTAS_ROLE_ID = '1173984415836291132'

export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (message.author.bot) return
    if (message.channelId !== ENCUESTAS_CHANNEL_ID) return

    const poll = message.poll
    if (!poll) return

    const question = poll.question?.text?.trim()
    if (!question) return

    await message
      .reply({
        content: `${question} <@&${ENCUESTAS_ROLE_ID}>`,
        allowedMentions: { parse: ['roles'] }
      })
      .catch((error: unknown) => {
        logger.error('Encuestas ping failed', {
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      })
  }
} satisfies Event<'messageCreate'>

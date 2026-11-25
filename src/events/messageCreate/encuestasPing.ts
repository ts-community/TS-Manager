import { nativePollsEnabled } from '../../services/surveyDelivery'
import { staffApi } from '../../services/staffApi'
import { staffChannels } from '../../config/staffChannels'
import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import logger from '../../utils/logger'

// Canal donde se publican las encuestas + rol a pinguear
const ENCUESTAS_CHANNEL_ID = staffChannels.polls
const ENCUESTAS_ROLE_ID = staffChannels.pollRole

export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (message.author.bot || message.guildId !== staffChannels.guild) return
    if (message.channelId !== ENCUESTAS_CHANNEL_ID) return

    const poll = message.poll
    if (!poll) return

    if (nativePollsEnabled()) await staffApi(null,'surveys/publication',{messageId:message.id,authorId:message.author.id,at:message.createdAt}).catch(() => logger.warn('Encuesta pendiente de conciliación'))
    const question = poll.question?.text?.trim()
    if (!question) return

    await message
      .reply({
        content: `${question} <@&${ENCUESTAS_ROLE_ID}>`,
        nonce: message.id, enforceNonce: true,
        allowedMentions: { roles: [ENCUESTAS_ROLE_ID], repliedUser: false }
      })
      .catch((error: unknown) => {
        logger.error('Encuestas ping failed', {
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      })
  }
} satisfies Event<'messageCreate'>

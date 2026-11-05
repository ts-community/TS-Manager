import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js'
import type { Client, Message } from 'discord.js'
import type { Event } from '../../types/events'
import logger from '../../utils/logger'

const EMOJI_EVENT_CHANNEL_ID = '1567590360631222413'
const VOTE_REACTIONS = ['✅', '❓', '❌'] as const
const KEYWORD_PATTERN = /\b(?:emoji|sticker)\b/i

function hasEventKeyword(message: Message): boolean {
  return KEYWORD_PATTERN.test(message.content)
}

function isValidSubmission(message: Message): boolean {
  const imageCount = message.attachments.filter(attachment => {
    if (attachment.contentType) return attachment.contentType.startsWith('image/')
    return /\.(?:png|jpe?g|gif|webp|avif)$/i.test(attachment.name ?? attachment.url)
  }).size

  if (message.attachments.size > 1) return false
  if (imageCount === 1) return true
  return message.attachments.size === 0 && message.stickers.size === 0 && hasEventKeyword(message)
}

async function notifyInvalidSubmission(message: Message): Promise<void> {
  try {
    const container = new ContainerBuilder()
      .setAccentColor(0xED4245)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# 🧩 Participación no válida')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          'Tu mensaje se ha eliminado del canal del evento porque no cumple el formato de las participaciones.\n\n' +
          'Cada mensaje debe corresponder a una única propuesta para que las votaciones sean claras y justas:\n\n' +
          '- Adjunta una sola imagen.\n' +
          '- Indica claramente si estás presentando un emoji o un sticker.\n' +
          '- No envíes varias imágenes ni archivos adicionales en el mismo mensaje.\n\n' +
          'Vuelve a enviarlo siguiendo estas indicaciones para que el resto de participantes pueda valorar tu propuesta.'
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Volver al canal del evento')
            .setURL(`https://discord.com/channels/${message.guildId}/${message.channelId}`)
            .setStyle(ButtonStyle.Link)
        )
      )

    await message.author.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    })
  } catch (error) {
    logger.error('Emoji event: failed to notify user about invalid message', {
      userId: message.author.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (message.author.bot || message.channelId !== EMOJI_EVENT_CHANNEL_ID) return

    if (!isValidSubmission(message)) {
      await notifyInvalidSubmission(message)
      try {
        await message.delete()
      } catch (error) {
        logger.error('Emoji event: failed to delete invalid message', {
          channelId: message.channelId,
          messageId: message.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
      return
    }

    for (const reaction of VOTE_REACTIONS) {
      try {
        await message.react(reaction)
      } catch (error) {
        logger.error('Emoji event: failed to add vote reaction', {
          channelId: message.channelId,
          messageId: message.id,
          reaction,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        return
      }
    }
  }
} satisfies Event<'messageCreate'>

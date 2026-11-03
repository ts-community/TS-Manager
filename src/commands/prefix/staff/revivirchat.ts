import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js'
import type { PrefixCommand } from '../../../types/commands'

const ROLE_ID = '1173666295556866089'
const GENERAL_CHANNEL_NAME = 'general'
const COOLDOWN_MS = 24 * 60 * 60 * 1000

/** Última vez que se envió el ping del rol en este proceso. */
let lastSentAt = 0

export default {
  description: 'Menciona al rol revivirchat con un mensaje',

  async execute(message, args) {
    if (!message.inGuild()) return

    if (message.channel.isThread() || message.channel.name.toLowerCase() !== GENERAL_CHANNEL_NAME) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setDescription('Este comando solo se puede usar en el canal #general.')
        ]
      })
      return
    }

    const remaining = lastSentAt + COOLDOWN_MS - Date.now()
    if (lastSentAt > 0 && remaining > 0) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setDescription(`Ya se envió un @revivirchat hace poco. Podrás volver a usarlo <t:${Math.floor((lastSentAt + COOLDOWN_MS) / 1000)}:R>.`)
        ]
      })
      return
    }

    const text = args.join(' ').trim()

    if (!text) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setDescription('Debes escribir un mensaje. Ejemplo: `!revivirchat ¿alguien para jugar?`')
        ]
      })
      return
    }

    const content = `<@&${ROLE_ID}> ${text}`
    if (content.length > 2000) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Yellow')
            .setDescription('El mensaje es demasiado largo (máximo 2000 caracteres)')
        ]
      })
      return
    }

    const authorName = message.member?.displayName ?? message.author.username
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`revivirchat:${message.author.id}`)
        .setLabel(`Enviado por ${authorName}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    )

    if (!message.channel.isSendable()) return

    await message.channel.send({
      content,
      components: [row],
      allowedMentions: { roles: [ROLE_ID] }
    })

    lastSentAt = Date.now()
  }
} satisfies PrefixCommand

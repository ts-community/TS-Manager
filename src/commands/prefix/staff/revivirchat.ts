import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js'
import type { PrefixCommand } from '../../../types/commands'

export default {
  description: 'Menciona al rol revivirchat con un mensaje',
  cooldown: 300, // 5 min por usuario (el sistema actual solo soporta cooldown por usuario)

  async execute(message, args) {
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

    if (!message.guild) return

    const roleId = '1173666295556866089'

    const content = `<@&${roleId}> ${text}`
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
      allowedMentions: { roles: [roleId] }
    })
  }
} satisfies PrefixCommand

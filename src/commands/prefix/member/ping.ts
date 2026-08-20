import { EmbedBuilder } from 'discord.js'
import type { PrefixCommand } from '../../../types/commands'

export default {
  async execute(message, args, client) {
    const start = Date.now()
    const sent = await message.reply('Calculando latencia...')
    const latency = Date.now() - start
    const apiLatency = Math.round(client.ws.ping)

    await sent.edit({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor('Blue')
          .setTitle('🏓 Pong!')
          .addFields(
            { name: 'Latencia', value: `${latency}ms`, inline: true },
            { name: 'API', value: `${apiLatency}ms`, inline: true }
          )
      ]
    })
  }
} satisfies PrefixCommand
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type Guild,
  type GuildMember,
  type Message
} from 'discord.js'
import type { Event } from '../../types/events'
import logger from '../../utils/logger'

// Canal donde el bot de postulaciones publica sus embeds
const POSTULACIONES_CHANNEL_ID = '1153043300081737828'
const POSTULACIONES_EMBED_TITLE = 'Postulaciones de TS Community Brawl'

async function resolveUser(guild: Guild, rawValue: string): Promise<GuildMember | null> {
  const userID = rawValue.replaceAll('>', '').trim()
  if (!userID) return null

  if (guild.members.cache.has(userID)) {
    return guild.members.cache.get(userID) ?? null
  }

  const cached = guild.members.cache.find(
    member =>
      member.user.username.toLowerCase() === userID.toLowerCase() ||
      member.displayName.toLowerCase() === userID.toLowerCase()
  )
  if (cached) return cached

  const fetched = await guild.members.fetch({ query: userID, limit: 1 }).catch(() => null)
  if (fetched && fetched.size > 0) return fetched.first() ?? null

  return null
}

export default {
  async execute(message: Message, _client: Client): Promise<void> {
    if (message.channelId !== POSTULACIONES_CHANNEL_ID) return
    if (!message.guild) return
    if (message.embeds.length === 0) return
    if (message.embeds[0].title !== POSTULACIONES_EMBED_TITLE) return

    try {
      const guild = message.guild
      const embed = message.embeds[0]
      const rawValue = embed.fields[0]?.value ?? ''
      const user = await resolveUser(guild, rawValue)

      if (!user) {
        logger.warn('Postulación sin usuario resoluble', { value: rawValue })
        return
      }

      const postEmbed = new EmbedBuilder()
        .setTitle('Revisión de la Postulación')
        .addFields(
          { name: 'Usuario', value: `<@${user.id}>`, inline: true },
          { name: 'Estado', value: 'Pendiente', inline: true }
        )
        .setColor('Orange')

      const accept = new ButtonBuilder()
        .setCustomId('accept')
        .setLabel('Aceptar')
        .setStyle(ButtonStyle.Success)
      const decline = new ButtonBuilder()
        .setCustomId('decline')
        .setLabel('Rechazar')
        .setStyle(ButtonStyle.Danger)

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(accept, decline)

      const channel = message.channel
      if (!('send' in channel)) return

      const msg = await channel.send({ embeds: [postEmbed], components: [row] })

      for (const emoji of ['✅', '❓', '❌']) {
        await msg.react(emoji).catch(() => null)
      }
    } catch (error) {
      logger.error('Postulaciones review failed', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'messageCreate'>

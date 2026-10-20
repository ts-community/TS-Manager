import { EmbedBuilder, type Client, type GuildMember } from 'discord.js'
import type { Event } from '../../types/events'
import logger from '../../utils/logger'

// Canal donde se publica la bienvenida
const WELCOME_CHANNEL_ID = '1096150563667837011'

// Enlace del título del embed
const WELCOME_URL = 'https://niveles.tscomunity.es/easteregg?guild=1093864130030612521'

// Bienvenida al entrar al servidor (sustituye a Carl-bot)
export default {
  async execute(member: GuildMember, client: Client): Promise<void> {
    if (member.user.bot) return

    try {
      const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null)
      if (!channel?.isSendable()) return

      const { guild } = member
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`¡${member.user.username} acaba de unirse a ${guild.name}!`)
        .setURL(WELCOME_URL)
        .setDescription(
          `**¡Gracias por unirte a ${guild.name}!** ✅\n` +
          '**¡Esperamos que disfrutes de tu estancia!** 💙'
        )
        .setFooter({
          text: `Eres el miembro #${guild.memberCount} de ${guild.name}`,
          iconURL: guild.iconURL() ?? undefined
        })

      await channel.send({
        content: `<@${member.id}>`,
        embeds: [embed],
        allowedMentions: { users: [member.id] }
      })
    } catch (error) {
      logger.error('Bienvenida: error enviando el mensaje', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'guildMemberAdd'>

import { ChannelType, EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import { addPurgeChannel, getGuildConfig, removePurgeChannel } from '../../../services/guild'

const DEFAULT_INTERVAL_MINUTES = 5

function formatChannel(channelId: string, guildChannels: Map<string, { toString(): string }>): string {
  const channel = guildChannels.get(channelId)
  return channel ? `${channel}` : `<#${channelId}>`
}

export default {
  data: new SlashCommandBuilder()
    .setName('purgechannel')
    .setDescription('Configurar canales con limpieza automática')
    .addSubcommand(sub =>
      sub
        .setName('agregar')
        .setDescription('Agregar un canal a la limpieza automática')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal que se limpiará automáticamente')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('minutos')
            .setDescription(`Cada cuántos minutos se limpiará el canal (por defecto ${DEFAULT_INTERVAL_MINUTES})`)
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remover')
        .setDescription('Quitar un canal de la limpieza automática')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal a remover')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver los canales configurados')
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.'
      })
    }

    const guild = interaction.guild
    const sub = interaction.options.getSubcommand()
    const config = await getGuildConfig()

    const replyEmbed = (color: 'Red' | 'Green' | 'Blue' | 'Yellow', description: string, title: string | null = null) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description)

      if (title) embed.setTitle(title)

      return interaction.reply({ embeds: [embed] })
    }

    if (sub === 'agregar') {
      const channel = interaction.options.getChannel('canal', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement])
      const intervalMinutes = interaction.options.getInteger('minutos') ?? DEFAULT_INTERVAL_MINUTES

      if (config.purgeChannels.some(p => p.channelId === channel.id)) {
        return replyEmbed('Red', `${channel} ya está configurado para limpieza automática.`)
      }

      await addPurgeChannel(channel.id, intervalMinutes)
      return replyEmbed('Green', `${channel} añadido a los canales con limpieza automática cada **${intervalMinutes}** minuto(s).`)
    }

    if (sub === 'remover') {
      const channel = interaction.options.getChannel('canal', true)

      if (!config.purgeChannels.some(p => p.channelId === channel.id)) {
        return replyEmbed('Red', `${channel} no está configurado para limpieza automática.`)
      }

      await removePurgeChannel(channel.id)
      return replyEmbed('Red', `${channel} eliminado de los canales con limpieza automática.`)
    }

    if (sub === 'ver') {
      if (config.purgeChannels.length === 0) {
        return replyEmbed('Blue', 'No hay canales configurados.', 'Purge Channels')
      }

      const channels = config.purgeChannels
        .map(({ channelId, intervalMinutes }) => `• ${formatChannel(channelId, guild.channels.cache)} — cada **${intervalMinutes}** minuto(s)`)
        .join('\n')

      return replyEmbed('Blue', channels, 'Canales con Limpieza Automática')
    }
  }
} satisfies SlashCommand
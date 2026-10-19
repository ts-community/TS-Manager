import { SlashCommandBuilder, EmbedBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import EconomyBlacklist from '../../../models/EconomyBlacklist'
import {
  addToBlacklist,
  removeFromBlacklist,
  parseDuration,
  formatExpiry
} from '../../../services/economyBlacklist'

export default {
  data: new SlashCommandBuilder()
    .setName('blacklisteconomia')
    .setDescription('Gestiona la blacklist de economía')
    .addSubcommand(sub =>
      sub
        .setName('añadir')
        .setDescription('Prohíbe a un usuario jugar a la economía')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true).setMaxLength(500))
        .addStringOption(o =>
          o.setName('tiempo').setDescription('Duración: 30m, 12h, 7d, 2w o permanente').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('quitar')
        .setDescription('Retira a un usuario de la blacklist')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('lista').setDescription('Muestra los usuarios en la blacklist')),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Este comando solo puede ser usado en servidores.', ephemeral: true })
    }

    const sub = interaction.options.getSubcommand()

    if (sub === 'añadir') {
      const user = interaction.options.getUser('usuario', true)
      const reason = interaction.options.getString('motivo', true)
      const duration = parseDuration(interaction.options.getString('tiempo', true))

      if (duration === undefined) {
        return interaction.reply({
          content: 'Tiempo no válido. Usa por ejemplo `30m`, `12h`, `7d`, `2w` o `permanente`.',
          ephemeral: true
        })
      }
      if (user.bot) {
        return interaction.reply({ content: 'No puedes meter a un bot en la blacklist.', ephemeral: true })
      }

      const { entry, roleAdded, inGuild } = await addToBlacklist(interaction.guild, user.id, reason, interaction.user.id, duration)

      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('Blacklist de economía')
        .setDescription(`<@${user.id}> ya no puede jugar a la economía.`)
        .addFields(
          { name: 'Motivo', value: reason },
          { name: 'Expira', value: formatExpiry(entry.expiresAt) }
        )
      if (!inGuild) embed.setFooter({ text: 'El usuario no está en el servidor: se le dará el rol cuando vuelva a escribir.' })
      else if (!roleAdded) embed.setFooter({ text: 'No pude darle el rol (revisa permisos y jerarquía del bot).' })

      return interaction.reply({ embeds: [embed] })
    }

    if (sub === 'quitar') {
      const user = interaction.options.getUser('usuario', true)
      const entry = await removeFromBlacklist(interaction.guild, user.id)
      return interaction.reply({
        content: entry ? `<@${user.id}> ha sido retirado de la blacklist de economía.` : `<@${user.id}> no estaba en la blacklist.`,
        allowedMentions: { parse: [] }
      })
    }

    const entries = await EconomyBlacklist.find({ guildId: interaction.guild.id }).sort({ createdAt: -1 }).limit(25)
    if (!entries.length) {
      return interaction.reply({ content: 'La blacklist de economía está vacía.', ephemeral: true })
    }

    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('Blacklist de economía')
      .setDescription(
        entries
          .map(e => `<@${e.userId}> · ${formatExpiry(e.expiresAt)}\n> ${e.reason}`)
          .join('\n\n')
          .slice(0, 4000)
      )
    return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } })
  }
} satisfies SlashCommand

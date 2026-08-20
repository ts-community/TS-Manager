import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type ColorResolvable } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Guild from '../../../models/Guild'

export default {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Gestionar roles de staff')
    .addSubcommand(sub =>
      sub
        .setName('añadir-rol')
        .setDescription('Añadir un rol')
        .addRoleOption(opt =>
          opt.setName('rol')
            .setDescription('Rol a añadir')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remover-rol')
        .setDescription('Remover un rol')
        .addRoleOption(opt =>
          opt.setName('rol')
            .setDescription('Rol a remover')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('mostrar')
        .setDescription('Mostrar roles configurados')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand()

    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.',
        ephemeral: true
      })
    }

    const config =
      await Guild.findOne({ guildId: interaction.guild.id }) ||
      await Guild.create({ guildId: interaction.guild.id })

    const replyEmbed = (color: ColorResolvable, description: string, title: string | null = null) => {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(description)

      if (title) embed.setTitle(title)

      return interaction.reply({ embeds: [embed] })
    }

    if (sub === 'añadir-rol') {
      const role = interaction.options.getRole('rol', true)

      if (config.staffRoleIds.includes(role.id)) {
        return replyEmbed('Red', `${role} ya está configurado.`)
      }

      config.staffRoleIds.push(role.id)
      await config.save()

      return replyEmbed('Green', `${role} añadido al staff.`)
    }

    if (sub === 'remover-rol') {
      const role = interaction.options.getRole('rol', true)

      if (!config.staffRoleIds.includes(role.id)) {
        return replyEmbed('Red', `${role} no está configurado.`)
      }

      config.staffRoleIds = config.staffRoleIds.filter(id => id !== role.id)
      await config.save()

      return replyEmbed('Red', `${role} eliminado del staff.`)
    }

    if (sub === 'mostrar') {
      if (config.staffRoleIds.length === 0) {
        return replyEmbed('Blue', 'No hay roles configurados.', 'Staff')
      }

      const roles = config.staffRoleIds
        .map(id => `<@&${id}>`)
        .join(', ')

      return replyEmbed('Blue', roles, 'Roles del Staff')
    }
  }
} satisfies SlashCommand
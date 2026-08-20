import { EmbedBuilder } from 'discord.js'
import type { Event } from '../../types/events'
import { hasPermission, checkCooldown } from '../../services/permissions'
import logger from '../../utils/logger'

const PERMISSION_MESSAGES: Record<string, string | null> = {
  admin: 'Este comando requiere permisos de Administrador para ser utilizado',
  staff: 'Este comando require tener un rol de staff para ser utilizado',
  member: null
}

export default {
  async execute(interaction, client) {
    if (!interaction.isContextMenuCommand()) return

    const command = client.contextMenuCommands.get(interaction.commandName)
    if (!command) return

    const allowed = await hasPermission(interaction, command.permission)
    if (!allowed) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription(
          PERMISSION_MESSAGES[command.permission]
          ?? 'No tienes permisos para utilizar este comando'
        )
      await interaction.reply({ embeds: [embed], ephemeral: true })
      return
    }

    if (command.cooldown) {
      const remaining = checkCooldown(interaction.commandName, interaction.user.id, command.cooldown)
      if (remaining) {
        const embed = new EmbedBuilder()
          .setColor('Yellow')
          .setDescription(`Debes esperar **${remaining}s** para volver a utilizar este comando`)
        await interaction.reply({ embeds: [embed], ephemeral: true })
        return
      }
    }

    try {
      await command.execute(interaction, client)
    } catch (error) {
      logger.error('Context command failed', {
        command: interaction.commandName,
        user: interaction.user.tag,
        message: error instanceof Error ? error.message : 'Unknown error',
        at: error instanceof Error
          ? error.stack?.split('\n')[1]?.match(/([^/]+:\d+:\d+)/)?.[1] ?? 'unknown'
          : 'unknown'
      })

      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('Ocurrió un error a la hora de ejecutar el comando')

      const reply = { embeds: [embed], ephemeral: true }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply)
      } else {
        await interaction.reply(reply)
      }
    }
  }
} satisfies Event<'interactionCreate'>
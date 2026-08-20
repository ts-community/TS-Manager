import { EmbedBuilder, Message, Client } from 'discord.js'
import type { Event } from '../../types/events'
import { hasPermission, checkCooldown, type PermissionContext } from '../../services/permissions'
import { prefix } from '../../config/env'
import logger from '../../utils/logger'

const PERMISSION_MESSAGES: Record<string, string | null> = {
  admin: 'Este comando requiere permisos de Administrador para ser utilizado',
  staff: 'Este comando require tener un rol de staff para ser utilizado',
  member: null
}

export default {
  async execute(message: Message, client: Client): Promise<void> {
    if (!message.guild) return

    let commandName: string | undefined

    try {
      if (message.author.bot) return

      if (!message.content.startsWith(prefix)) return

      const args = message.content.slice(prefix.length).trim().split(/ +/)
      commandName = args.shift()?.toLowerCase()
      if (!commandName) return

      const command = client.prefixCommands.get(commandName)
      if (!command) return

      const context: PermissionContext = { member: message.member }

      const allowed = await hasPermission(context, command.permission)
      if (!allowed) {
        const embed = new EmbedBuilder()
          .setColor('Red')
          .setDescription(
            PERMISSION_MESSAGES[command.permission]
            ?? 'No tienes permisos para utilizar este comando'
          )
        await message.reply({ embeds: [embed] })
        return
      }

      if (command.cooldown) {
        const remaining = checkCooldown(commandName, message.author.id, command.cooldown)
        if (remaining) {
          const embed = new EmbedBuilder()
            .setColor('Yellow')
            .setDescription(`Debes esperar **${remaining}s** para volver a utilizar este comando`)
          await message.reply({ embeds: [embed] })
          return
        }
      }

      await command.execute(message, args, client)
    } catch (error) {
      logger.error('Prefix command failed', {
        command: commandName,
        message: error instanceof Error ? error.message : 'Unknown error'
      })

      const embed = new EmbedBuilder()
        .setColor('Red')
        .setDescription('Ocurrió un error al ejecutar este comando')

      await message.reply({ embeds: [embed] })
    }
  }
} satisfies Event<'messageCreate'>
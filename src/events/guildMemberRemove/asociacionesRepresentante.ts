import type { Client, GuildMember, PartialGuildMember } from 'discord.js'
import type { Event } from '../../types/events'
import Asociacion from '../../models/Asociacion'
import { EMOJI, greenEmbed, sendAsociacionesLog } from '../../services/asociaciones'
import logger from '../../utils/logger'

// Avisa cuando el representante de una asociación abandona el servidor
export default {
  async execute(member: GuildMember | PartialGuildMember, client: Client): Promise<void> {
    try {
      const asociaciones = await Asociacion.find({ representanteId: member.id })

      for (const asociacion of asociaciones) {
        const embed = greenEmbed()
          .setTitle('⚠️ Representante de Asociación Ha Salido')
          .setDescription(
            `El representante **${member.user.tag}** (<@${member.id}>) ha abandonado el servidor.\n\n` +
            `${EMOJI.servidor} **Asociación:** ${asociacion.servidor}`
          )
          .setTimestamp()

        await sendAsociacionesLog(client, embed)
      }
    } catch (error) {
      logger.error('Asociaciones: error en aviso de salida del representante', {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
} satisfies Event<'guildMemberRemove'>

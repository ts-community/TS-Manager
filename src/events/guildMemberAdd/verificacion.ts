import type { Event } from '../../types/events'
import { UNVERIFIED_ROLE_ID } from '../../config/verification'
import Verification from '../../models/Verification'
import logger from '../../utils/logger'

// Aplica el rol de "sin verificar" a quien entra sin cuenta vinculada.
export default {
  async execute(member) {
    if (member.user.bot || !UNVERIFIED_ROLE_ID) return

    try {
      const linked = await Verification.findOne({ guildId: member.guild.id, userId: member.id })
      if (linked) return

      if (!member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
        await member.roles.add(UNVERIFIED_ROLE_ID, 'Miembro sin verificar')
      }
    } catch (error) {
      logger.warn(`No se pudo aplicar el rol de sin verificar a ${member.id}: ${(error as Error).message}`)
    }
  }
} satisfies Event<'guildMemberAdd'>

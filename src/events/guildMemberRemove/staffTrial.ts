import type { Event } from '../../types/events'
import { updateTrial } from '../../services/staffTracking'

export default {
  async execute(member) {
    await updateTrial(member, false)
  }
} satisfies Event<'guildMemberRemove'>

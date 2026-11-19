import type { Event } from '../../types/events'
import { countStaffMessage } from '../../services/staffTracking'

export default {
  async execute(message) {
    if (message.member) await countStaffMessage(message.member, message.createdTimestamp, message.id)
  }
} satisfies Event<'messageCreate'>

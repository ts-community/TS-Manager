import type { Event } from '../../types/events'
import { hasTrialRole, updateTrial } from '../../services/staffTracking'

export default {
  async execute(previous, member) {
    const active = hasTrialRole(member)
    if (previous.partial || hasTrialRole(previous) !== active) await updateTrial(member, active)
  }
} satisfies Event<'guildMemberUpdate'>

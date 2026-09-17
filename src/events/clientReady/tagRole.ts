import type { Event } from '../../types/events'
import { startTagRoleManager } from '../../services/tagRole'

export default {
  once: true,

  async execute(client) {
    await startTagRoleManager(client)
  }
} satisfies Event<'clientReady'>

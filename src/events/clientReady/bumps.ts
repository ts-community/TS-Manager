import type { Event } from '../../types/events'
import { runInterval } from '../../utils/interval'
import { checkBumpReminders } from '../../services/bumps'

export default {
  once: true,

  async execute(client) {
    // Al arrancar también cubre cooldowns que vencieron con el bot apagado
    runInterval([async function checkBumpReminderTasks() {
      await checkBumpReminders(client)
    }], 1000 * 60)
  }
} satisfies Event<'clientReady'>

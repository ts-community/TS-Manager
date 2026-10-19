import type { Event } from '../../types/events'
import { runInterval } from '../../utils/interval'
import { checkDueAsociaciones } from '../../services/asociaciones'

export default {
  once: true,

  async execute(client) {
    runInterval(
      [
        async function checkAsociacionesRenovacion() {
          await checkDueAsociaciones(client)
        }
      ],
      1000 * 60 * 30
    )
  }
} satisfies Event<'clientReady'>

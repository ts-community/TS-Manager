import type { Event } from '../../types/events'
import { runInterval } from '../../utils/interval'
import { checkDueAsociaciones } from '../../services/asociaciones'
import { schedulePanelsSync } from '../../services/asociacionesPanel'

export default {
  once: true,

  async execute(client) {
    // Sincroniza los paneles al arrancar (con debounce) y reordena la categoría si hace falta
    schedulePanelsSync(client, 15_000)

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

import type { Event } from '../../types/events'
import { refreshBuscarEquipoSticky } from '../../services/buscarEquipo'
import { runInterval } from '../../utils/interval'

export default {
  once: true,

  async execute(client) {
    // Asegurar el sticky al arrancar (por si se borró con el bot apagado).
    await refreshBuscarEquipoSticky(client)

    // Comprobación periódica: si alguien borra el sticky y no hay actividad,
    // esto lo restaura abajo del todo.
    runInterval([async function ensureBuscarEquipoSticky() {
      await refreshBuscarEquipoSticky(client)
    }], 1000 * 60 * 5)
  }
} satisfies Event<'clientReady'>

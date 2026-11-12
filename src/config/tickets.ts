// Tickets gestionados por el bot Guild Manager.

/** Categoría donde Guild Manager crea los tickets. */
export const TICKETS_CATEGORY_ID = '1096144326393864234'

/** Bot que gestiona los tickets y avisa de las reclamaciones. */
export const TICKETS_BOT_ID = '808346067317162015'

/**
 * Rango mínimo que conserva el permiso de escribir cuando alguien reclama un ticket.
 * Los roles de staff por debajo (Moderador, Staff en Pruebas…) dejan de poder escribir,
 * salvo quien lo haya reclamado.
 */
export const TICKET_CLAIM_MIN_ROLE_ID = '1202685031219200040'

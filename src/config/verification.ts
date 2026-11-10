// Configuración del sistema de verificación de Brawl Stars.
//
// Rellena los IDs de rol que aparecen como '' (string vacío): los que queden
// vacíos simplemente no se asignan. Los umbrales se pueden editar libremente.

export const VERIFICATION_CHANNEL_ID = '1112754769472270449'

/** Hilo del foro de logs donde se registran las verificaciones. */
export const VERIFICATION_LOG_THREAD_ID = '1568975810742722642'

/** Rol que recibe un usuario con una cuenta de Brawl Stars vinculada. */
export const VERIFIED_ROLE_ID = '1102603911157797006'

/** Rol que se aplica a quien no tiene la cuenta vinculada. */
export const UNVERIFIED_ROLE_ID = '1107578731918274600'

// --- Roles de rango dentro del club (globales para todos los clubes) ---
export const PRESIDENT_ROLE_ID = '1320857124242456577'
export const VICE_PRESIDENT_ROLE_ID = '1320857188591337635'
export const VETERAN_ROLE_ID = '1320857245751181454'

export interface TierRole {
  /** Valor mínimo (copas o victorias 3v3) para obtener el rol. */
  min: number
  /** ID del rol de Discord. Si está vacío se ignora. */
  roleId: string
}

/**
 * Roles por copas: se aplica el rol del mayor `min` que cumpla `min <= copas`.
 * Ejemplo: si tiene 23.400 copas, recibe el rol de `min: 20_000`.
 */
export const TROPHY_ROLES: TierRole[] = [
  { min: 0, roleId: '1096138051031400582' },
  { min: 10_000, roleId: '1096138172968218675' },
  { min: 20_000, roleId: '1096138256065757234' },
  { min: 30_000, roleId: '1096138324755882104' },
  { min: 40_000, roleId: '1096138402165964882' },
  { min: 50_000, roleId: '1096138525759516672' },
  { min: 60_000, roleId: '1096138601714171904' },
  { min: 70_000, roleId: '1096138649759916042' },
  { min: 80_000, roleId: '1096138709226762334' },
  { min: 90_000, roleId: '1569759758368383147' },
  { min: 100_000, roleId: '1096143450551881739' },
  { min: 110_000, roleId: '1560227928057454653' },
  { min: 120_000, roleId: '1560227942745776148' },
  { min: 130_000, roleId: '1560227854585823262' },
  { min: 140_000, roleId: '1560227888131874866' },
  { min: 150_000, roleId: '1560227832485908622' },
  { min: 160_000, roleId: '1569758131331014767' },
  { min: 170_000, roleId: '1569758123399450804' },
  { min: 180_000, roleId: '1569758115891511420' },
  { min: 190_000, roleId: '1569758107004043425' },
  { min: 200_000, roleId: '1569758112964018216' },
  { min: 210_000, roleId: '1569758120383881338' },
  { min: 220_000, roleId: '1569758126075416576' },
  { min: 230_000, roleId: '1569758128965288117' },
  { min: 240_000, roleId: '1569758145620869151' },
  { min: 250_000, roleId: '1569758143209148546' },
  { min: 260_000, roleId: '1569758140726251560' },
  { min: 270_000, roleId: '1569758138662653982' },
  { min: 280_000, roleId: '1569758136183558214' },
  { min: 290_000, roleId: '1569758134220628049' },
  { min: 300_000, roleId: '1569760250221821972' }
]

/**
 * Roles por victorias 3v3: igual que las copas, se aplica el rol del mayor
 * `min` que cumpla `min <= victorias`.
 */
export const VICTORY_ROLES: TierRole[] = [
  { min: 0, roleId: '1112769055259103357' },
  { min: 5_000, roleId: '1112770703444414565' },
  { min: 10_000, roleId: '1112770771845136434' },
  { min: 15_000, roleId: '1112770831542652999' },
  { min: 20_000, roleId: '1112770944793067701' },
  { min: 25_000, roleId: '1112770886622253207' },
  { min: 30_000, roleId: '1112771184145219654' },
  { min: 35_000, roleId: '1112771264034115676' },
  { min: 40_000, roleId: '1112771322540458115' },
  { min: 45_000, roleId: '1112771379847241728' },
  { min: 50_000, roleId: '1560228982794887228' },
  { min: 55_000, roleId: '1560228995365216326' },
  { min: 60_000, roleId: '1560229077703462994' },
  { min: 65_000, roleId: '1560228930844237834' },
  { min: 70_000, roleId: '1560228963228459048' }
]

/** Cada cuánto se re-verifica a todos los usuarios (12 horas). */
export const REVERIFY_INTERVAL_MS = 12 * 60 * 60 * 1000

/** Espera inicial antes de la primera re-verificación para no saturar el arranque. */
export const REVERIFY_INITIAL_DELAY_MS = 5 * 60 * 1000

/** Emoji que precede al nombre de los roles de club. */
export const CLUB_ROLE_EMOJI = '🔰'

/**
 * Nombre del rol de un club:
 *  - "TS Astral" -> "🔰 Miembro Astral"
 *  - "Shadow"    -> "🔰 Miembro Shadow"
 */
export function buildClubRoleName(clubName: string): string {
  const short = clubName.replace(/^TS\s+/i, '').trim() || clubName.trim()
  return `${CLUB_ROLE_EMOJI} Miembro ${short}`.slice(0, 100)
}

import mongoose from 'mongoose'

export interface UserData {
  discordId: string
  /** Tag de Brawl Stars con # y en mayúsculas, o null si no ha verificado. */
  brawlId: string | null
  /** Nombre del jugador en Brawl Stars. */
  playerName: string | null
  /** Copas actuales del jugador. */
  trophies: number | null
  /** Victorias 3v3 del jugador. */
  victories: number | null
  /** Tag del club al que pertenece el jugador, o null si no tiene club. */
  clubTag: string | null
  /** Nombre del club. */
  clubName: string | null
  /** Rango dentro del club: president | vicePresident | senior | member | null */
  clubRank: string | null
  /** Puntos de ranked actuales (Power League), o null si no ha jugado ranked. */
  rankedPoints: number | null
  /** Referencia al equipo del usuario en torneos. */
  teamId: mongoose.Types.ObjectId | null
  /** Fecha en que se verificó por primera vez. */
  verifiedAt: Date | null
  /** Última vez que se comprobó la cuenta (por el intervalo de 12h). */
  lastCheckedAt: Date | null
}
import mongoose from 'mongoose'

export interface VerificationEntry {
  guildId: string
  userId: string
  /** Tag de Brawl Stars con # y en mayúsculas */
  tag: string
  playerName: string
  trophies: number
  victories: number
  /** Tag del club al que pertenece el jugador, o null si no tiene club. */
  clubTag: string | null
  clubName: string | null
  /** Rango dentro del club: president | vicePresident | senior | member | null */
  clubRank: string | null
  verifiedAt: Date
  /** Última vez que se comprobó la cuenta (por el interval). */
  lastCheckedAt: Date | null
}

const verificationSchema = new mongoose.Schema<VerificationEntry>({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  tag: { type: String, required: true },
  playerName: { type: String, required: true },
  trophies: { type: Number, default: 0 },
  victories: { type: Number, default: 0 },
  clubTag: { type: String, default: null },
  clubName: { type: String, default: null },
  clubRank: { type: String, default: null },
  verifiedAt: { type: Date, default: Date.now },
  lastCheckedAt: { type: Date, default: null }
})

verificationSchema.index({ guildId: 1, userId: 1 })
verificationSchema.index({ guildId: 1, tag: 1 }, { unique: true })

export default mongoose.model('Verification', verificationSchema)

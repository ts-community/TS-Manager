import mongoose from 'mongoose'

export interface VerificationEntry {
  guildId: string
  userId: string
  /** Tag de Brawl Stars con # y en mayúsculas */
  tag: string
  playerName: string
  trophies: number
  verifiedAt: Date
}

const verificationSchema = new mongoose.Schema<VerificationEntry>({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  tag: { type: String, required: true },
  playerName: { type: String, required: true },
  trophies: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: Date.now }
})

verificationSchema.index({ guildId: 1, userId: 1 })
verificationSchema.index({ guildId: 1, tag: 1 }, { unique: true })

export default mongoose.model('Verification', verificationSchema)

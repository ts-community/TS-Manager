import mongoose from 'mongoose'

export interface EconomyBlacklistEntry {
  guildId: string
  userId: string
  reason: string
  moderatorId: string
  createdAt: Date
  /** null = permanente */
  expiresAt: Date | null
}

const economyBlacklistSchema = new mongoose.Schema<EconomyBlacklistEntry>({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  reason: { type: String, required: true },
  moderatorId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null }
})

economyBlacklistSchema.index({ guildId: 1, userId: 1 }, { unique: true })

export default mongoose.model('EconomyBlacklist', economyBlacklistSchema)

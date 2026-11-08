import mongoose from 'mongoose'
import type { BlacklistData, BlacklistEntry } from '@/types/blacklist'

const blacklistEntrySchema = new mongoose.Schema<BlacklistEntry>({
  addedBy: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true,
    maxlength: 500
  },
  durationDays: {
    type: Number,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, { _id: false })

const blacklistSchema = new mongoose.Schema<BlacklistData>({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  tournaments: {
    type: blacklistEntrySchema,
    default: null
  },
  economy: {
    type: blacklistEntrySchema,
    default: null
  }
})

export type BlacklistDocument = mongoose.HydratedDocument<BlacklistData>

export default mongoose.model<BlacklistData>('Blacklist', blacklistSchema)
import mongoose from 'mongoose'
import type { UserData } from '@/types/user'

const userSchema = new mongoose.Schema<UserData>({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  brawlId: {
    type: String,
    default: null
  },
  playerName: {
    type: String,
    default: null
  },
  trophies: {
    type: Number,
    default: null
  },
  victories: {
    type: Number,
    default: null
  },
  clubTag: {
    type: String,
    default: null
  },
  clubName: {
    type: String,
    default: null
  },
  clubRank: {
    type: String,
    default: null
  },
  rankedPoints: {
    type: Number,
    default: null
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  lastCheckedAt: {
    type: Date,
    default: null
  }
})

userSchema.index(
  { brawlId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      brawlId: { $type: 'string' }
    }
  }
)

export type UserDocument = mongoose.HydratedDocument<UserData>

export default mongoose.model<UserData>('User', userSchema)
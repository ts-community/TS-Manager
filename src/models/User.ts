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
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
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
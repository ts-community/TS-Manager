import mongoose from 'mongoose'

export type BumpService = 'disboard' | 'discadia'

export interface BumpConfig {
  service: BumpService
  lastBumperId: string
  channelId: string
  bumpTime: Date
  notified: boolean
}

const bumpSchema = new mongoose.Schema<BumpConfig>({
  service: { type: String, enum: ['disboard', 'discadia'], required: true, unique: true },
  lastBumperId: { type: String, required: true },
  channelId: { type: String, required: true },
  bumpTime: { type: Date, required: true },
  notified: { type: Boolean, default: false }
})

export type BumpDocument = mongoose.HydratedDocument<BumpConfig>
export default mongoose.model('Bump', bumpSchema)

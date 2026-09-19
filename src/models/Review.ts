import mongoose from 'mongoose'

export interface ReviewConfig {
  guildId: string
  channelId: string
  userId: string
  service: 'discord' | 'web'
  rating: number
  comment?: string
  createdAt: Date
}

const reviewSchema = new mongoose.Schema<ReviewConfig>({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  service: { type: String, enum: ['discord', 'web'], required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now, required: true }
})

reviewSchema.index({ guildId: 1, createdAt: -1 })

export type ReviewDocument = mongoose.HydratedDocument<ReviewConfig>
export default mongoose.model('Review', reviewSchema)

import mongoose from 'mongoose'

export type TicketStatus = 'open' | 'closed'

export interface TicketConfig {
  guildId: string
  channelId: string
  userId: string
  service: 'discord' | 'web'
  status: TicketStatus
  createdAt: Date
  closedAt?: Date
  closedBy?: string
}

const ticketSchema = new mongoose.Schema<TicketConfig>({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  service: { type: String, enum: ['discord', 'web'], required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', required: true },
  createdAt: { type: Date, default: Date.now, required: true },
  closedAt: { type: Date },
  closedBy: { type: String }
})

ticketSchema.index({ guildId: 1, userId: 1, status: 1 })

export type TicketDocument = mongoose.HydratedDocument<TicketConfig>
export default mongoose.model('Ticket', ticketSchema)

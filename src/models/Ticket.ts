import mongoose from 'mongoose'

export type TicketStatus = 'solicitado' | 'en_curso' | 'en_revision' | 'entregado' | 'cerrado'

export interface TicketConfig {
  guildId: string
  channelId: string
  userId: string
  service: 'discord' | 'web'
  status: TicketStatus
  number: number
  welcomeMessageId?: string
  agreedPrice?: string
  agreedDeadline?: string
  createdAt: Date
  startedAt?: Date
  deliveredAt?: Date
  closedAt?: Date
  closedBy?: string
}

const ticketSchema = new mongoose.Schema<TicketConfig>({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  service: { type: String, enum: ['discord', 'web'], required: true },
  status: {
    type: String,
    enum: ['solicitado', 'en_curso', 'en_revision', 'entregado', 'cerrado'],
    default: 'solicitado',
    required: true
  },
  number: { type: Number, required: true },
  welcomeMessageId: { type: String },
  agreedPrice: { type: String },
  agreedDeadline: { type: String },
  createdAt: { type: Date, default: Date.now, required: true },
  startedAt: { type: Date },
  deliveredAt: { type: Date },
  closedAt: { type: Date },
  closedBy: { type: String }
})

ticketSchema.index({ guildId: 1, userId: 1, status: 1 })

export type TicketDocument = mongoose.HydratedDocument<TicketConfig>
export default mongoose.model('Ticket', ticketSchema)

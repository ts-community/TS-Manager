import mongoose from 'mongoose'

export interface TeamEntry {
  guildId: string
  name: string
  captainId: string
  /** 3 titulares (el capitán incluido) */
  starters: string[]
  /** 2 suplentes */
  subs: string[]
  /** Titulares + suplentes, para comprobar que nadie está en dos equipos */
  players: string[]
  createdAt: Date
}

const teamSchema = new mongoose.Schema<TeamEntry>({
  guildId: { type: String, required: true },
  name: { type: String, required: true },
  captainId: { type: String, required: true },
  starters: { type: [String], required: true },
  subs: { type: [String], required: true },
  players: { type: [String], required: true },
  createdAt: { type: Date, default: Date.now }
})

teamSchema.index({ guildId: 1, players: 1 })
teamSchema.index({ guildId: 1, name: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } })

export default mongoose.model('Team', teamSchema)

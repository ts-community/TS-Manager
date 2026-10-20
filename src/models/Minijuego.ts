import mongoose from 'mongoose'

export interface MinijuegoData {
  threadId: string
  participants: string[]
}

const minijuegoSchema = new mongoose.Schema<MinijuegoData>({
  threadId: { type: String, required: true, unique: true },
  participants: { type: [String], default: [] }
})

export type MinijuegoDocument = mongoose.HydratedDocument<MinijuegoData>
export default mongoose.model('Minijuego', minijuegoSchema)

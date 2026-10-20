import mongoose from 'mongoose'

export interface AsociacionConfig {
  servidor: string
  representanteId: string | null
  renovacionDias: number
  canalId: string
  lastRenovationDate: Date
  nextRenovationDate: Date
  renovacionAvisada: boolean
  staffEncargadoId: string | null
  createdAt: Date
}

const asociacionSchema = new mongoose.Schema<AsociacionConfig>({
  // Nombre para mostrar, con las mayúsculas correctas (ej: "El Sótano Oficial")
  servidor: { type: String, required: true, unique: true },
  representanteId: { type: String, required: false, default: null },
  renovacionDias: { type: Number, required: true },
  canalId: { type: String, required: true },
  lastRenovationDate: { type: Date, default: Date.now },
  nextRenovationDate: { type: Date, required: true },
  renovacionAvisada: { type: Boolean, default: false },
  staffEncargadoId: { type: String, required: false, default: null },
  createdAt: { type: Date, default: Date.now }
})

export type AsociacionDocument = mongoose.HydratedDocument<AsociacionConfig>
export default mongoose.model('Asociacion', asociacionSchema)

import mongoose from 'mongoose'

export interface StaffPanelEntry {
  staffId: string
  channelId: string
  messageIds: string[]
}

export interface AsociacionesPanelConfig {
  key: string
  // Canal por cada staff que tenga asociaciones asignadas (y "sin-asignar" si hay canales sueltos)
  staffChannels: StaffPanelEntry[]
}

const panelSchema = new mongoose.Schema<AsociacionesPanelConfig>({
  key: { type: String, required: true, unique: true },
  staffChannels: [{
    staffId: String,
    channelId: String,
    messageIds: [String]
  }]
})

export const PANEL_KEY = 'principal'
export type AsociacionesPanelDocument = mongoose.HydratedDocument<AsociacionesPanelConfig>
export default mongoose.model('AsociacionesPanel', panelSchema)

import mongoose from 'mongoose'

export interface StaffPanelEntry {
  staffId: string
  channelId: string
  messageIds: string[]
}

export interface AsociacionesPanelConfig {
  key: string
  // Mensajes "en vivo" del hilo de asociaciones (se re-renderizan en cada cambio)
  liveMessageIds: string[]
  // Canal privado para el staff, con una sección por staff y sus asociaciones
  staffPanelChannelId: string
  staffPanelMessageIds: string[]
  // Canal por cada staff que tenga asociaciones
  staffChannels: StaffPanelEntry[]
}

const panelSchema = new mongoose.Schema<AsociacionesPanelConfig>({
  key: { type: String, required: true, unique: true },
  liveMessageIds: { type: [String], default: [] },
  staffPanelChannelId: { type: String, default: null },
  staffPanelMessageIds: { type: [String], default: [] },
  staffChannels: [{
    staffId: String,
    channelId: String,
    messageIds: [String]
  }]
})

export const PANEL_KEY = 'principal'
export type AsociacionesPanelDocument = mongoose.HydratedDocument<AsociacionesPanelConfig>
export default mongoose.model('AsociacionesPanel', panelSchema)

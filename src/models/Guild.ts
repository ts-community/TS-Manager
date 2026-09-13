import mongoose from 'mongoose'

export interface PurgeChannelConfig {
  channelId: string
  intervalMinutes: number
}

export interface GuildConfig {
  guildId: string
  staffRoleIds: string[]
  clubTags: string[]
  purgeChannels: PurgeChannelConfig[]
  starboardThreshold: number
}

const purgeChannelSchema = new mongoose.Schema<PurgeChannelConfig>({
  channelId: { type: String, required: true },
  intervalMinutes: { type: Number, required: true }
}, { _id: false })

const guildSchema = new mongoose.Schema<GuildConfig>({
  guildId: { type: String, required: true, unique: true },
  staffRoleIds: { type: [String], default: [] },
  clubTags: { type: [String], default: [] },
  purgeChannels: { type: [purgeChannelSchema], default: [] },
  starboardThreshold: { type: Number, default: 3 }
})

export type GuildDocument = mongoose.HydratedDocument<GuildConfig>
export default mongoose.model('Guild', guildSchema)
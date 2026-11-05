import mongoose from 'mongoose'

export interface PurgeChannelConfig {
  channelId: string
  intervalMinutes: number
}

export interface ClubTagEntry {
  tag: string
  countryCode: string
}

export interface GuildConfig {
  guildId: string
  staffRoleIds: string[]
  clubTags: Array<string | ClubTagEntry>
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
  clubTags: { type: [mongoose.Schema.Types.Mixed], default: [] },
  purgeChannels: { type: [purgeChannelSchema], default: [] },
  starboardThreshold: { type: Number, default: 3 }
})

export type GuildDocument = mongoose.HydratedDocument<GuildConfig>
export default mongoose.model('Guild', guildSchema)
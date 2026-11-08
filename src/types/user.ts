import mongoose from 'mongoose'

export interface UserData {
  discordId: string
  brawlId: string | null
  teamId: mongoose.Types.ObjectId | null
}
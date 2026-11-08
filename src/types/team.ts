import mongoose from 'mongoose'

export type TeamRole = 'leader' | 'member' | 'substitute'

export interface TeamMember {
  userId: mongoose.Types.ObjectId
  role: TeamRole
}

export interface TeamData {
  name: string
  members: TeamMember[]
}
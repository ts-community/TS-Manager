import mongoose from 'mongoose'
import type { TeamRole } from '@/types/team'

export type TournamentStatus = 'open' | 'started' | 'finished' | 'cancelled'

export interface TournamentTeamMember {
  userId: mongoose.Types.ObjectId
  discordId: string
  brawlId: string
  role: TeamRole
}

export interface TournamentTeam {
  teamId: mongoose.Types.ObjectId
  name: string
  members: TournamentTeamMember[]
  registeredAt: Date
}

export interface TournamentData {
  name: string
  startTime: Date
  maxTeams: number
  status: TournamentStatus
  teams: TournamentTeam[]
}
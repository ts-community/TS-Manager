import mongoose from 'mongoose'
import type { TournamentData, TournamentTeam } from '@/types/tournament'

const tournamentTeamMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  discordId: {
    type: String,
    required: true
  },
  brawlId: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['leader', 'member', 'substitute'],
    required: true
  }
}, { _id: false })

const tournamentTeamSchema = new mongoose.Schema({
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  members: {
    type: [tournamentTeamMemberSchema],
    required: true
  },
  registeredAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false })

const tournamentSchema = new mongoose.Schema<TournamentData>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64
  },
  startTime: {
    type: Date,
    required: true
  },
  maxTeams: {
    type: Number,
    required: true,
    enum: [8, 12, 16, 24, 32]
  },
  status: {
    type: String,
    enum: ['open', 'started', 'finished', 'cancelled'],
    default: 'open'
  },
  teams: {
    type: [tournamentTeamSchema],
    default: [],
    validate: {
      validator: (teams: TournamentTeam[]) => {
        const uniqueTeams = new Set(
          teams.map(team => team.teamId.toString())
        )

        return teams.length <= 32 && uniqueTeams.size === teams.length
      },
      message: 'Hay equipos duplicados o se ha superado el máximo de 32 equipos.'
    }
  }
})

export type TournamentDocument = mongoose.HydratedDocument<TournamentData>

export default mongoose.model<TournamentData>('Tournament', tournamentSchema)
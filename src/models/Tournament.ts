import mongoose from 'mongoose'
import type {
  TournamentData,
  TournamentPlayer,
  TournamentTeam
} from '@/types/tournament'

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
    default: ''
  },
  role: {
    type: String,
    enum: ['leader', 'member', 'substitute'],
    required: true
  }
}, { _id: false })

const tournamentPlayerSchema = new mongoose.Schema({
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
    default: ''
  },
  registeredAt: {
    type: Date,
    default: Date.now
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
  mode: {
    type: String,
    enum: ['teams', 'solo'],
    default: 'teams',
    required: true
  },
  maxTeams: {
    type: Number,
    required: true,
    enum: [0, 8, 12, 16, 24, 32]
  },
  maxPlayers: {
    type: Number,
    required: true,
    enum: [0, 8, 12, 16, 24, 32],
    default: 0
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
  },
  players: {
    type: [tournamentPlayerSchema],
    default: [],
    validate: {
      validator: (players: TournamentPlayer[]) => {
        const uniquePlayers = new Set(
          players.map(player => player.userId.toString())
        )

        return players.length <= 32 && uniquePlayers.size === players.length
      },
      message: 'Hay jugadores duplicados o se ha superado el máximo de 32 jugadores.'
    }
  }
})

export type TournamentDocument = mongoose.HydratedDocument<TournamentData>

export default mongoose.model<TournamentData>('Tournament', tournamentSchema)
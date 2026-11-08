import mongoose from 'mongoose'
import type { TeamData, TeamMember } from '@/types/team'

const teamMemberSchema = new mongoose.Schema<TeamMember>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['leader', 'member', 'substitute'],
    required: true
  }
}, { _id: false })

const teamSchema = new mongoose.Schema<TeamData>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32
  },
  members: {
    type: [teamMemberSchema],
    default: [],
    validate: {
      validator: (members: TeamMember[]) => {
        const leaders = members.filter(member => member.role === 'leader').length
        const substitutes = members.filter(member => member.role === 'substitute').length
        const uniqueUsers = new Set(
          members.map(member => member.userId.toString())
        )

        return (
          members.length >= 1 &&
          members.length <= 5 &&
          leaders === 1 &&
          substitutes <= 2 &&
          uniqueUsers.size === members.length
        )
      },
      message: 'El equipo debe tener un líder, máximo 5 integrantes y máximo 2 suplentes.'
    }
  }
})

export type TeamDocument = mongoose.HydratedDocument<TeamData>

export default mongoose.model<TeamData>('Team', teamSchema)

import mongoose from 'mongoose'
import User from '@/models/User'
import Team from '@/models/Team'
import Tournament from '@/models/Tournament'
import type { UserDocument } from '@/models/User'
import { getBrawlPlayer, normalizeBrawlTag } from '@/services/brawlStars'
import { syncTeamSnapshots } from '@/services/team'

export async function getUser(discordId: string) {
  return User.findOne({ discordId })
}

export async function getOrCreateUser(discordId: string): Promise<UserDocument> {
  return User.findOneAndUpdate(
    { discordId },
    {
      $setOnInsert: {
        discordId,
        brawlId: null,
        playerName: null,
        trophies: null,
        victories: null,
        clubTag: null,
        clubName: null,
        clubRank: null,
        rankedPoints: null,
        teamId: null,
        verifiedAt: null,
        lastCheckedAt: null
      }
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  ) as Promise<UserDocument>
}

export async function linkBrawlAccount(discordId: string, tag: string) {
  // Primero validamos el tag con la API oficial.
  const player = await getBrawlPlayer(tag)
  const normalizedTag = normalizeBrawlTag(player.tag || tag)

  const session = await mongoose.startSession()
  let result: {
    user: UserDocument
    player: typeof player
  } | null = null

  try {
    await session.withTransaction(async () => {
      const user = await User.findOneAndUpdate(
        { discordId },
        {
          $set: { brawlId: normalizedTag },
          $setOnInsert: {
            discordId,
            teamId: null
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          session
        }
      ) as UserDocument

      // Si pertenece a un equipo, actualizamos sus copias
      // en todos los torneos que sigan abiertos.
      if (user.teamId) {
        const team = await Team.findById(user.teamId).session(session)

        if (!team) {
          throw new Error('No se ha encontrado el equipo del usuario.')
        }

        await syncTeamSnapshots(team, session)
      } else {
        // Caso defensivo: si existe una inscripción sin equipo
        // asociado, actualizamos directamente sus snapshots.
        const tournaments = await Tournament.find({
          status: 'open',
          'teams.members.userId': user._id
        }).session(session)

        for (const tournament of tournaments) {
          for (const registeredTeam of tournament.teams) {
            const member = registeredTeam.members.find(
              registeredMember => registeredMember.userId.equals(user._id)
            )

            if (member) {
              member.brawlId = normalizedTag
            }
          }

          await tournament.save({ session })
        }
      }

      result = { user, player }
    })

    if (!result) {
      throw new Error('No se ha podido actualizar la cuenta de Brawl Stars.')
    }

    return result
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      throw new Error(
        'Este jugador de Brawl Stars ya está vinculado a otra cuenta.'
      )
    }

    throw error
  } finally {
    await session.endSession()
  }
}

export async function unlinkBrawlAccount(discordId: string) {
  const user = await User.findOne({ discordId })

  if (!user) {
    throw new Error('No se ha encontrado al usuario.')
  }

  // No se puede desvincular si aparece en una inscripción abierta.
  const registered = await Tournament.exists({
    status: 'open',
    'teams.members.userId': user._id
  })

  if (registered) {
    throw new Error(
      'No puedes desvincular tu cuenta de Brawl Stars mientras estés inscrito en un torneo abierto.'
    )
  }

  user.brawlId = null

  await user.save()

  return user
}

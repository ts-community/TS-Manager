import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder
} from 'discord.js'

import type { SelectMenuHandler } from '../../types/interactions'
import Team, { type TeamDocument } from '../../models/Team'
import User, { type UserDocument } from '../../models/User'
import { isBlacklisted } from '../../services/blacklist'
import { addTeamMember, changeMemberRole, removeTeamMember } from '../../services/team'
import { buildTeamView } from '../../services/tournament'
import { isUserVerified } from '../../services/verification'
import logger from '../../utils/logger'

function isValidId(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{24}$/i.test(value))
}

function isLeader(team: TeamDocument, userId: string): boolean {
  return team.members.some(
    member => member.userId.toString() === userId && member.role === 'leader'
  )
}

async function requireLeader(teamId: string, discordId: string): Promise<{ team: TeamDocument; user: UserDocument }> {
  const [team, user] = await Promise.all([
    Team.findById(teamId),
    User.findOne({ discordId })
  ])

  if (!team || !user || !isLeader(team, user._id.toString())) {
    throw new Error('Solo el líder puede gestionar el equipo.')
  }

  return { team, user }
}

function ephemeralView(view: Awaited<ReturnType<typeof buildTeamView>>) {
  return { ...view, flags: view.flags | MessageFlags.Ephemeral }
}

export default {
  customId: 'torneo',

  async execute(interaction) {
    const guild = interaction.guild

    if (!guild) {
      await interaction.reply({ content: 'Esta acción solo está disponible en servidores.', ephemeral: true })
      return
    }

    if (await isBlacklisted(interaction.user.id, 'tournaments')) {
      await interaction.update({
        content: '🚫 Estás en la blacklist de torneos y no puedes participar.',
        components: []
      })
      return
    }

    const [, action, third, fourth] = interaction.customId.split(':')

    if (action === 'add-user') {
      const teamId = isValidId(fourth) ? fourth : isValidId(third) ? third : null

      if (!teamId) {
        await interaction.update({
          content: 'Este selector pertenece a una versión anterior. Vuelve a abrir **Ver Equipo**.',
          components: []
        })
        return
      }

      const role = third === 'substitute' ? 'substitute' : 'member'
      const targetId = interaction.values[0]

      if (!targetId) {
        await interaction.update({ content: 'No se seleccionó ningún usuario.', components: [] })
        return
      }

      await interaction.deferUpdate()

      try {
        await requireLeader(teamId, interaction.user.id)

        const target = await guild.members.fetch(targetId).catch(() => null)

        if (!target || target.user.bot) {
          throw new Error('El usuario seleccionado no es válido.')
        }

        if (!(await isUserVerified(guild.id, targetId))) {
          throw new Error(`<@${targetId}> no está verificado.`)
        }

        if (await isBlacklisted(targetId, 'tournaments')) {
          throw new Error(`<@${targetId}> está en la blacklist de torneos.`)
        }

        const team = await addTeamMember(teamId, interaction.user.id, targetId, role)

        if (!team) throw new Error('No se pudo añadir al usuario.')

        const view = await buildTeamView(team, interaction.user.id, guild.id)
        await interaction.editReply({ content: `✅ <@${targetId}> añadido al equipo.`, components: [] })
        await interaction.followUp(ephemeralView(view))
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo añadir al usuario.'}`,
          components: []
        })
      }

      return
    }

    if (action === 'remove' || action === 'promote' || action === 'role') {
      if (!isValidId(third)) {
        await interaction.update({
          content: 'Este selector pertenece a una versión anterior. Vuelve a abrir **Ver Equipo**.',
          components: []
        })
        return
      }

      await interaction.deferUpdate()

      const teamId = third

      try {
        await requireLeader(teamId, interaction.user.id)

        if (action === 'remove') {
          const targetId = interaction.values[0]

          if (!targetId) throw new Error('No se seleccionó ningún miembro.')

          try {
            const team = await removeTeamMember(teamId, interaction.user.id, targetId)

            if (!team) throw new Error('No se pudo expulsar al miembro.')

            const view = await buildTeamView(team, interaction.user.id, guild.id)
            await interaction.editReply({ content: '✅ Miembro expulsado del equipo.', components: [] })
            await interaction.followUp(ephemeralView(view))
          } catch (error) {
            if (error instanceof Error && error.message.startsWith('PROMOTION_REQUIRED:')) {
              const ids = error.message.slice('PROMOTION_REQUIRED:'.length).split(',').filter(isValidId)
              const users = await User.find({ _id: { $in: ids } })
              const options = users.map(user => ({
                label: user.playerName ?? user.discordId,
                description: `Debe ascender a titular · #${user.brawlId ?? 'sin tag'}`,
                value: user._id.toString()
              }))

              if (!options.length) throw new Error('No se encontraron suplentes para ascender.')

              const select = new StringSelectMenuBuilder()
                .setCustomId(`torneo:promote:${teamId}:${targetId}`)
                .setPlaceholder('Elige el suplente que sube a titular')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(options)

              await interaction.editReply({
                content: 'Hay varios suplentes. Elige cuál asciende a titular antes de expulsar:',
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)]
              })
              return
            }

            throw error
          }

          return
        }

        if (action === 'promote') {
          const targetDiscordId = fourth
          const promoteUserId = interaction.values[0]

          if (!targetDiscordId || !isValidId(promoteUserId)) {
            throw new Error('No se pudo identificar al miembro que se quiere expulsar.')
          }

          const team = await removeTeamMember(
            teamId,
            interaction.user.id,
            targetDiscordId,
            promoteUserId
          )

          if (!team) throw new Error('No se pudo expulsar al miembro.')

          const view = await buildTeamView(team, interaction.user.id, guild.id)
          await interaction.editReply({ content: '✅ Miembro expulsado y suplente ascendido.', components: [] })
          await interaction.followUp(ephemeralView(view))
          return
        }

        const [targetDiscordId, newRole] = interaction.values[0]?.split('|') ?? []

        if (!targetDiscordId || (newRole !== 'member' && newRole !== 'substitute')) {
          throw new Error('No se pudo identificar el cambio de rol.')
        }

        const team = await changeMemberRole(teamId, interaction.user.id, targetDiscordId, newRole)

        if (!team) throw new Error('No se pudo cambiar el rol del miembro.')

        const view = await buildTeamView(team, interaction.user.id, guild.id)
        await interaction.editReply({
          content: `✅ <@${targetDiscordId}> ahora es **${newRole === 'member' ? 'titular' : 'suplente'}**.`,
          components: []
        })
        await interaction.followUp(ephemeralView(view))
      } catch (error) {
        logger.warn('No se pudo gestionar un miembro del equipo', {
          user: interaction.user.id,
          action,
          reason: error instanceof Error ? error.message : 'Unknown error'
        })

        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo gestionar el miembro.'}`,
          components: []
        })
      }
    }
  }
} satisfies SelectMenuHandler
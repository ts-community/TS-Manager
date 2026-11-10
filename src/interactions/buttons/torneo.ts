import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} from 'discord.js'

import type { ButtonHandler } from '../../types/interactions'
import Team from '../../models/Team'
import User from '../../models/User'
import { isBlacklisted } from '../../services/blacklist'
import { getUserTeam } from '../../services/team'
import { getActiveTournament, registerTeam } from '../../services/tournament'
import { buildTeamView } from '../../services/tournament'
import { isUserVerified } from '../../services/verification'

function createTeamRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('torneo:crear-equipo')
      .setLabel('Crear Equipo')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Primary)
  )
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
      await interaction.reply({
        content: '🚫 Estás en la blacklist de torneos y no puedes participar.',
        ephemeral: true
      })
      return
    }

    const [, action, third, fourth] = interaction.customId.split(':')
    const teamId = action === 'add' ? fourth : third

    if (action === 'inscribirse') {
      await interaction.deferReply({ ephemeral: true })

      try {
        const tournament = await getActiveTournament()

        if (!tournament) {
          await interaction.editReply({ content: 'No hay ningún torneo abierto ahora mismo.' })
          return
        }

        if (tournament.teams.length >= tournament.maxTeams) {
          await interaction.editReply({ content: 'El torneo ya está completo.' })
          return
        }

        const team = await getUserTeam(interaction.user.id)

        if (!team) {
          await interaction.editReply({
            content: 'No tienes un equipo. Crea uno para poder inscribirte.',
            components: [createTeamRow()]
          })
          return
        }

        const user = await User.findOne({ discordId: interaction.user.id })
        const isLeader = Boolean(
          user &&
            team.members.some(
              member => member.userId.equals(user._id) && member.role === 'leader'
            )
        )

        if (!isLeader) {
          await interaction.editReply({ content: 'Solo el líder del equipo puede inscribirlo.' })
          return
        }

        const activeMembers = team.members.filter(
          member => member.role !== 'substitute'
        ).length

        if (activeMembers < 3) {
          await interaction.editReply({
            content: 'Tu equipo necesita al menos 3 titulares para inscribirse.'
          })
          return
        }

        const members = await User.find({
          _id: { $in: team.members.map(member => member.userId) }
        })

        const problems: string[] = []

        for (const member of team.members) {
          const record = members.find(item => item._id.equals(member.userId))

          if (!record) {
            problems.push('Hay un integrante que ya no existe en la base de datos.')
            continue
          }

          if (!(await isUserVerified(guild.id, record.discordId))) {
            problems.push(`<@${record.discordId}> no está verificado.`)
            continue
          }

          if (await isBlacklisted(record.discordId, 'tournaments')) {
            problems.push(`<@${record.discordId}> está en la blacklist de torneos.`)
          }
        }

        if (problems.length) {
          await interaction.editReply({
            content: ['No se puede inscribir al equipo:', ...problems.map(problem => `• ${problem}`)].join('\n'),
            allowedMentions: { parse: [] }
          })
          return
        }

        const updated = await registerTeam(
          tournament._id.toString(),
          team._id.toString(),
          interaction.user.id
        )

        await interaction.editReply({
          content: `✅ **${team.name}** inscrito en **${updated?.name ?? tournament.name}** (${updated?.teams.length ?? tournament.teams.length}/${updated?.maxTeams ?? tournament.maxTeams}).`
        })
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo inscribir al equipo.'}`
        })
      }

      return
    }

    if (action === 'crear-equipo') {
      if (!(await isUserVerified(guild.id, interaction.user.id))) {
        await interaction.reply({
          content: 'Debes verificar tu cuenta de Brawl Stars antes de crear un equipo.',
          ephemeral: true
        })
        return
      }

      const existing = await getUserTeam(interaction.user.id)

      if (existing) {
        await interaction.deferReply({ ephemeral: true })
        const view = await buildTeamView(existing, interaction.user.id, guild.id)
        await interaction.editReply(view)
        return
      }

      const modal = new ModalBuilder()
        .setCustomId('torneo:create-team')
        .setTitle('Crear equipo')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('nombre')
              .setLabel('Nombre del equipo')
              .setStyle(TextInputStyle.Short)
              .setMinLength(2)
              .setMaxLength(32)
              .setRequired(true)
          )
        )

      await interaction.showModal(modal)
      return
    }

    if (action === 'ver-equipo') {
      const team = await getUserTeam(interaction.user.id)

      if (!team) {
        await interaction.reply({
          content: 'No tienes un equipo. Crea uno para empezar.',
          components: [createTeamRow()],
          ephemeral: true
        })
        return
      }

      await interaction.deferReply({ ephemeral: true })
      const view = await buildTeamView(team, interaction.user.id, guild.id)
      await interaction.editReply(view)
      return
    }

    if (action === 'add') {
      const role = third === 'suplente' ? 'substitute' : 'member'
      const team = await Team.findById(teamId)
      const user = await User.findOne({ discordId: interaction.user.id })

      const isLeader = Boolean(
        team &&
          user &&
          team.members.some(
            member => member.userId.equals(user._id) && member.role === 'leader'
          )
      )

      if (!team || !isLeader) {
        await interaction.reply({ content: 'Solo el líder puede gestionar el equipo.', ephemeral: true })
        return
      }

      if (team.members.length >= 5) {
        await interaction.reply({ content: 'El equipo ya tiene 5 integrantes.', ephemeral: true })
        return
      }

      if (
        role === 'substitute' &&
        team.members.filter(member => member.role === 'substitute').length >= 2
      ) {
        await interaction.reply({ content: 'El equipo ya tiene 2 suplentes.', ephemeral: true })
        return
      }

      const select = new UserSelectMenuBuilder()
        .setCustomId(`torneo:add-user:${role}:${teamId}`)
        .setPlaceholder('Selecciona el usuario que quieres añadir')
        .setMinValues(1)
        .setMaxValues(1)

      await interaction.reply({
        content: 'Selecciona el usuario que quieres añadir al equipo:',
        components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
        ephemeral: true
      })
      return
    }

    if (action === 'rename') {
      const team = await Team.findById(teamId)
      const user = await User.findOne({ discordId: interaction.user.id })

      const isLeader = Boolean(
        team &&
          user &&
          team.members.some(
            member => member.userId.equals(user._id) && member.role === 'leader'
          )
      )

      if (!team || !isLeader) {
        await interaction.reply({ content: 'Solo el líder puede cambiar el nombre del equipo.', ephemeral: true })
        return
      }

      const modal = new ModalBuilder()
        .setCustomId(`torneo:rename:${team._id}`)
        .setTitle('Cambiar nombre del equipo')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('nombre')
              .setLabel('Nuevo nombre')
              .setStyle(TextInputStyle.Short)
              .setValue(team.name)
              .setMinLength(2)
              .setMaxLength(32)
              .setRequired(true)
          )
        )

      await interaction.showModal(modal)
    }
  }
} satisfies ButtonHandler

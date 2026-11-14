import type { ModalHandler } from '../../types/interactions'
import User from '../../models/User'
import { isBlacklisted } from '../../services/blacklist'
import { addTeamMember, createTeam, deleteTeam, getUserTeam, renameTeam } from '../../services/team'
import { buildTeamView } from '../../services/tournament'
import { isUserVerified } from '../../services/verification'

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

    const [, action, teamId] = interaction.customId.split(':')

    if (action === 'create-team') {
      const name = interaction.fields.getTextInputValue('nombre').trim()

      if (!(await isUserVerified(guild.id, interaction.user.id))) {
        await interaction.reply({
          content: 'Debes verificar tu cuenta de Brawl Stars antes de crear un equipo.',
          ephemeral: true
        })
        return
      }

      const existing = await getUserTeam(interaction.user.id)

      if (existing) {
        await interaction.reply({ content: 'Ya perteneces a un equipo.', ephemeral: true })
        return
      }

      const titulares = interaction.fields.getSelectedUsers('titulares')
      const suplentes = interaction.fields.getSelectedUsers('suplentes')

      const titularIds = [...(titulares?.keys() ?? [])].filter(id => id !== interaction.user.id)
      const suplenteIds = [...(suplentes?.keys() ?? [])].filter(id => id !== interaction.user.id)
      const allIds = [...titularIds, ...suplenteIds]

      if (new Set(allIds).size !== allIds.length) {
        await interaction.reply({
          content: 'No puedes seleccionar al mismo usuario como titular y suplente.',
          ephemeral: true
        })
        return
      }

      if (titularIds.length < 2) {
        await interaction.reply({
          content: 'Necesitas al menos 3 titulares contando contigo. Elige 2 compañeros titulares o más.',
          ephemeral: true
        })
        return
      }

      if (1 + allIds.length > 5) {
        await interaction.reply({
          content: 'Un equipo puede tener como máximo 5 integrantes contando al líder.',
          ephemeral: true
        })
        return
      }

      await interaction.deferReply({ ephemeral: true })

      try {
        const records = await User.find({ discordId: { $in: allIds } })
        const recordMap = new Map(records.map(record => [record.discordId, record]))
        const problems: string[] = []

        for (const id of allIds) {
          const target = await guild.members.fetch(id).catch(() => null)

          if (!target || target.user.bot) {
            problems.push(`<@${id}> no es un miembro válido del servidor.`)
            continue
          }

          if (!(await isUserVerified(guild.id, id))) {
            problems.push(`<@${id}> no está verificado.`)
            continue
          }

          if (await isBlacklisted(id, 'tournaments')) {
            problems.push(`<@${id}> está en la blacklist de torneos.`)
            continue
          }

          if (recordMap.get(id)?.teamId) {
            problems.push(`<@${id}> ya pertenece a otro equipo.`)
          }
        }

        if (problems.length) {
          await interaction.editReply({
            content: ['No se pudo crear el equipo:', ...problems.map(problem => `• ${problem}`)].join('\n'),
            allowedMentions: { parse: [] }
          })
          return
        }

        const team = await createTeam(interaction.user.id, name)

        if (!team) throw new Error('No se pudo crear el equipo.')

        try {
          for (const id of titularIds) {
            const updated = await addTeamMember(team._id.toString(), interaction.user.id, id, 'member')
            if (!updated) throw new Error(`No se pudo añadir a <@${id}> como titular.`)
          }

          for (const id of suplenteIds) {
            const updated = await addTeamMember(team._id.toString(), interaction.user.id, id, 'substitute')
            if (!updated) throw new Error(`No se pudo añadir a <@${id}> como suplente.`)
          }
        } catch (error) {
          await deleteTeam(team._id.toString(), interaction.user.id).catch(() => null)
          throw error
        }

        const created = await getUserTeam(interaction.user.id)

        if (!created) throw new Error('No se pudo recuperar el equipo creado.')

        const view = await buildTeamView(created, interaction.user.id, guild.id)
        await interaction.editReply(view)
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo crear el equipo.'}`
        })
      }

      return
    }

    if (action === 'rename') {
      if (!teamId || !/^[a-f0-9]{24}$/i.test(teamId)) {
        await interaction.reply({
          content: 'Este formulario pertenece a una versión anterior. Vuelve a abrir **Ver Equipo**.',
          ephemeral: true
        })
        return
      }

      const name = interaction.fields.getTextInputValue('nombre').trim()

      await interaction.deferReply({ ephemeral: true })

      try {
        const team = await renameTeam(teamId, interaction.user.id, name)

        if (!team) throw new Error('No se pudo renombrar el equipo.')

        const view = await buildTeamView(team, interaction.user.id, guild.id)
        await interaction.editReply(view)
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo renombrar el equipo.'}`
        })
      }
    }
  }
} satisfies ModalHandler

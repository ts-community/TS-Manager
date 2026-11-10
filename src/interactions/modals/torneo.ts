import type { ModalHandler } from '../../types/interactions'
import { isBlacklisted } from '../../services/blacklist'
import { createTeam, getUserTeam, renameTeam } from '../../services/team'
import { buildTeamView } from '../../services/tournaments'
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

      await interaction.deferReply({ ephemeral: true })

      try {
        const team = await createTeam(interaction.user.id, name)

        if (!team) throw new Error('No se pudo crear el equipo.')

        const view = await buildTeamView(team, interaction.user.id, guild.id)
        await interaction.editReply(view)
      } catch (error) {
        await interaction.editReply({
          content: `❌ ${error instanceof Error ? error.message : 'No se pudo crear el equipo.'}`
        })
      }

      return
    }

    if (action === 'rename') {
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

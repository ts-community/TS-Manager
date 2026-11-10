import type { SelectMenuHandler } from '../../types/interactions'
import { isBlacklisted } from '../../services/blacklist'
import { addTeamMember } from '../../services/team'
import { buildTeamView } from '../../services/tournaments'
import { isUserVerified } from '../../services/verification'
import logger from '../../utils/logger'

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

    const [, action, role, teamId] = interaction.customId.split(':')

    if (action !== 'add-user') return

    const targetId = interaction.values[0]

    if (!targetId) {
      await interaction.update({ content: 'No se seleccionó ningún usuario.', components: [] })
      return
    }

    await interaction.deferUpdate()

    try {
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

      const teamRole = role === 'substitute' ? 'substitute' : 'member'

      const team = await addTeamMember(
        teamId,
        interaction.user.id,
        targetId,
        teamRole
      )

      if (!team) throw new Error('No se pudo añadir al usuario.')

      const view = await buildTeamView(team, interaction.user.id, guild.id)
      await interaction.editReply(view)
    } catch (error) {
      logger.warn('No se pudo añadir un miembro al equipo', {
        user: interaction.user.id,
        target: targetId,
        reason: error instanceof Error ? error.message : 'Unknown error'
      })

      await interaction.editReply({
        content: `❌ ${error instanceof Error ? error.message : 'No se pudo añadir al usuario.'}`,
        components: []
      })
    }
  }
} satisfies SelectMenuHandler

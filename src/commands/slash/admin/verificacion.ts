import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import {
  buildResultEmbed,
  buildVerificationSummary,
  publishVerificationPanel,
  reverifyAllMembers,
  unverifyMember,
  verifyMember
} from '../../../services/verification'
import logger from '../../../utils/logger'

export default {
  data: new SlashCommandBuilder()
    .setName('verificacion')
    .setDescription('Resumen, publicar panel, re-verificar, cambiar tag o desverificar')
    .addStringOption(opt =>
      opt
        .setName('accion')
        .setDescription('Qué hacer')
        .setRequired(false)
        .addChoices(
          { name: 'resumen', value: 'resumen' },
          { name: 'panel', value: 'panel' },
          { name: 'revisar', value: 'revisar' },
          { name: 'cambiar-tag', value: 'cambiar-tag' },
          { name: 'desverificar', value: 'desverificar' }
        )
    )
    .addUserOption(opt =>
      opt
        .setName('usuario')
        .setDescription('Miembro al que aplicar cambiar-tag o desverificar')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt
        .setName('tag')
        .setDescription('Nuevo tag de Brawl Stars (solo cambiar-tag), ej. #2ABC123')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guild = interaction.guild

    if (!guild) {
      await interaction.reply({ content: 'Este comando solo puede ser usado en servidores.', ephemeral: true })
      return
    }

    const accion = interaction.options.getString('accion', false) ?? 'resumen'

    if (accion === 'resumen') {
      await interaction.deferReply()

      try {
        const embed = await buildVerificationSummary(guild)
        await interaction.editReply({ embeds: [embed] })
      } catch (error) {
        logger.error('No se pudo generar el resumen de verificación', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({ content: 'No se pudo generar el resumen de verificación.' })
      }

      return
    }

    if (accion === 'panel') {
      await interaction.deferReply({ ephemeral: true })

      try {
        await publishVerificationPanel(interaction.client)
        await interaction.editReply({ content: 'Panel de verificación publicado/actualizado.' })
      } catch (error) {
        logger.error('No se pudo publicar el panel de verificación', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({ content: 'No se pudo publicar el panel. Revisa los permisos del bot.' })
      }

      return
    }

    if (accion === 'revisar') {
      await interaction.deferReply({ ephemeral: true })

      void reverifyAllMembers(interaction.client).catch((error: unknown) => {
        logger.error('Fallo en la re-verificación manual', {
          reason: error instanceof Error ? error.message : String(error)
        })
      })

      await interaction.editReply({ content: 'Re-verificación iniciada en segundo plano. Los roles se irán actualizando.' })
      return
    }

    if (accion === 'cambiar-tag') {
      const user = interaction.options.getUser('usuario')
      const tag = interaction.options.getString('tag', false)

      if (!user) {
        await interaction.reply({ content: 'Indica el `usuario` al que cambiarle el tag.', ephemeral: true })
        return
      }

      if (!tag?.trim()) {
        await interaction.reply({ content: 'Indica el nuevo `tag` de Brawl Stars.', ephemeral: true })
        return
      }

      const member = await guild.members.fetch(user.id).catch(() => null)

      if (!member) {
        await interaction.reply({ content: 'Ese usuario no está en el servidor.', ephemeral: true })
        return
      }

      await interaction.deferReply({ ephemeral: true })

      try {
        const result = await verifyMember(guild, member, tag, interaction.user.id)

        if (!result.ok) {
          await interaction.editReply({ content: result.message })
          return
        }

        await interaction.editReply({ embeds: [buildResultEmbed(result)] })
      } catch (error) {
        logger.error('No se pudo cambiar el tag de un miembro', {
          user: member.id,
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply({ content: 'No se pudo cambiar el tag. Inténtalo de nuevo.' })
      }

      return
    }

    const user = interaction.options.getUser('usuario')

    if (!user) {
      await interaction.reply({ content: 'Indica el `usuario` a desverificar.', ephemeral: true })
      return
    }

    const member = await guild.members.fetch(user.id).catch(() => null)

    if (!member) {
      await interaction.reply({ content: 'Ese usuario no está en el servidor.', ephemeral: true })
      return
    }

    await interaction.deferReply({ ephemeral: true })

    try {
      const { hadRecord } = await unverifyMember(guild, member, interaction.user.id)
      const prefix = hadRecord
        ? `Se eliminó la cuenta vinculada de ${member} y`
        : `${member} no tenía ninguna cuenta vinculada y`

      await interaction.editReply({ content: `${prefix} se le aplicó el rol de no verificado.` })
    } catch (error) {
      logger.error('No se pudo desverificar a un miembro', {
        user: member.id,
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
      await interaction.editReply({ content: 'No se pudo desverificar al miembro. Revisa los permisos del bot.' })
    }
  }
} satisfies SlashCommand

import { SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import {
  buildVerificationMessage,
  buildVerificationResultMessage,
  buildVerificationSummary,
  publishVerificationPanel,
  unverifyMember,
  verifyMember
} from '../../../services/verification'
import logger from '../../../utils/logger'

const ACCENT = 0x3b82f6

export default {
  data: new SlashCommandBuilder()
    .setName('verificacion')
    .setDescription('Resumen, publicar panel, cambiar tag o desverificar')
    .addStringOption(opt =>
      opt
        .setName('accion')
        .setDescription('Qué hacer')
        .setRequired(false)
        .addChoices(
          { name: 'resumen', value: 'resumen' },
          { name: 'publicar-panel', value: 'publicar-panel' },
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
        const payload = await buildVerificationSummary(guild)
        await interaction.editReply(payload)
      } catch (error) {
        logger.error('No se pudo generar el resumen de verificación', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply(
          buildVerificationMessage({
            title: '❌ Error',
            description: 'No se pudo generar el resumen de verificación.',
            accent: 0xef4444
          })
        )
      }

      return
    }

    if (accion === 'publicar-panel') {
      await interaction.deferReply({ ephemeral: true })

      try {
        await publishVerificationPanel(interaction.client)
        await interaction.editReply(
          buildVerificationMessage({
            title: '✅ Panel publicado',
            description: 'El panel de verificación se ha **creado o actualizado** correctamente.',
            accent: 0x22c55e
          })
        )
      } catch (error) {
        logger.error('No se pudo publicar el panel de verificación', {
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply(
          buildVerificationMessage({
            title: '❌ No se pudo publicar el panel',
            description: error instanceof Error ? error.message : 'Revisa los permisos del bot.',
            accent: 0xef4444
          })
        )
      }

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
          await interaction.editReply(
            buildVerificationMessage({
              title: '❌ No se pudo verificar',
              description: result.message,
              accent: 0xef4444
            })
          )
          return
        }

        await interaction.editReply(buildVerificationResultMessage(result))
      } catch (error) {
        logger.error('No se pudo cambiar el tag de un miembro', {
          user: member.id,
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
        await interaction.editReply(
          buildVerificationMessage({
            title: '❌ Error',
            description: 'No se pudo cambiar el tag. Inténtalo de nuevo.',
            accent: 0xef4444
          })
        )
      }

      return
    }

    if (accion !== 'desverificar') {
      await interaction.reply({ content: 'Acción no reconocida.', ephemeral: true })
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
      const { hadRecord, previousTag, previousName } = await unverifyMember(guild, member, interaction.user.id)
      const details = [
        `**👤 Usuario:** <@${member.id}>`,
        `**🏷️ Estado:** Se le aplicó el rol de **no verificado**.`
      ]

      if (previousTag) {
        details.push(
          `**🎮 Cuenta desvinculada:** **${previousName ?? 'Desconocido'}** \`#${previousTag}\``
        )
      }

      if (interaction.user.id !== member.id) {
        details.push(`**🛡️ Acción por:** <@${interaction.user.id}>`)
      }

      await interaction.editReply(
        buildVerificationMessage({
          title: '🔓 Usuario desverificado',
          description: hadRecord
            ? 'Su cuenta de Brawl Stars ya no está vinculada y sus roles se han retirado.'
            : 'No tenía una cuenta vinculada, pero se le aplicó el estado de no verificado.',
          details,
          accent: hadRecord ? 0xf59e0b : ACCENT
        })
      )
    } catch (error) {
      logger.error('No se pudo desverificar a un miembro', {
        user: member.id,
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
      await interaction.editReply(
        buildVerificationMessage({
          title: '❌ Error',
          description: 'No se pudo desverificar al miembro. Revisa los permisos del bot.',
          accent: 0xef4444
        })
      )
    }
  }
} satisfies SlashCommand

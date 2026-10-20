import { EmbedBuilder, SlashCommandBuilder } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import logger from '../../../utils/logger'

const SIN_VERIFICAR_ROLE_ID = '1107578731918274600'
const VERIFICADO_ROLE_ID = '1102603911157797006'

const BATCH_UPDATE = 5

function buildProgressEmbed(cleaned: number, total: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setDescription(
      total > 0
        ? cleaned >= total
          ? `🧹 Limpiados **${cleaned}/${total}** miembros\n✅ Terminado`
          : `🧹 Limpiando... **${cleaned}/${total}** miembros`
        : 'No hay miembros con el rol de verificado que también tengan el rol de sin verificar. Nada que limpiar.'
    )

  if (total === 0 || cleaned >= total) {
    embed.setColor('Green')
  } else {
    embed.setColor('Yellow')
  }

  return embed
}

export default {
  data: new SlashCommandBuilder()
    .setName('sinverificar')
    .setDescription('Quitar el rol de Sin Verificar a los miembros que ya tienen el rol de Verificado'),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.'
      })
    }

    const guild = interaction.guild
    const sinVerificarRole = await guild.roles.fetch(SIN_VERIFICAR_ROLE_ID).catch(() => null)
    if (!sinVerificarRole) {
      return interaction.reply({
        content: 'No encontré el rol <@&1107578731918274600>. Revisa que exista y que el bot lo pueda gestionar.'
      })
    }

    if (!guild.members.me?.permissions.has('ManageRoles')) {
      return interaction.reply({
        content: 'No tengo permiso de **Gestionar roles** para poder quitárselos a los miembros.'
      })
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor('Yellow').setDescription('🕵️ Buscando miembros con el rol de verificado…')]
    })
    const message = await interaction.fetchReply()

    const members = await guild.members.fetch({ withPresences: false })
    const targets = members.filter(
      m =>
        !m.user.bot &&
        m.roles.cache.has(VERIFICADO_ROLE_ID) &&
        m.roles.cache.has(SIN_VERIFICAR_ROLE_ID)
    )

    const total = targets.size
    let cleaned = 0

    if (total === 0) {
      await message.edit({ embeds: [buildProgressEmbed(0, 0)] })
      return
    }

    for (const member of targets.values()) {
      try {
        await member.roles.remove(SIN_VERIFICAR_ROLE_ID, `Limpieza /sinverificar por ${interaction.user.tag}`)
      } catch (error) {
        logger.warn('sinverificar: no se pudo quitar el rol', {
          userId: member.id,
          reason: error instanceof Error ? error.message : String(error)
        })
        continue
      }

      cleaned++
      if (cleaned === total || cleaned % BATCH_UPDATE === 0) {
        await message.edit({ embeds: [buildProgressEmbed(cleaned, total)] }).catch(() => null)
      }
    }

    await message.edit({ embeds: [buildProgressEmbed(cleaned, total)] }).catch(() => null)
  }
} satisfies SlashCommand

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js'

import type { SlashCommand } from '../../../types/commands'

import Blacklist from '@/models/Blacklist'
import EconomyBlacklist from '@/models/EconomyBlacklist'

import type { BlacklistEntry } from '@/types/blacklist'

import logger from '@/utils/logger'

export default {
  data: new SlashCommandBuilder()
    .setName('migrarblacklist')
    .setDescription('Migra la antigua blacklist de economía'),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede utilizarse en servidores.'
      })
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'No tienes permisos para realizar esta migración.'
      })
    }

    try {
      await interaction.deferReply()

      const oldEntries = await EconomyBlacklist.find()

      let migrated = 0
      let preserved = 0

      for (const oldEntry of oldEntries) {
        const discordId = oldEntry.userId

        const createdAt = oldEntry.createdAt ?? new Date()

        const durationDays = oldEntry.expiresAt
          ? Math.max(
              0,
              Math.ceil(
                (oldEntry.expiresAt.getTime() - createdAt.getTime()) /
                  (24 * 60 * 60 * 1000)
              )
            )
          : null

        const entry: BlacklistEntry = {
          addedBy: oldEntry.moderatorId,
          reason: oldEntry.reason,
          durationDays,
          createdAt,
          expiresAt: oldEntry.expiresAt
        }

        let blacklist = await Blacklist.findOne({ discordId })

        if (!blacklist) {
          blacklist = new Blacklist({ discordId })
        }

        const currentEntry = blacklist.economy

        // Si la entrada nueva es igual o más reciente, se conserva.
        if (
          currentEntry &&
          currentEntry.createdAt.getTime() >= entry.createdAt.getTime()
        ) {
          preserved++
        } else {
          blacklist.set('economy', entry)

          await blacklist.save()

          migrated++
        }

        // Se elimina el documento antiguo solo después de asegurar
        // que la entrada está guardada o que ya existe una más reciente.
        await EconomyBlacklist.deleteOne({
          _id: oldEntry._id
        })
      }

      logger.info('Migración de blacklist completada', {
        migrated,
        preserved,
        processed: oldEntries.length
      })

      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('Migración de blacklist completada')
        .setDescription(
          'Se han procesado las entradas de la antigua base de datos.'
        )
        .addFields(
          {
            name: 'Migradas',
            value: String(migrated),
            inline: true
          },
          {
            name: 'Conservadas',
            value: String(preserved),
            inline: true
          },
          {
            name: 'Procesadas',
            value: String(oldEntries.length),
            inline: true
          }
        )
        .setFooter({
          text: 'No se han enviado MD ni se han modificado roles.'
        })
        .setTimestamp()

      return interaction.editReply({
        embeds: [embed]
      })
    } catch (error) {
      logger.error('Error al migrar la blacklist', {
        error: error instanceof Error
          ? error.message
          : 'Unknown error'
      })

      return interaction.editReply({
        content: '❌ No se ha podido completar la migración. No elimines todavía los archivos antiguos.'
      })
    }
  }
} satisfies SlashCommand
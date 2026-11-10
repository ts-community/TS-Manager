import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js'

import type { SlashCommand } from '../../../types/commands'

import {
  BlacklistDuration,
  type BlacklistType
} from '@/types/blacklist'

import {
  addToBlacklist,
  removeFromBlacklist,
  getBlacklist,
  getUserBlacklist,
  formatExpiry,
  isEntryActive
} from '@/services/blacklist'
import { removeUserFromTournamentSystem } from '@/services/tournament'

const CATEGORY_NAMES: Record<BlacklistType, string> = {
  tournaments: 'Torneos',
  economy: 'Economía'
}

const DURATION_OPTIONS = [
  { name: '1 semana', value: String(BlacklistDuration.ONE_WEEK) },
  { name: '2 semanas', value: String(BlacklistDuration.TWO_WEEKS) },
  { name: '1 mes', value: String(BlacklistDuration.ONE_MONTH) },
  { name: '2 meses', value: String(BlacklistDuration.TWO_MONTHS) },
  { name: '3 meses', value: String(BlacklistDuration.THREE_MONTHS) },
  { name: '4 meses', value: String(BlacklistDuration.FOUR_MONTHS) },
  { name: '5 meses', value: String(BlacklistDuration.FIVE_MONTHS) },
  { name: '6 meses', value: String(BlacklistDuration.SIX_MONTHS) },
  { name: '1 año', value: String(BlacklistDuration.ONE_YEAR) },
  { name: 'Permanente', value: 'permanent' }
]

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.name === 'ValidationError' ||
      error.name === 'CastError'
    ) {
      return 'Se ha producido un error al procesar los datos.'
    }

    if (
      error.name === 'MongoServerError' ||
      error.name === 'MongoNetworkError' ||
      error.name === 'MongoNetworkTimeoutError'
    ) {
      return 'No se ha podido acceder a la base de datos. Inténtalo de nuevo.'
    }

    return error.message
  }

  return 'Ha ocurrido un error inesperado al gestionar la blacklist.'
}

export default {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Consulta y gestiona las blacklist')

    .addStringOption(option =>
      option
        .setName('operacion')
        .setDescription('Operación (por defecto: lista)')
        .setRequired(false)
        .addChoices(
          { name: 'Añadir', value: 'añadir' },
          { name: 'Quitar', value: 'quitar' },
          { name: 'Consultar', value: 'consultar' },
          { name: 'Lista', value: 'lista' }
        )
    )

    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario que quieres consultar o gestionar')
        .setRequired(false)
    )

    .addStringOption(option =>
      option
        .setName('categoria')
        .setDescription('Categoría de la blacklist')
        .setRequired(false)
        .addChoices(
          { name: 'Torneos', value: 'tournaments' },
          { name: 'Economía', value: 'economy' }
        )
    )

    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo de la blacklist')
        .setRequired(false)
        .setMaxLength(500)
    )

    .addStringOption(option =>
      option
        .setName('duracion')
        .setDescription('Duración de la blacklist')
        .setRequired(false)
        .addChoices(...DURATION_OPTIONS)
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede utilizarse en servidores.'
      })
    }

    try {
      await interaction.deferReply()

      const guild = interaction.guild
      const operation =
        interaction.options.getString('operacion') ?? 'lista'

      const user = interaction.options.getUser('usuario')

      const category = interaction.options.getString(
        'categoria'
      ) as BlacklistType | null

      // CONSULTAR
      if (operation === 'consultar') {
        const targetId = user?.id ?? interaction.user.id
        const blacklist = await getUserBlacklist(targetId)

        if (
          !blacklist ||
          (!blacklist.tournaments && !blacklist.economy)
        ) {
          return interaction.editReply({
            content: user
              ? `<@${targetId}> no tiene ninguna entrada en la blacklist.`
              : 'No tienes ninguna entrada en la blacklist.',
            allowedMentions: { parse: [] }
          })
        }

        const embed = new EmbedBuilder()
          .setColor('Red')
          .setTitle('Blacklist')
          .setDescription(
            user
              ? `Información de <@${targetId}>.`
              : 'Estas son tus entradas en la blacklist.'
          )

        for (const type of ['tournaments', 'economy'] as const) {
          const entry = blacklist[type]

          if (!entry) {
            embed.addFields({
              name: CATEGORY_NAMES[type],
              value: 'Sin entradas.'
            })

            continue
          }

          embed.addFields({
            name: CATEGORY_NAMES[type],
            value: [
              `**Estado:** ${isEntryActive(entry) ? 'Activa' : 'Expirada'}`,
              `**Motivo:** ${entry.reason}`,
              `**Expira:** ${formatExpiry(entry.expiresAt)}`,
              `**Responsable:** <@${entry.addedBy}>`
            ].join('\n')
          })
        }

        return interaction.editReply({
          embeds: [embed],
          allowedMentions: { parse: [] }
        })
      }

      // AÑADIR
      if (operation === 'añadir') {
        if (!user || !category) {
          return interaction.editReply({
            content: 'Debes indicar un usuario y una categoría.'
          })
        }

        const reason = interaction.options.getString('motivo')
        const durationValue = interaction.options.getString('duracion')

        if (!reason?.trim()) {
          return interaction.editReply({
            content: 'Debes indicar el motivo de la blacklist.'
          })
        }

        if (!durationValue) {
          return interaction.editReply({
            content: 'Debes indicar la duración de la blacklist.'
          })
        }

        if (user.bot) {
          return interaction.editReply({
            content: 'No puedes añadir bots a la blacklist.'
          })
        }

        const durationDays =
          durationValue === 'permanent'
            ? null
            : Number(durationValue) as BlacklistDuration

        const blacklist = await addToBlacklist(
          guild,
          user.id,
          category,
          interaction.user.id,
          reason,
          durationDays
        )

        if (category === 'tournaments') {
          await removeUserFromTournamentSystem(user.id).catch(error => {
            console.warn('[BLACKLIST] No se pudo eliminar el equipo del usuario:', error)
          })
        }

        const entry = blacklist[category]

        if (!entry) {
          throw new Error('No se ha podido recuperar la entrada de blacklist.')
        }

        const embed = new EmbedBuilder()
          .setColor('Red')
          .setTitle(`Blacklist de ${CATEGORY_NAMES[category]}`)
          .setDescription(`<@${user.id}> ha sido añadido a la blacklist.`)
          .addFields(
            { name: 'Motivo', value: entry.reason },
            { name: 'Expira', value: formatExpiry(entry.expiresAt) },
            { name: 'Responsable', value: `<@${entry.addedBy}>` }
          )
          .setTimestamp()

        return interaction.editReply({
          embeds: [embed],
          allowedMentions: { parse: [] }
        })
      }

      // QUITAR
      if (operation === 'quitar') {
        if (!user || !category) {
          return interaction.editReply({
            content: 'Debes indicar un usuario y una categoría.'
          })
        }

        const removed = await removeFromBlacklist(
          guild,
          user.id,
          category
        )

        return interaction.editReply({
          content: removed
            ? `<@${user.id}> ha sido retirado de la blacklist de ${CATEGORY_NAMES[category]}.`
            : `<@${user.id}> no tenía una entrada en la blacklist de ${CATEGORY_NAMES[category]}.`,
          allowedMentions: { parse: [] }
        })
      }

      // LISTA
      if (operation === 'lista') {
        if (!category) {
          return interaction.editReply({
            content: 'Debes indicar la categoría que quieres consultar.'
          })
        }

        const entries = await getBlacklist(category)

        if (!entries.length) {
          return interaction.editReply({
            content: `La blacklist de ${CATEGORY_NAMES[category]} está vacía.`
          })
        }

        const lines: string[] = []

        for (const entry of entries) {
          const blacklistEntry = entry[category]

          if (!blacklistEntry) continue

          const line = [
            `**<@${entry.discordId}>**`,
            `> Motivo: ${blacklistEntry.reason}`,
            `> Expira: ${formatExpiry(blacklistEntry.expiresAt)}`
          ].join('\n')

          if (
            lines.join('\n\n').length + line.length > 4000
          ) {
            break
          }

          lines.push(line)
        }

        const embed = new EmbedBuilder()
          .setColor('Red')
          .setTitle(`Blacklist de ${CATEGORY_NAMES[category]}`)
          .setDescription(lines.join('\n\n'))
          .setFooter({
            text: `Mostrando ${lines.length} de ${entries.length} usuarios`
          })
          .setTimestamp()

        return interaction.editReply({
          embeds: [embed],
          allowedMentions: { parse: [] }
        })
      }

      return interaction.editReply({
        content: 'La operación indicada no es válida.'
      })
    } catch (error) {
      console.error('[BLACKLIST] Error al ejecutar el comando:', error)

      const message = getErrorMessage(error)

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: `❌ ${message}`,
          embeds: []
        })
      }

      return interaction.reply({
        content: `❌ ${message}`
      })
    }
  }
} satisfies SlashCommand
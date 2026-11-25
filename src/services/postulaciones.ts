
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Guild,
  type ModalSubmitInteraction,
  type APIEmbedField,
  type User
} from 'discord.js'
import mongoose from 'mongoose'
import { internalApiKey, tsApiUrl } from '../config/env'
import logger from '../utils/logger'
import { staffRank } from './permissions'

export type PostulacionDecision = 'accept' | 'decline'
export type PostulacionArchiveAction = 'archive' | 'unarchive'

type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'archived'

const MODAL_ID = 'postulacion'
const FIELD_MENSAJE = 'message'
const FIELD_NOTA = 'note'
const SNOWFLAKE = /^\d{17,20}$/

const ACCEPT_URL = 'https://discord.com/channels/1093864130030612521/1096318697053884457'
const DECLINE_URL = 'https://discord.com/channels/1093864130030612521/1096150563667837011'

function isSnowflake(value: string): boolean {
  return SNOWFLAKE.test(value)
}

function formatUser(value: string): string {
  return isSnowflake(value) ? `<@${value}>` : value
}

function encodeUserRef(value: string): string {
  return encodeURIComponent(value).slice(0, 40)
}

function decodeUserRef(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function defaultMessage(
  decision: PostulacionDecision,
  userID: string,
  guildName: string
): string {
  const user = formatUser(userID)

  if (decision === 'accept') {
    return `¡Enhorabuena ${user}, nos complace anunciarte de que tu postulación en **${guildName}** ha sido **aceptada**! Tras revisar tu postulación, hemos reconocido tu potencial y dedicación y estamos seguros de que haras un gran trabajo en la comunidad.`
  }

  return `Lo sentimos ${user}, tu postulación en **${guildName}** ha sido **rechazada**! Si bien valoramos tu interés en unirte a nuestra comunidad, tu solicitud no cumplió con algunas de las expectativas o requisitos que buscamos en este momento. Te animamos a seguir mejorando y, si lo deseas, volver a postularte en el futuro.`
}

function extractApplicationId(interaction: ButtonInteraction): string | null {
  const [, applicationId] = interaction.customId.split(':')
  return applicationId && /^[a-f\d]{24}$/i.test(applicationId)
    ? applicationId
    : null
}

function extractUserId(interaction: ButtonInteraction): string | null {
  const raw = interaction.message.embeds[0]?.fields.find(
    field => field.name === 'Usuario'
  )?.value ?? ''

  const mentionId = raw.match(/<@!?(\d{17,20})>/)?.[1]
  if (mentionId) return mentionId

  const id = raw.replaceAll('<@', '').replaceAll('>', '').replaceAll('!', '').trim()
  return id || null
}

function extractPanelUrl(
  interaction: ButtonInteraction | ModalSubmitInteraction
): string | null {
  const message = interaction.message
  if (!message) return null

  for (const row of message.components) {
    if (row.type !== ComponentType.ActionRow) continue

    for (const component of row.components) {
      if (component.type === ComponentType.Button && component.url) {
        return component.url
      }
    }
  }

  return null
}

function buildReviewFields(
  first: { fields: Array<{ name: string; value: string; inline?: boolean | null }> } | undefined,
  statusLabel: string,
  reviewerId: string | null
): APIEmbedField[] {
  const original: APIEmbedField[] = (first?.fields ?? []).map(field => ({
    name: field.name,
    value: field.value,
    inline: field.inline ?? undefined
  }))
  const puesto = original.find(field => field.name === 'Puesto')
  const kept = original.filter(
    field =>
      field.name !== 'Usuario' &&
      field.name !== 'Estado' &&
      field.name !== 'Puesto' &&
      !field.name.endsWith(' por')
  )

  return [
    {
      name: 'Usuario',
      value: original.find(field => field.name === 'Usuario')?.value ?? 'Usuario desconocido',
      inline: true
    },
    { name: 'Estado', value: statusLabel, inline: true },
    ...(puesto ? [puesto] : []),
    ...(reviewerId ? [{ name: `${statusLabel} por`, value: `<@${reviewerId}>`, inline: true }] : []),
    ...kept
  ]
}

async function resolveDmUser(
  guild: Guild,
  userRef: string,
  client: Client
): Promise<User | null> {
  if (isSnowflake(userRef)) {
    const member =
      guild.members.cache.get(userRef) ??
      (await guild.members.fetch(userRef).catch(() => null))

    return member?.user ?? (await client.users.fetch(userRef).catch(() => null))
  }

  const member =
    guild.members.cache.find(
      candidate =>
        candidate.user.username.toLowerCase() === userRef.toLowerCase() ||
        candidate.displayName.toLowerCase() === userRef.toLowerCase() ||
        candidate.user.tag.toLowerCase() === userRef.toLowerCase()
    ) ??
    (await guild.members.fetch({ query: userRef, limit: 1 }).catch(() => null))?.first() ??
    null

  return member?.user ?? null
}

/** Muestra el modal de gestión de postulación. */
export async function showPostulacionModal(
  interaction: ButtonInteraction,
  decision: PostulacionDecision
): Promise<void> {
  const guild = interaction.guild
  if (!guild) return

  if (!(await staffRank(interaction)).instructor) {
    await interaction.reply({
      content: 'Solo Instructor o superior puede gestionar postulaciones.',
      ephemeral: true
    })
    return
  }

  const userID = extractUserId(interaction)

  if (!userID) {
    await interaction.reply({
      content: 'No se pudo identificar al usuario de la postulación.',
      ephemeral: true
    })
    return
  }

  const applicationId = extractApplicationId(interaction)

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_ID}:${decision}:${applicationId ?? ''}:${encodeUserRef(userID)}`)
    .setTitle('Gestionar postulación')

  const messageInput = new TextInputBuilder()
    .setCustomId(FIELD_MENSAJE)
    .setLabel('Mensaje a enviar')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(defaultMessage(decision, userID, guild.name).slice(0, 4000))
    .setRequired(true)

  const noteInput = new TextInputBuilder()
    .setCustomId(FIELD_NOTA)
    .setLabel('Nota extra')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Nota extra para el usuario')
    .setRequired(false)

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput)
  )

  await interaction.showModal(modal)
}

/**
 * Actualiza el estado de una postulación.
 * expectedStatus evita que una interacción antigua sobrescriba un cambio reciente.
 */
async function syncApplicationStatus(
  applicationId: string | null,
  discordMessageId: string | null,
  status: ApplicationStatus,
  expectedStatus: ApplicationStatus,
  reviewedBy: string,
  actorId: string
): Promise<boolean> {
  if (applicationId && internalApiKey) {
    try {
      const response = await fetch(
        `${tsApiUrl.replace(/\/+$/, '')}/api/panel/applications/${applicationId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': internalApiKey,
            'x-discord-id': actorId
          },
          body: JSON.stringify({
            status,
            expectedStatus,
            reviewedBy
          }),
          signal: AbortSignal.timeout(8000)
        }
      )

      if (response.ok) return true

      // Un conflicto o error de validación no debe saltarse mediante MongoDB.
      if (response.status < 500 && response.status !== 429) {
        logger.warn('La API rechazó el cambio de estado de la postulación', {
          applicationId,
          status: response.status,
          expectedStatus
        })
        return false
      }

      logger.warn('La API no está disponible; se intentará actualizar MongoDB directamente', {
        status: response.status
      })
    } catch (error) {
      logger.error('No se pudo conectar con la API de postulaciones', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  } else if (!internalApiKey) {
    logger.warn('INTERNAL_API_KEY no configurada: se sincronizará directamente en MongoDB')
  }

  // Respaldo: el bot comparte la base de datos con la API.
  try {
    const filter = applicationId && mongoose.isValidObjectId(applicationId)
      ? {
          _id: new mongoose.Types.ObjectId(applicationId),
          status: expectedStatus
        }
      : discordMessageId
        ? {
            discordMessageId,
            status: expectedStatus
          }
        : null

    if (!filter) return false

    const result = await mongoose.connection.collection('applications').updateOne(
      filter,
      {
        $set: {
          status,
          reviewedBy,
          updatedAt: new Date()
        }
      }
    )

    return result.matchedCount > 0
  } catch (error) {
    logger.error('No se pudo sincronizar la postulación en MongoDB', {
      message: error instanceof Error ? error.message : String(error)
    })

    return false
  }
}

/** Archiva o desarchiva una postulación desde Discord (solo staff). */
export async function handlePostulacionArchive(
  interaction: ButtonInteraction,
  action: PostulacionArchiveAction
): Promise<void> {
  if (!(await staffRank(interaction)).instructor) {
    await interaction.reply({
      content: 'Solo Instructor o superior puede archivar o desarchivar postulaciones.',
      ephemeral: true
    })
    return
  }

  const applicationId = extractApplicationId(interaction)

  if (!applicationId) {
    await interaction.reply({
      content: 'No se pudo identificar la postulación.',
      ephemeral: true
    })
    return
  }

  const expectedStatus: ApplicationStatus =
    action === 'archive' ? 'pending' : 'archived'

  const nextStatus: ApplicationStatus =
    action === 'archive' ? 'archived' : 'pending'

  await interaction.deferUpdate()

  const synced = await syncApplicationStatus(
    applicationId,
    interaction.message.id,
    nextStatus,
    expectedStatus,
    nextStatus === 'archived' ? interaction.user.tag : '',
    interaction.user.id
  )

  if (!synced) {
    await interaction.followUp({
      content: action === 'archive'
        ? 'No se pudo archivar la postulación. Puede que ya no esté pendiente.'
        : 'No se pudo desarchivar la postulación. Puede que ya no esté archivada.',
      ephemeral: true
    }).catch(() => null)

    return
  }

  const [first, ...rest] = interaction.message.embeds

  const isArchived = nextStatus === 'archived'
  const label = isArchived ? 'Archivada' : 'Pendiente'
  const fields = buildReviewFields(first, label, isArchived ? interaction.user.id : null)

  const embed = (
    first
      ? EmbedBuilder.from(first)
      : new EmbedBuilder().setTitle('Revisión de la Postulación')
  )
    .setFields(fields)
    .setColor(isArchived ? 0x6b7280 : 0xf59e0b)
    .setTimestamp()

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept:${applicationId}`)
      .setLabel('Aceptar')
      .setStyle(ButtonStyle.Success)
      .setDisabled(nextStatus !== 'pending'),

    new ButtonBuilder()
      .setCustomId(`decline:${applicationId}`)
      .setLabel('Rechazar')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(nextStatus !== 'pending'),

    new ButtonBuilder()
      .setCustomId(`${isArchived ? 'unarchive' : 'archive'}:${applicationId}`)
      .setLabel(isArchived ? 'Desarchivar' : 'Archivar')
      .setStyle(ButtonStyle.Secondary)
  )

  const panelUrl = extractPanelUrl(interaction)

  if (panelUrl) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel('Ver en el panel')
        .setURL(panelUrl)
        .setStyle(ButtonStyle.Link)
    )
  }

  await interaction.message.edit({
    embeds: [embed, ...rest],
    components: [row],
    allowedMentions: { parse: [] }
  }).catch(error => {
    logger.error('No se pudo actualizar el mensaje de la postulación', {
      message: error instanceof Error ? error.message : String(error)
    })
  })

  await interaction.followUp({
    content: isArchived
      ? 'La postulación se ha archivado correctamente.'
      : 'La postulación se ha desarchivado correctamente.',
    ephemeral: true
  }).catch(() => null)
}

/** Procesa el envío del modal: MD al usuario + actualiza el mensaje de revisión. */
export async function handlePostulacionSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!(await staffRank(interaction)).instructor) {
    await interaction.reply({ content: 'Se requiere Instructor o superior.', ephemeral: true })
    return
  }
  const [, decisionRaw, third, fourth] = interaction.customId.split(':')

  const applicationId =
    third && /^[a-f\d]{24}$/i.test(third) ? third : null

  const encodedUserRef = applicationId
    ? fourth
    : third === ''
      ? fourth
      : third

  const userID = decodeUserRef(encodedUserRef ?? '')

  const decision: PostulacionDecision =
    decisionRaw === 'decline' ? 'decline' : 'accept'

  const status = decision === 'accept' ? 'Aceptada' : 'Rechazada'
  const nextStatus: ApplicationStatus =
    decision === 'accept' ? 'accepted' : 'rejected'

  const color = decision === 'accept' ? 'Green' : 'Red'

  try {
    const guild = interaction.guild

    if (!guild || !userID) {
      await interaction.reply({
        content: 'Postulación no válida.',
        ephemeral: true
      })
      return
    }

    await interaction.deferUpdate()

    const author =
      guild.members.cache.get(interaction.user.id) ??
      (await guild.members.fetch(interaction.user.id).catch(() => null))

    const authorName = author?.displayName ?? interaction.user.username
    const authorAvatar = interaction.user.displayAvatarURL({ size: 256 })

    const message = interaction.fields.getTextInputValue(FIELD_MENSAJE)
    const note = interaction.fields.getTextInputValue(FIELD_NOTA)
    const formattedNote = note || '*No se ha añadido ninguna nota.*'
    const userDisplay = formatUser(userID)

    // Solo se puede aceptar o rechazar una postulación pendiente.
    const synced = await syncApplicationStatus(
      applicationId,
      interaction.message?.id ?? null,
      nextStatus,
      'pending',
      authorName,
      interaction.user.id
    )

    if (!synced) {
      await interaction.followUp({
        content: 'No se pudo actualizar la postulación. Puede que ya haya sido gestionada.',
        ephemeral: true
      }).catch(() => null)

      return
    }

    const dmEmbed = new EmbedBuilder()
      .setAuthor({
        name: authorName,
        iconURL: authorAvatar
      })
      .setTitle('Revisión de la Postulación')
      .setDescription(`> ${message}`)
      .addFields({
        name: 'Nota Extra',
        value: `> ${formattedNote}`
      })
      .setFooter({
        text: `Mensaje enviado desde ${guild.name}`,
        iconURL: guild.iconURL() ?? undefined
      })
      .setTimestamp()
      .setColor(color)
      .setThumbnail(guild.iconURL())

    const serverButton = new ButtonBuilder()
      .setLabel('Saltar al Servidor')
      .setURL(decision === 'accept' ? ACCEPT_URL : DECLINE_URL)
      .setStyle(ButtonStyle.Link)

    const dmRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(serverButton)

    let dmFailed = false
    const dmUser = await resolveDmUser(guild, userID, interaction.client)

    if (dmUser) {
      try {
        await dmUser.send({
          content: userDisplay,
          embeds: [dmEmbed],
          components: [dmRow]
        })
      } catch {
        dmFailed = true
      }
    } else {
      dmFailed = true
    }

    const [first, ...rest] = interaction.message?.embeds ?? []
    const fields = buildReviewFields(first, status, interaction.user.id)
    fields[0] = { name: 'Usuario', value: userDisplay, inline: true }

    const postEmbed = (
      first
        ? EmbedBuilder.from(first)
        : new EmbedBuilder().setTitle('Revisión de la Postulación')
    )
      .setFields(fields)
      .setColor(color)

    const disabledRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(applicationId ? `accept:${applicationId}` : 'accept')
          .setLabel('Aceptar')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId(applicationId ? `decline:${applicationId}` : 'decline')
          .setLabel('Rechazar')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      )

    // Las postulaciones aceptadas o rechazadas no se pueden archivar.
    const panelUrl = extractPanelUrl(interaction)

    if (panelUrl) {
      disabledRow.addComponents(
        new ButtonBuilder()
          .setLabel('Ver en el panel')
          .setURL(panelUrl)
          .setStyle(ButtonStyle.Link)
      )
    }

    await interaction.message?.edit({
      embeds: [postEmbed, ...rest],
      components: [disabledRow],
      allowedMentions: {
        users: isSnowflake(userID) ? [userID] : []
      }
    }).catch(error => {
      logger.error('No se pudo actualizar el mensaje de revisión', {
        message: error instanceof Error ? error.message : String(error)
      })
    })

    if (dmFailed) {
      await interaction.followUp({
        content: 'La postulación se ha actualizado, pero no se pudo contactar con el usuario por MD.',
        ephemeral: true
      }).catch(() => null)
    }
  } catch (error) {
    logger.error('Postulación submit failed', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ha ocurrido un error al gestionar la postulación.',
        ephemeral: true
      }).catch(() => null)
    } else {
      await interaction.followUp({
        content: 'Ha ocurrido un error al gestionar la postulación.',
        ephemeral: true
      }).catch(() => null)
    }
  }
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Guild,
  type ModalSubmitInteraction,
  type User
} from 'discord.js'
import { internalApiKey, tsApiUrl } from '../config/env'
import logger from '../utils/logger'

export type PostulacionDecision = 'accept' | 'decline'

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

function defaultMessage(decision: PostulacionDecision, userID: string, guildName: string): string {
  const user = formatUser(userID)
  if (decision === 'accept') {
    return `¡Enhorabuena ${user}, nos complace anunciarte de que tu postulación en **${guildName}** ha sido **aceptada**! Tras revisar tu postulación, hemos reconocido tu potencial y dedicación y estamos seguros de que haras un gran trabajo en la comunidad.`
  }
  return `Lo sentimos ${user}, tu postulación en **${guildName}** ha sido **rechazada**! Si bien valoramos tu interés en unirte a nuestra comunidad, tu solicitud no cumplió con algunas de las expectativas o requisitos que buscamos en este momento. Te animamos a seguir mejorando y, si lo deseas, volver a postularte en el futuro.`
}

function extractApplicationId(interaction: ButtonInteraction): string | null {
  const [, applicationId] = interaction.customId.split(':')
  return applicationId && /^[a-f\d]{24}$/i.test(applicationId) ? applicationId : null
}

function extractUserId(interaction: ButtonInteraction): string | null {
  const raw = interaction.message.embeds[0]?.fields[0]?.value ?? ''
  const mentionId = raw.match(/<@!?(\d{17,20})>/)?.[1]
  if (mentionId) return mentionId

  const id = raw.replaceAll('<@', '').replaceAll('>', '').replaceAll('!', '').trim()
  return id || null
}

async function resolveDmUser(guild: Guild, userRef: string, client: Client): Promise<User | null> {
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

/** Muestra el modal de gestión de postulación (llamado desde accept/decline). */
export async function showPostulacionModal(
  interaction: ButtonInteraction,
  decision: PostulacionDecision
): Promise<void> {
  const guild = interaction.guild
  if (!guild) return

  const userID = extractUserId(interaction)
  if (!userID) {
    await interaction.reply({ content: 'No se pudo identificar al usuario de la postulación.', ephemeral: true })
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

async function syncApplicationStatus(
  applicationId: string | null,
  status: 'accepted' | 'rejected',
  reviewedBy: string
): Promise<boolean> {
  if (!applicationId) return false
  if (!internalApiKey) {
    logger.warn('INTERNAL_API_KEY no configurada: no se sincronizó la postulación')
    return false
  }

  try {
    const response = await fetch(
      `${tsApiUrl.replace(/\/+$/, '')}/api/admin/applications/${applicationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': internalApiKey
        },
        body: JSON.stringify({ status, reviewedBy }),
        signal: AbortSignal.timeout(8000)
      }
    )

    if (!response.ok) throw new Error(`API ${response.status}`)
    return true
  } catch (error) {
    logger.error('No se pudo sincronizar la postulación con la API', {
      message: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

/** Procesa el envío del modal: MD al usuario + actualiza el mensaje de revisión. */
export async function handlePostulacionSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const [, decisionRaw, third, fourth] = interaction.customId.split(':')
  const applicationId = third && /^[a-f\d]{24}$/i.test(third) ? third : null
  const encodedUserRef = applicationId ? fourth : third === '' ? fourth : third
  const userID = decodeUserRef(encodedUserRef ?? '')
  const decision: PostulacionDecision = decisionRaw === 'decline' ? 'decline' : 'accept'
  const status = decision === 'accept' ? 'Aceptada' : 'Rechazada'
  const color = decision === 'accept' ? 'Green' : 'Red'

  try {
    const guild = interaction.guild
    if (!guild || !userID) {
      await interaction.reply({ content: 'Postulación no válida.', ephemeral: true })
      return
    }

    await interaction.deferUpdate()

    const author = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null))
    const authorName = author?.displayName ?? interaction.user.username
    const authorAvatar = interaction.user.displayAvatarURL({ size: 256 })

    const message = interaction.fields.getTextInputValue(FIELD_MENSAJE)
    const note = interaction.fields.getTextInputValue(FIELD_NOTA)
    const formattedNote = note ? note : '*No se ha añadido ninguna nota.*'
    const userDisplay = formatUser(userID)

    const dmEmbed = new EmbedBuilder()
      .setAuthor({ name: authorName, iconURL: authorAvatar })
      .setTitle('Revisión de la Postulación')
      .setDescription(`> ${message}`)
      .addFields({ name: 'Nota Extra', value: `> ${formattedNote}` })
      .setFooter({ text: `Mensaje enviado desde ${guild.name}`, iconURL: guild.iconURL() ?? undefined })
      .setTimestamp()
      .setColor(color)
      .setThumbnail(guild.iconURL())

    const serverButton = new ButtonBuilder()
      .setLabel('Saltar al Servidor')
      .setURL(decision === 'accept' ? ACCEPT_URL : DECLINE_URL)
      .setStyle(ButtonStyle.Link)

    const dmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(serverButton)

    let dmFailed = false
    const dmUser = await resolveDmUser(guild, userID, interaction.client)

    if (dmUser) {
      try {
        await dmUser.send({ content: userDisplay, embeds: [dmEmbed], components: [dmRow] })
      } catch {
        dmFailed = true
      }
    } else {
      dmFailed = true
    }

    // Se conserva el resto del mensaje (puesto y respuestas de las postulaciones de la web)
    const [first, ...rest] = interaction.message?.embeds ?? []
    const keptFields = (first?.fields ?? []).filter(f => f.name !== 'Usuario' && f.name !== 'Estado' && !f.name.endsWith(' por'))
    const postEmbed = (first ? EmbedBuilder.from(first) : new EmbedBuilder().setTitle('Revisión de la Postulación'))
      .setFields(
        { name: 'Usuario', value: userDisplay, inline: true },
        { name: 'Estado', value: status, inline: true },
        { name: `${status} por`, value: `<@${interaction.user.id}>`, inline: true },
        ...keptFields
      )
      .setColor(color)

    const panelUrl = interaction.message?.components
      .flatMap(row => ('components' in row ? (row.components as unknown[]) : []))
      .map(component => (component && typeof component === 'object' && 'url' in component ? (component as { url: string | null }).url : null))
      .find((url): url is string => !!url)

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('accept')
        .setLabel('Aceptar')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('decline')
        .setLabel('Rechazar')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    )
    if (panelUrl) disabledRow.addComponents(new ButtonBuilder().setLabel('Ver en el panel').setURL(panelUrl).setStyle(ButtonStyle.Link))

    await interaction.message?.edit({
      embeds: [postEmbed, ...rest],
      components: [disabledRow],
      allowedMentions: { users: isSnowflake(userID) ? [userID] : [] }
    }).catch(() => null)

    const synced = await syncApplicationStatus(
      applicationId,
      decision === 'accept' ? 'accepted' : 'rejected',
      authorName
    )

    if (dmFailed || !synced) {
      const warnings = [
        dmFailed ? 'no se pudo contactar con el usuario por MD' : null,
        !synced ? 'no se pudo sincronizar el estado con la API' : null
      ].filter(Boolean)

      await interaction.followUp({
        content: `La postulación se actualizó en Discord, pero ${warnings.join(' y ')}.`,
        ephemeral: true
      }).catch(() => null)
    }
  } catch (error) {
    logger.error('Postulación submit failed', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'A ocurrido un error al contactar con el usuario', ephemeral: true }).catch(() => null)
    }
  }
}

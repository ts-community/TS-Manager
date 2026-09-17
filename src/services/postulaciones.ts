import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from 'discord.js'
import logger from '../utils/logger'

export type PostulacionDecision = 'accept' | 'decline'

const MODAL_ID = 'postulacion'
const FIELD_MENSAJE = 'message'
const FIELD_NOTA = 'note'

const ACCEPT_URL = 'https://discord.com/channels/1093864130030612521/1096318697053884457'
const DECLINE_URL = 'https://discord.com/channels/1093864130030612521/1096150563667837011'

function defaultMessage(decision: PostulacionDecision, userID: string, guildName: string): string {
  if (decision === 'accept') {
    return `¡Enhorabuena <@${userID}>, nos complace anunciarte de que tu postulación en **${guildName}** ha sido **aceptada**! Tras revisar tu postulación, hemos reconocido tu potencial y dedicación y estamos seguros de que haras un gran trabajo en la comunidad.`
  }
  return `Lo sentimos <@${userID}>, tu postulación en **${guildName}** ha sido **rechazada**! Si bien valoramos tu interés en unirte a nuestra comunidad, tu solicitud no cumplió con algunas de las expectativas o requisitos que buscamos en este momento. Te animamos a seguir mejorando y, si lo deseas, volver a postularte en el futuro.`
}

function extractUserId(interaction: ButtonInteraction): string | null {
  const raw = interaction.message.embeds[0]?.fields[0]?.value ?? ''
  const id = raw.replaceAll('<@', '').replaceAll('>', '').replaceAll('!', '').trim()
  return id || null
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

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_ID}:${decision}:${userID}`)
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

/** Procesa el envío del modal: MD al usuario + actualiza el mensaje de revisión. */
export async function handlePostulacionSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const [, decisionRaw, userID] = interaction.customId.split(':')
  const decision: PostulacionDecision = decisionRaw === 'decline' ? 'decline' : 'accept'
  const status = decision === 'accept' ? 'Aceptada' : 'Rechazada'
  const color = decision === 'accept' ? 'Green' : 'Red'

  try {
    const guild = interaction.guild
    if (!guild || !userID) {
      await interaction.reply({ content: 'Postulación no válida.', ephemeral: true })
      return
    }

    const member = guild.members.cache.get(userID) ?? (await guild.members.fetch(userID).catch(() => null))
    if (!member) {
      await interaction.reply({ content: 'No se encontró al usuario en el servidor.', ephemeral: true })
      return
    }

    const author = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null))
    const authorName = author?.displayName ?? interaction.user.username
    const authorAvatar = interaction.user.displayAvatarURL({ size: 256 })

    const message = interaction.fields.getTextInputValue(FIELD_MENSAJE)
    const note = interaction.fields.getTextInputValue(FIELD_NOTA)
    const formattedNote = note ? note : '*No se ha añadido ninguna nota.*'

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

    await member.send({ content: `<@${userID}>`, embeds: [dmEmbed], components: [dmRow] })

    const postEmbed = new EmbedBuilder()
      .setTitle('Revisión de la Postulación')
      .addFields(
        { name: 'Usuario', value: `<@${userID}>`, inline: true },
        { name: 'Estado', value: status, inline: true },
        { name: `${status} por`, value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(color)

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

    await interaction.message?.edit({ embeds: [postEmbed], components: [disabledRow] }).catch(() => null)
    await interaction.deferUpdate()
  } catch (error) {
    logger.error('Postulación submit failed', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'A ocurrido un error al contactar con el usuario', ephemeral: true })
    }
  }
}

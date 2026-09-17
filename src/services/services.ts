import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type AnyThreadChannel,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildChannel,
  type StringSelectMenuInteraction
} from 'discord.js'
import Ticket from '../models/Ticket'

export const SERVICES_FORUM_CHANNEL_ID = '1549499940722581524'
export const TICKETS_CHANNEL_ID = '1096144326393864234'
export const TICKET_NOTIFY_ROLE_ID = '1313248021403930715'
const SERVICES_THREAD_NAME = 'Servicios de desarrollo'

type Service = 'discord' | 'web'

const info: Record<Service, string> = {
  discord: [
    '# 🤖 DESARROLLO DE BOTS DE DISCORD PERSONALIZADOS', '',
    'Creamos bots a medida, optimizados, estables y adaptados a tu comunidad, servidor de rol o negocio.', '',
    '## ⚡ Tier Básico — Automatización y utilidad',
    '• Moderación automática, logs y bienvenida interactiva.', '• Comandos de texto y slash commands (/).',
    '• Embeds configurados y verificación por botones o reacciones.', '• Precio orientativo: desde [Tu Precio] €.', '',
    '## 🛠️ Tier Intermedio — Economía, roles y tickets',
    '• Tickets con transcripción HTML/TXT.', '• Economía, tienda de roles, inventario y recompensas.',
    '• SQLite o PostgreSQL, sorteos y minijuegos.', '• Precio orientativo: desde [Tu Precio] €.', '',
    '## 🚀 Tier Avanzado — Sistemas complejos y APIs',
    '• Integración con pagos, paneles externos, IA y servicios de terceros.', '• Dashboard web y arquitectura escalable con sharding.',
    '• Precio: a consultar según especificaciones.', '',
    '## 🖥️ Hosting 24/7', '• Estándar: 1,50 €/mes o 25 € de pago único permanente.',
    '• Alto consumo: 3 €/mes o 50 € de pago único permanente.',
    'Incluye código documentado, base de datos configurada y asistencia inicial.'
  ].join('\n'),
  web: [
    '# 🌐 SERVICIOS DE DESARROLLO WEB & APLICACIONES', '',
    'Sitios web modernos, responsivos y optimizados para potenciar tu marca, proyecto o negocio.', '',
    '## 📄 Landing Page / Portfolio',
    '• Diseño one-page responsive para móviles y tablets.', '• Servicios, sobre nosotros, testimonios y contacto.',
    '• Velocidad de carga y SEO básico.', '• Precio orientativo: desde [Tu Precio] €.', '',
    '## 🏢 Web Corporativa / Multipage',
    '• Inicio, Servicios, Blog, Contacto y FAQ.', '• Panel de administración o CMS.',
    '• Formularios, redes sociales y analíticas.', '• Precio orientativo: desde [Tu Precio] €.', '',
    '## ⚙️ Aplicaciones Web / Paneles a Medida',
    '• Desarrollo full-stack con autenticación y login con Discord.', '• Bases de datos y paneles de gestión.',
    '• Pasarelas de pago como Stripe o PayPal.', '• Precio: a consultar según alcance.', '',
    '## 🖥️ Alojamiento Web & Despliegue',
    '• Estándar: 1,50 €/mes o 25 € de pago único permanente.', '• Alto rendimiento: 3 €/mes o 50 € de pago único permanente.',
    'La cuota permanente depende de la actividad del servicio, estimada en 1–2 años. Si el hosting deja de ofrecerse, se cancelan los cobros y ayudaremos a migrar a tu hosting o Vercel.',
    '• Dominio: 15 € durante 2 años, dependiendo del dominio.', '',
    '## 📦 Entregables & Despliegue', 'Repositorio privado, código fuente, certificados SSL y accesos completos.'
  ].join('\n')
}

function selectRow(customId: string, placeholder: string, options: Array<{ label: string; value: string; description: string }>) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(options.map(option => new StringSelectMenuOptionBuilder()
      .setLabel(option.label).setValue(option.value).setDescription(option.description)))
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
}

function servicesMessage() {
  const intro = new TextDisplayBuilder().setContent([
    '# 🛒 CENTRO DE SERVICIOS', '',
    'Consulta la información del servicio que necesitas y solicita un presupuesto personalizado desde los menús inferiores.', '',
    '## 📜 Condiciones generales',
    '• Anticipo del 50% para comenzar; el resto se liquida tras la demostración funcional.',
    '• El anticipo no es reembolsable una vez iniciado el desarrollo.',
    '• Incluimos 14 días de garantía para bugs del código original.',
    '• Nuevas funciones y cambios estructurales se presupuestan aparte.',
    '• El código fuente se entrega tras completar el pago.', '',
    '⏱️ Proyectos básicos: 2–4 días · Proyectos avanzados: 7–15 días'
  ].join('\n'))

  return {
    flags: MessageFlags.IsComponentsV2 as const,
    components: [new ContainerBuilder()
      .addTextDisplayComponents(intro)
      .addActionRowComponents(selectRow('services-info', 'Consultar información', [
        { label: 'Bot de Discord', value: 'discord', description: 'Características y precios orientativos' },
        { label: 'Desarrollo web', value: 'web', description: 'Webs, aplicaciones y alojamiento' }
      ]))
      .addActionRowComponents(selectRow('services-buy', 'Solicitar presupuesto', [
        { label: 'Comprar bot de Discord', value: 'discord', description: 'Abrir un ticket de contratación' },
        { label: 'Comprar desarrollo web', value: 'web', description: 'Abrir un ticket de contratación' }
      ]))]
  }
}

export async function publishServiceThreads(client: Client): Promise<void> {
  const channel = await client.channels.fetch(SERVICES_FORUM_CHANNEL_ID).catch(() => null)
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error(`El canal ${SERVICES_FORUM_CHANNEL_ID} no existe o el bot no puede verlo`)
  }

  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    const recent = await channel.messages.fetch({ limit: 50 })
    const alreadyPublished = recent.some(message => message.author.id === client.user?.id && message.flags.has(MessageFlags.IsComponentsV2))
    if (!alreadyPublished) await channel.send(servicesMessage())
    return
  }

  const channelType = channel.type as ChannelType
  if (channelType !== ChannelType.GuildForum) {
    throw new Error(`El canal ${SERVICES_FORUM_CHANNEL_ID} debe ser de texto o foro`)
  }
  const forum = channel as unknown as import('discord.js').ForumChannel
  const active = await forum.threads.fetchActive()
  const existing = forum.threads.cache.find(thread => thread.name === SERVICES_THREAD_NAME)
    || active.threads.find(thread => thread.name === SERVICES_THREAD_NAME)
  if (!existing) {
    await forum.threads.create({ name: SERVICES_THREAD_NAME, message: servicesMessage(), reason: 'Publicación del panel unificado de servicios' })
  }
}

async function hasOpenTicket(guild: Guild, userId: string): Promise<GuildChannel | AnyThreadChannel | null> {
  const storedTicket = await Ticket.findOne({ guildId: guild.id, userId, status: 'open' }).lean()
  if (storedTicket) {
    const storedChannel = await guild.channels.fetch(storedTicket.channelId).catch(() => null)
    if (storedChannel) return storedChannel
    await Ticket.updateOne({ _id: storedTicket._id }, { $set: { status: 'closed', closedAt: new Date() } })
  }

  const parent = await guild.channels.fetch(TICKETS_CHANNEL_ID).catch(() => null)
  if (!parent) return null
  if (parent.type === ChannelType.GuildCategory) return parent.children.cache.find(channel => channel.name === `ticket-${userId}`) || null
  if (parent.type === ChannelType.GuildForum || parent.type === ChannelType.GuildText || parent.type === ChannelType.GuildAnnouncement) {
    const active = await parent.threads.fetchActive().catch(() => null)
    return active?.threads.find(thread => thread.name === `ticket-${userId}`) || null
  }
  return null
}

function ticketWelcome(userId: string, serviceName: string) {
  return {
    content: `<@&${TICKET_NOTIFY_ROLE_ID}>`,
    embeds: [new EmbedBuilder().setColor('#2B6CB0').setTitle('Solicitud recibida').setDescription([
      `Hola <@${userId}>, gracias por contactar con nuestro equipo.`, '',
      `Has solicitado información sobre **${serviceName}**.`,
      'Para preparar un presupuesto preciso, indícanos el objetivo, las funciones, referencias y cualquier plazo importante.', '',
      'Un miembro del equipo revisará tu solicitud y te responderá lo antes posible.'
    ].join('\n')).setFooter({ text: 'No compartas datos sensibles en este canal.' })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('services-close-ticket').setLabel('Cerrar ticket').setStyle(ButtonStyle.Danger)
    )]
  }
}

export async function createServiceTicket(interaction: StringSelectMenuInteraction, service: Service): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Este menú solo puede usarse dentro de un servidor.', ephemeral: true })
    return
  }
  const existing = await hasOpenTicket(interaction.guild, interaction.user.id)
  if (existing) {
    await interaction.reply({ content: `Ya tienes un ticket abierto: ${existing}`, ephemeral: true })
    return
  }
  const parent = await interaction.guild.channels.fetch(TICKETS_CHANNEL_ID).catch(() => null)
  if (!parent) {
    await interaction.reply({ content: 'No se encontró el canal configurado para tickets.', ephemeral: true })
    return
  }
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
  ]
  const serviceName = service === 'discord' ? 'un bot de Discord' : 'desarrollo web'
  if (parent.type === ChannelType.GuildCategory) {
    const ticket = await interaction.guild.channels.create({ name: `ticket-${interaction.user.id}`, type: ChannelType.GuildText, parent: parent.id, permissionOverwrites: overwrites, reason: `Solicitud de ${serviceName} por ${interaction.user.tag}` })
    try {
      await Ticket.create({ guildId: interaction.guild.id, channelId: ticket.id, userId: interaction.user.id, service, status: 'open' })
      await ticket.send(ticketWelcome(interaction.user.id, serviceName))
    } catch (error) {
      await ticket.delete('No se pudo registrar el ticket en MongoDB').catch(() => null)
      throw error
    }
    await interaction.reply({ content: `Tu ticket ha sido creado correctamente: ${ticket}`, ephemeral: true })
    return
  }
  if (parent.type === ChannelType.GuildForum || parent.type === ChannelType.GuildText || parent.type === ChannelType.GuildAnnouncement) {
    const welcome = ticketWelcome(interaction.user.id, serviceName)
    const thread = await parent.threads.create({ name: `ticket-${interaction.user.id}`, message: { content: `${welcome.content}\nSolicitud de ${serviceName} de <@${interaction.user.id}>`, embeds: welcome.embeds, components: welcome.components }, reason: `Solicitud de ${serviceName} por ${interaction.user.tag}` })
    try {
      await Ticket.create({ guildId: interaction.guild.id, channelId: thread.id, userId: interaction.user.id, service, status: 'open' })
    } catch (error) {
      await thread.delete('No se pudo registrar el ticket en MongoDB').catch(() => null)
      throw error
    }
    await interaction.reply({ content: `Tu ticket ha sido creado correctamente: ${thread}`, ephemeral: true })
    return
  }
  await interaction.reply({ content: 'El canal configurado para tickets no permite crear tickets.', ephemeral: true })
}

export async function showServiceInfo(interaction: StringSelectMenuInteraction, service: Service): Promise<void> {
  await interaction.reply({ content: info[service], ephemeral: true })
}

export async function closeServiceTicket(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel
  if (!channel || !('delete' in channel)) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un ticket.', ephemeral: true })
    return
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Este botón solo puede utilizarse dentro de un servidor.', ephemeral: true })
    return
  }

  const member = await interaction.guild.members.fetch(interaction.user.id)
  const canDelete = member.roles.cache.some(role => role.name === 'Fundador' || role.name === 'Co-Fundador')
  if (!canDelete) {
    await interaction.reply({ content: 'Solo un miembro con el rol Fundador o Co-Fundador puede borrar este ticket.', ephemeral: true })
    return
  }

  const ticket = await Ticket.findOne({ guildId: interaction.guild.id, channelId: channel.id, status: 'open' })
  if (!ticket) {
    await interaction.reply({ content: 'Este ticket no está registrado como abierto.', ephemeral: true })
    return
  }

  ticket.status = 'closed'
  ticket.closedAt = new Date()
  ticket.closedBy = interaction.user.id
  await ticket.save()

  await interaction.reply({ content: 'El ticket se cerrará en unos instantes.', ephemeral: true })
  await channel.delete(`Ticket cerrado por ${interaction.user.tag}`)
}

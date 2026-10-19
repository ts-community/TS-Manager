import {
  ChannelType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type EmbedBuilder
} from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Asociacion from '../../../models/Asociacion'
import { getGuildConfig } from '../../../services/guild'
import { hasPermission } from '../../../services/permissions'
import {
  ASOCIACIONES_CATEGORY_ID,
  EMOJI,
  FIELDS_PER_EMBED,
  addDays,
  cleanChannelName,
  greenEmbed,
  packEmbedsIntoMessages,
  sendAsociacionesLog,
  servidorFilter,
  unix
} from '../../../services/asociaciones'
import logger from '../../../utils/logger'

// Fecha del último mensaje real del canal (si está vacío o falla, usa el momento actual)
async function getLastMessageDate(channel: { messages?: { fetch: (o: { limit: number }) => Promise<Map<string, { createdAt: Date }>> } }): Promise<Date> {
  try {
    const messages = await channel.messages?.fetch({ limit: 1 })
    const last = messages?.values().next().value
    if (last) return last.createdAt
  } catch (error) {
    logger.warn('Asociaciones: no se pudo obtener el último mensaje del canal', {
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
  return new Date()
}

async function sendBatches(interaction: ChatInputCommandInteraction, embeds: EmbedBuilder[]) {
  const batches = packEmbedsIntoMessages(embeds)
  await interaction.editReply({ embeds: batches[0] })
  for (let i = 1; i < batches.length; i++) {
    await interaction.followUp({ embeds: batches[i] })
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('asociaciones')
    .setDescription('Gestión de asociaciones')
    .addSubcommand(sub =>
      sub
        .setName('guardar')
        .setDescription('Guardar una nueva asociación (Solo Staff)')
        .addUserOption(o => o.setName('representante').setDescription('Representante de la asociación').setRequired(true))
        .addIntegerOption(o => o.setName('tiempo-renovacion').setDescription('Tiempo de renovación en días').setMinValue(1).setRequired(true))
        .addChannelOption(o => o.setName('canal').setDescription('Canal de la asociación donde se avisará la renovación').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addUserOption(o => o.setName('staff-encargado').setDescription('Miembro del staff encargado de gestionar esta asociación'))
    )
    .addSubcommand(sub =>
      sub.setName('lista').setDescription('Ver la lista de todas las asociaciones guardadas (Solo Staff)')
    )
    .addSubcommand(sub =>
      sub
        .setName('ver')
        .setDescription('Ver las asociaciones en las que un miembro es representante o staff encargado')
        .addUserOption(o => o.setName('miembro').setDescription('Miembro a consultar (por defecto, tú)'))
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('Ver toda la información de una asociación concreta')
        .addStringOption(o => o.setName('servidor').setDescription('ID o nombre del servidor').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('actualizar')
        .setDescription('Actualizar los datos de una asociación (Solo Staff)')
        .addStringOption(o => o.setName('servidor').setDescription('ID o nombre del servidor').setRequired(true).setAutocomplete(true))
        .addUserOption(o => o.setName('representante').setDescription('Nuevo representante de la asociación'))
        .addIntegerOption(o => o.setName('tiempo-renovacion').setDescription('Nuevo tiempo de renovación en días').setMinValue(1))
        .addChannelOption(o => o.setName('canal').setDescription('Nuevo canal de la asociación').addChannelTypes(ChannelType.GuildText))
        .addUserOption(o => o.setName('staff-encargado').setDescription('Nuevo miembro del staff encargado de esta asociación'))
        .addBooleanOption(o => o.setName('quitar-representante').setDescription('Deja el campo de representante vacío'))
        .addBooleanOption(o => o.setName('quitar-staff-encargado').setDescription('Deja el campo de staff encargado vacío'))
    )
    .addSubcommand(sub =>
      sub
        .setName('eliminar')
        .setDescription('Eliminar una asociación (Solo Staff)')
        .addStringOption(o => o.setName('servidor').setDescription('ID o nombre del servidor').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('crearcanal')
        .setDescription('Crea un canal de asociación en la categoría de asociaciones (Solo Staff)')
        .addStringOption(o => o.setName('emoji').setDescription('Emoji del canal').setRequired(true))
        .addStringOption(o => o.setName('nombre').setDescription('Nombre del canal').setRequired(true))
    ),

  async autocomplete(interaction) {
    const search = interaction.options.getFocused().toLowerCase()
    const asociaciones = await Asociacion.find()
    await interaction.respond(
      asociaciones
        .filter(a => a.servidor.toLowerCase().includes(search))
        .slice(0, 25)
        .map(a => ({ name: a.servidor, value: a.servidor }))
    )
  },

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Este comando solo puede ser usado en servidores.', ephemeral: true })
    }

    await interaction.deferReply()

    const sub = interaction.options.getSubcommand()
    const reply = (description: string) =>
      interaction.editReply({ embeds: [greenEmbed().setDescription(description)] })

    // --- VER (público) ---
    if (sub === 'ver') {
      const miembro = interaction.options.getUser('miembro') ?? interaction.user
      const esUnoMismo = miembro.id === interaction.user.id

      const asociaciones = await Asociacion.find({
        $or: [{ representanteId: miembro.id }, { staffEncargadoId: miembro.id }]
      }).sort({ createdAt: -1 })

      if (!asociaciones.length) {
        return reply(
          esUnoMismo
            ? 'No tienes ninguna asociación asignada como representante o staff encargado.'
            : `${miembro} no tiene ninguna asociación asignada como representante o staff encargado.`
        )
      }

      const embeds: EmbedBuilder[] = []
      for (let i = 0; i < asociaciones.length; i += FIELDS_PER_EMBED) {
        const embed = greenEmbed().setTimestamp()

        if (i === 0) {
          embed
            .setTitle(esUnoMismo ? `${EMOJI.asociacion} Tus Asociaciones` : `${EMOJI.asociacion} Asociaciones de ${miembro.tag}`)
            .setDescription(`Se han encontrado **${asociaciones.length}** asociación(es) en las que participa ${esUnoMismo ? 'este usuario' : miembro}:`)
        }

        for (const a of asociaciones.slice(i, i + FIELDS_PER_EMBED)) {
          const next = unix(a.nextRenovationDate)
          const roles: string[] = []
          if (a.representanteId === miembro.id) roles.push('Representante')
          if (a.staffEncargadoId === miembro.id) roles.push('Staff Encargado')

          embed.addFields({
            name: a.servidor,
            value:
              `${EMOJI.staff} **Rol:** ${roles.join(' / ')}\n` +
              `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : 'Sin asignar'}\n` +
              `${EMOJI.canal} **Canal:** <#${a.canalId}>\n` +
              `${EMOJI.renovacion} **Renovación:** Cada ${a.renovacionDias} días\n` +
              `${EMOJI.proxima} **Próxima Renovación:** <t:${next}:R> (<t:${next}:d>)`
          })
        }

        embeds.push(embed)
      }

      return sendBatches(interaction, embeds)
    }

    // --- INFO (público) ---
    if (sub === 'info') {
      const servidor = interaction.options.getString('servidor', true)
      const asociacion = await Asociacion.findOne(servidorFilter(servidor))

      if (!asociacion) return reply(`No se encontró ninguna asociación con \`${servidor}\`.`)

      const next = unix(asociacion.nextRenovationDate)
      const last = unix(asociacion.lastRenovationDate)

      const embed = greenEmbed()
        .setTitle(`${EMOJI.asociacion} Asociación: ${asociacion.servidor}`)
        .addFields(
          { name: `${EMOJI.representante} Representante`, value: asociacion.representanteId ? `<@${asociacion.representanteId}>` : 'Sin asignar', inline: true },
          { name: `${EMOJI.staff} Staff Encargado`, value: asociacion.staffEncargadoId ? `<@${asociacion.staffEncargadoId}>` : 'Sin asignar', inline: true },
          { name: `${EMOJI.canal} Canal`, value: `<#${asociacion.canalId}>`, inline: true },
          { name: `${EMOJI.renovacion} Renovación`, value: `Cada ${asociacion.renovacionDias} días`, inline: true },
          { name: `${EMOJI.avisada} Renovación Avisada`, value: asociacion.renovacionAvisada ? 'Sí' : 'No', inline: true },
          { name: `${EMOJI.creada} Creada`, value: `<t:${unix(asociacion.createdAt)}:d>`, inline: true },
          { name: `${EMOJI.ultima} Última Renovación`, value: `<t:${last}:R> (<t:${last}:d>)`, inline: false },
          { name: `${EMOJI.proxima} Próxima Renovación`, value: `<t:${next}:R> (<t:${next}:d>)`, inline: false }
        )
        .setFooter({ text: `ID: ${asociacion._id}` })
        .setTimestamp()

      return interaction.editReply({ embeds: [embed] })
    }

    // --- A partir de aquí, solo Staff ---
    const authorized = await hasPermission(interaction, 'staff')
    if (!authorized) {
      return reply('**Acceso Denegado**: Solo el Staff autorizado puede gestionar las asociaciones.')
    }

    const logBase = (title: string) =>
      greenEmbed().setTitle(title).setTimestamp()
    const executedBy = `**Ejecutado por:** ${interaction.user} (\`${interaction.user.tag}\`)\n\n`

    // --- GUARDAR ---
    if (sub === 'guardar') {
      const representante = interaction.options.getUser('representante', true)
      const dias = interaction.options.getInteger('tiempo-renovacion', true)
      const canal = interaction.options.getChannel('canal', true)
      const staffEncargado = interaction.options.getUser('staff-encargado')
      const servidor = cleanChannelName(canal.name ?? '')

      if (await Asociacion.findOne(servidorFilter(servidor))) {
        return reply(`Ya existe una asociación guardada con el ID o nombre de servidor \`${servidor}\`.`)
      }

      // La renovación se cuenta desde el último mensaje real del canal
      const lastMessageDate = await getLastMessageDate(canal as never)
      const asociacion = await Asociacion.create({
        servidor,
        representanteId: representante.id,
        renovacionDias: dias,
        canalId: canal.id,
        staffEncargadoId: staffEncargado?.id ?? null,
        lastRenovationDate: lastMessageDate,
        nextRenovationDate: addDays(lastMessageDate, dias)
      })

      await sendAsociacionesLog(
        interaction.client,
        logBase('📋 LOG: Asociación Guardada').setDescription(
          executedBy +
          `${EMOJI.servidor} **Servidor:** ${asociacion.servidor}\n` +
          `${EMOJI.representante} **Representante:** ${representante}\n` +
          `${EMOJI.renovacion} **Renovación:** Cada ${asociacion.renovacionDias} días\n` +
          `${EMOJI.canal} **Canal:** ${canal}\n` +
          `${EMOJI.staff} **Staff Encargado:** ${staffEncargado ?? 'Sin asignar'}`
        )
      )

      const embed = greenEmbed()
        .setTitle('✅ Asociación Guardada')
        .addFields(
          { name: `${EMOJI.servidor} Servidor`, value: asociacion.servidor, inline: true },
          { name: `${EMOJI.representante} Representante`, value: `${representante}`, inline: true },
          { name: `${EMOJI.renovacion} Renovación`, value: `Cada ${asociacion.renovacionDias} días`, inline: true },
          { name: `${EMOJI.canal} Canal`, value: `${canal}`, inline: true },
          { name: `${EMOJI.staff} Staff Encargado`, value: staffEncargado ? `${staffEncargado}` : 'Sin asignar', inline: true },
          { name: `${EMOJI.proxima} Próxima Renovación`, value: `<t:${unix(asociacion.nextRenovationDate)}:F>`, inline: false }
        )
        .setTimestamp()

      return interaction.editReply({ embeds: [embed] })
    }

    // --- LISTA ---
    if (sub === 'lista') {
      const asociaciones = await Asociacion.find().sort({ createdAt: -1 })
      if (!asociaciones.length) return reply('No hay asociaciones guardadas actualmente.')

      // Agrupa por staff encargado (las sin asignar van en su propio grupo)
      const groups = new Map<string, typeof asociaciones>()
      for (const a of asociaciones) {
        const key = a.staffEncargadoId ?? 'sin_asignar'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(a)
      }

      const { staffRoleIds } = await getGuildConfig()

      const entries = await Promise.all(
        Array.from(groups.entries()).map(async ([staffId, items]) => {
          let nombre = 'Sin asignar'
          let rolePosition = -1
          if (staffId !== 'sin_asignar') {
            const member = await interaction.guild!.members.fetch(staffId).catch(() => null)
            if (member) {
              nombre = member.displayName
              const highest = member.roles.cache
                .filter(r => staffRoleIds.includes(r.id))
                .sort((a, b) => b.position - a.position)
                .first()
              rolePosition = highest?.position ?? -1
            } else {
              const user = await interaction.client.users.fetch(staffId).catch(() => null)
              nombre = user ? user.tag : `ID ${staffId}`
            }
          }
          return { staffId, nombre, items, rolePosition }
        })
      )

      // De menor a mayor rango de staff, "Sin asignar" al final
      entries.sort((a, b) => {
        if (a.staffId === 'sin_asignar') return 1
        if (b.staffId === 'sin_asignar') return -1
        if (a.rolePosition !== b.rolePosition) return a.rolePosition - b.rolePosition
        return a.nombre.localeCompare(b.nombre)
      })

      const embeds: EmbedBuilder[] = []
      for (const { nombre, items } of entries) {
        const totalChunks = Math.ceil(items.length / FIELDS_PER_EMBED)
        for (let i = 0; i < totalChunks; i++) {
          const embed = greenEmbed()
            .setTitle(`${EMOJI.asociacion} Asociaciones de ${nombre} (${items.length})${totalChunks > 1 ? ` [${i + 1}/${totalChunks}]` : ''}`)
            .setTimestamp()

          for (const a of items.slice(i * FIELDS_PER_EMBED, (i + 1) * FIELDS_PER_EMBED)) {
            const next = unix(a.nextRenovationDate)
            embed.addFields({
              name: a.servidor,
              value:
                `${EMOJI.representante} **Representante:** ${a.representanteId ? `<@${a.representanteId}>` : 'Sin asignar'}\n` +
                `${EMOJI.renovacion} **Renovación:** Cada ${a.renovacionDias} días\n` +
                `${EMOJI.canal} **Canal:** <#${a.canalId}>\n` +
                `${EMOJI.proxima} **Próxima Renovación:** <t:${next}:R> (<t:${next}:d>)`
            })
          }

          embeds.push(embed)
        }
      }

      return sendBatches(interaction, embeds)
    }

    // --- ACTUALIZAR ---
    if (sub === 'actualizar') {
      const servidor = interaction.options.getString('servidor', true)
      const asociacion = await Asociacion.findOne(servidorFilter(servidor))
      if (!asociacion) return reply(`No se encontró ninguna asociación con \`${servidor}\`.`)

      const representante = interaction.options.getUser('representante')
      const dias = interaction.options.getInteger('tiempo-renovacion')
      const canal = interaction.options.getChannel('canal')
      const staffEncargado = interaction.options.getUser('staff-encargado')
      const quitarRepresentante = interaction.options.getBoolean('quitar-representante')
      const quitarStaffEncargado = interaction.options.getBoolean('quitar-staff-encargado')

      if (representante && quitarRepresentante) return reply('No puedes indicar un nuevo representante y quitarlo al mismo tiempo.')
      if (staffEncargado && quitarStaffEncargado) return reply('No puedes indicar un nuevo staff encargado y quitarlo al mismo tiempo.')
      if (!representante && !dias && !canal && !staffEncargado && !quitarRepresentante && !quitarStaffEncargado) {
        return reply('Debes indicar al menos un dato a actualizar (representante, renovación, canal, staff encargado, o quitar alguno de estos).')
      }

      if (representante) asociacion.representanteId = representante.id
      else if (quitarRepresentante) asociacion.representanteId = null

      if (canal) asociacion.canalId = canal.id

      if (staffEncargado) asociacion.staffEncargadoId = staffEncargado.id
      else if (quitarStaffEncargado) asociacion.staffEncargadoId = null

      if (dias) asociacion.renovacionDias = dias

      // Si cambia el canal o el tiempo, recalcula desde el último mensaje real del canal
      if (dias || canal) {
        const target = canal ?? await interaction.client.channels.fetch(asociacion.canalId).catch(() => null)
        const lastMessageDate = target ? await getLastMessageDate(target as never) : new Date()
        asociacion.lastRenovationDate = lastMessageDate
        asociacion.nextRenovationDate = addDays(lastMessageDate, asociacion.renovacionDias)
        asociacion.renovacionAvisada = false
      }
      await asociacion.save()

      await sendAsociacionesLog(
        interaction.client,
        logBase('📋 LOG: Asociación Actualizada').setDescription(
          executedBy +
          `${EMOJI.servidor} **Servidor:** ${asociacion.servidor}\n` +
          (representante ? `${EMOJI.representante} **Nuevo Representante:** ${representante}\n` : '') +
          (quitarRepresentante ? `${EMOJI.representante} **Representante:** quitado\n` : '') +
          (dias ? `${EMOJI.renovacion} **Nueva Renovación:** Cada ${dias} días\n` : '') +
          (canal ? `${EMOJI.canal} **Nuevo Canal:** ${canal}\n` : '') +
          (staffEncargado ? `${EMOJI.staff} **Nuevo Staff Encargado:** ${staffEncargado}\n` : '') +
          (quitarStaffEncargado ? `${EMOJI.staff} **Staff Encargado:** quitado\n` : '')
        )
      )

      return reply(`✅ Asociación \`${asociacion.servidor}\` actualizada correctamente.`)
    }

    // --- ELIMINAR ---
    if (sub === 'eliminar') {
      const servidor = interaction.options.getString('servidor', true)
      const deleted = await Asociacion.findOneAndDelete(servidorFilter(servidor))
      if (!deleted) return reply(`No se encontró ninguna asociación con \`${servidor}\` para eliminar.`)

      await sendAsociacionesLog(
        interaction.client,
        logBase('📋 LOG: Asociación Eliminada').setDescription(
          executedBy +
          `${EMOJI.servidor} **Servidor:** ${deleted.servidor}\n` +
          `${EMOJI.representante} **Representante:** ${deleted.representanteId ? `<@${deleted.representanteId}>` : 'Sin asignar'}`
        )
      )

      return reply(`🗑️ La asociación con **${deleted.servidor}** ha sido eliminada.`)
    }

    // --- CREARCANAL ---
    if (sub === 'crearcanal') {
      const emoji = interaction.options.getString('emoji', true)
      const nombre = interaction.options.getString('nombre', true)
      const channelName = `•〔${emoji}〕${nombre}`

      const category = await interaction.guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
      if (!category || category.type !== ChannelType.GuildCategory) {
        return reply('No se encontró la categoría de asociaciones configurada.')
      }

      const canal = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id
      })

      // Sincroniza los permisos del canal con los de la categoría padre
      await canal.lockPermissions()

      await sendAsociacionesLog(
        interaction.client,
        logBase('📋 LOG: Canal de Asociación Creado').setDescription(
          executedBy +
          `${EMOJI.canal} **Canal:** ${canal} (\`${channelName}\`)\n` +
          `📁 **Categoría:** ${category.name}`
        )
      )

      return reply(`✅ Canal ${canal} creado correctamente en la categoría **${category.name}**, con los permisos sincronizados.`)
    }
  }
} satisfies SlashCommand

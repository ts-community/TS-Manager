import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type Collection,
  type Message
} from 'discord.js'
import type { SlashCommand } from '../../../types/commands'
import Asociacion from '../../../models/Asociacion'
import { hasPermission } from '../../../services/permissions'
import {
  buildAssociationDetailPayload,
  fetchStaffGroups,
  renderStaffCenter,
  schedulePanelsSync
} from '../../../services/asociaciones'
import {
  ASOCIACIONES_CATEGORY_ID,
  EMOJI,
  addDays,
  buildEditorPayload,
  greenEmbed,
  logger,
  sendAsociacionesLog,
  servidorFilter,
  titleFromChannelName,
  toChannelSlug,
  unix,
  Container
} from '../../../services/asociaciones'

const ELIMINAR_MENU_ID = 'asoc-select-eliminar'
const STAFF_MENU_ID = 'asoc-select-staff'
const ASOCIACION_MENU_ID = 'asoc-select-asociacion'

async function getLastMessageDate(channel: unknown): Promise<Date> {
  const manager = (channel as { messages?: { fetch: (o: { limit: number }) => Promise<Collection<string, Message>> } }).messages
  const last = await manager?.fetch({ limit: 1 }).catch(() => null)
  const firstMessage = last?.values().next().value
  return firstMessage?.createdAt ?? new Date()
}

// Tarjeta con las asociaciones de un staff + menú para entrar a cada una
async function buildAsociacionesStaffPayload(
  interaction: ChatInputCommandInteraction,
  memberId: string
): Promise<unknown> {
  const member = await interaction.guild!.members.fetch(memberId).catch(() => null)
  const asociaciones = await Asociacion.find({ staffEncargadoId: memberId }).sort({ servidor: 1 })

  if (!asociaciones.length) {
    return {
      embeds: [greenEmbed()
        .setTitle(`${EMOJI.asociacion} Sin asociaciones`)
        .setDescription(`**${member?.displayName ?? memberId}** todavía no participa en ninguna asociación.`)
        .setTimestamp()
      ],
      components: []
    }
  }

  if (asociaciones.length === 1) {
    const unique = asociaciones[0]
    return buildAssociationDetailPayload(unique, {
      canEdit: await hasPermission(interaction, 'staff'),
      canDelete: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
    })
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(ASOCIACION_MENU_ID)
    .setPlaceholder('Selecciona una asociación para verla')
  for (const a of asociaciones.slice(0, 25)) {
    menu.addOptions({ label: a.servidor, value: a.id.toString() })
  }

  const embed = greenEmbed()
    .setTitle(`${EMOJI.asociacion} Asociaciones de ${member?.displayName ?? memberId}`)
    .setDescription(
      asociaciones
        .slice(0, 25)
        .map(a => {
          const next = unix(a.nextRenovationDate)
          return `${EMOJI.servidor} **${a.servidor}** (<#${a.canalId}>)\n` +
            `${EMOJI.renovacion} Frecuencia: cada ${a.renovacionDias} días · ${EMOJI.proxima} Next: <t:${next}:d> (<t:${next}:R>)`
        })
        .join('\n\n') +
      (asociaciones.length > 25 ? `\n-# Mostrando 25 de ${asociaciones.length}.` : '')
    )
    .setTimestamp()

  return { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] }
}

export default {
  data: new SlashCommandBuilder()
    .setName('asociaciones')
    .setDescription('Gestión de asociaciones')
    .addSubcommand(sub =>
      sub
        .setName('mostrar')
        .setDescription('Ver una asociación concreta, o las de un staff/miembro con menú interactivo')
        .addStringOption(o =>
          o
            .setName('servidor')
            .setDescription('Ver una asociación concreta (busca por nombre)')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addUserOption(o => o.setName('staff').setDescription('Ver las asociaciones gestionadas por este staff').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('crear')
        .setDescription('Crear una asociación nueva o adosar un canal ya existente (Solo Staff)')
        .addUserOption(o => o.setName('representante').setDescription('Representante de la asociación').setRequired(true))
        .addIntegerOption(o => o.setName('tiempo-renovacion').setDescription('Días entre renovaciones').setMinValue(1).setMaxValue(365).setRequired(true))
        .addStringOption(o => o.setName('emoji').setDescription('Emoji del canal nuevo (formato 「emoji」nombre-a-nombre)'))
        .addStringOption(o => o.setName('nombre').setDescription('Nombre de la asociación, con mayúsculas correctas'))
        .addChannelOption(o => o.setName('canal').setDescription('Canal ya existente (si no se crea uno nuevo)').addChannelTypes(ChannelType.GuildText))
        .addUserOption(o => o.setName('staff-encargado').setDescription('Miembro del staff encargado de esta asociación (por defecto: tú)'))
    )
    .addSubcommand(sub =>
      sub
        .setName('editar')
        .setDescription('Editar los campos de una asociación (Solo Staff)')
        .addStringOption(o =>
          o
            .setName('servidor')
            .setDescription('Asociación a editar')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('eliminar')
        .setDescription('Eliminar una asociación (Solo Admin)')
    )
    .addSubcommand(sub =>
      sub
        .setName('lista')
        .setDescription('Ver las asociaciones agrupadas por staff (Solo Staff)')
    ),

  async autocomplete(interaction) {
    const search = interaction.options.getFocused().toLowerCase()
    const asociaciones = await Asociacion.find().sort({ servidor: 1 })
    await interaction.respond(
      asociaciones
        .filter(a => a.servidor.toLowerCase().includes(search))
        .slice(0, 25)
        .map(a => ({ name: a.servidor, value: a.id.toString() }))
    )
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Este comando solo puede usarse en un servidor.', ephemeral: true })
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const sub = interaction.options.getSubcommand()

    const reply = async (content: string) => {
      await interaction.editReply({ content })
    }

    /* ------------------- mostrar ------------------- */
    if (sub === 'mostrar') {
      const servidorId = interaction.options.getString('servidor')
      const staffUser = interaction.options.getUser('staff')

      if (servidorId) {
        const asociacion = await Asociacion.findById(servidorId) ?? await Asociacion.findOne(servidorFilter(servidorId))
        if (!asociacion) {
          return void reply(`No se encontró ninguna asociación con \`${servidorId}\`.`)
        }

        return void interaction.editReply(
          buildAssociationDetailPayload(asociacion, {
            canEdit: await hasPermission(interaction, 'staff'),
            canDelete: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
          }) as never
        )
      }

      if (staffUser) {
        return void interaction.editReply(await buildAsociacionesStaffPayload(interaction, staffUser.id) as never)
      }

      // Sin parámetros: menú para elegir el staff/miembro
      const menu = new UserSelectMenuBuilder()
        .setCustomId(STAFF_MENU_ID)
        .setPlaceholder('Selecciona el staff o miembro a consultar')
      return void interaction.editReply({
        embeds: [greenEmbed().setTitle(`${EMOJI.asociacion} ¿A quién consultamos?`)
          .setDescription('Elige a un miembro del menú de abajo y verás sus asociaciones; si gestiona varias, podrás elegir una para ver toda la info con botones de editar/eliminar.')]
        , components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu)]
      } as never)
    }

    /* ------------------- lista ------------------- */
if (sub === 'lista') {
    if (!await hasPermission(interaction, 'staff')) {
      return void reply('**Acceso Denegado**: la lista completa es solo para el staff.')
    }
    const groups = await fetchStaffGroups(interaction.client)
    const containers = renderStaffCenter(groups)
    if (!groups.length) return void reply('No hay asociaciones registradas todavía.')

    const MAX_COMPONENTS_PER_MESSAGE = 10
    const chunks: Container[][] = []
    for (let i = 0; i < containers.length; i += MAX_COMPONENTS_PER_MESSAGE) {
      chunks.push(containers.slice(i, i + MAX_COMPONENTS_PER_MESSAGE))
    }

    try {
      await interaction.editReply({
        components: chunks[0],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      } as never)
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({
          components: chunks[i],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        } as never).catch(() => {})
      }
    } catch (error) {
      logger.error('Asociaciones: error enviando lista de staff', {
        command: 'asociaciones lista',
        user: interaction.user.tag,
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      await interaction.followUp({
        content: '⚠️ Ocurrió un error al generar la lista de asociaciones.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {})
    }
  }

    const authorized = await hasPermission(interaction, 'staff')
    if (!authorized) {
      return void reply('**Acceso Denegado**: Solo el staff autorizado puede gestionar las asociaciones.')
    }

    /* ------------------- crear ------------------- */
    if (sub === 'crear') {
      const canalOpt = interaction.options.getChannel('canal')
      const emoji = interaction.options.getString('emoji')?.trim()
      const nombreOpt = interaction.options.getString('nombre')?.trim()
      const representante = interaction.options.getUser('representante', true)
      const dias = interaction.options.getInteger('tiempo-renovacion', true)
      const staffEncargadoId = interaction.options.getUser('staff-encargado')?.id ?? interaction.user.id

      let canal = canalOpt
      let servidorDisplay = ''

      if (canal) {
        // Usamos un canal ya existente
        servidorDisplay = nombreOpt ?? titleFromChannelName(canal.name ?? '')
      } else {
        // Creamos un canal nuevo con el formato 「emoji」nombre-con-guiones
        if (!emoji || !nombreOpt) {
          return void reply('Si no eliges un canal existente, debes indicar `emoji` y `nombre` para crear el canal nuevo.')
        }
        const category = await interaction.guild.channels.fetch(ASOCIACIONES_CATEGORY_ID).catch(() => null)
        if (!category || category.type !== ChannelType.GuildCategory) {
          return void reply('No se encontró la categoría de asociaciones configurada.')
        }

        servidorDisplay = nombreOpt
        const channelName = `「${emoji}」${toChannelSlug(servidorDisplay)}`
        const created = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id
        })
        await created.lockPermissions()
        canal = created
      }

      const duplicada = await Asociacion.findOne(servidorFilter(servidorDisplay))
      if (duplicada) {
        return void reply(`Ya existe una asociación guardada con el nombre "${servidorDisplay}".`)
      }

      const lastMessageDate = await getLastMessageDate(canal)
      const asociacion = await Asociacion.create({
        servidor: servidorDisplay,
        representanteId: representante.id,
        renovacionDias: dias,
        canalId: canal.id,
        staffEncargadoId,
        lastRenovationDate: lastMessageDate,
        nextRenovationDate: addDays(lastMessageDate, dias)
      })

      await sendAsociacionesLog(
        interaction.client,
        greenEmbed().setTitle('📋 LOG: Asociación Creada').setDescription(
          `**Ejecutado por:** ${interaction.user}\n` +
          `${EMOJI.servidor} **Servidor:** ${servidorDisplay}\n` +
          `${EMOJI.canal} **Canal:** <#${asociacion.canalId}>\n` +
          `${EMOJI.representante} **Representante:** ${representante}\n` +
          `${EMOJI.staff} **Staff encargado:** <@${staffEncargadoId}>\n` +
          `${EMOJI.renovacion} **Renovación:** cada ${dias} días`
        ).setTimestamp()
      )

      schedulePanelsSync(interaction.client)

      return void interaction.editReply(
        buildAssociationDetailPayload(asociacion, { canEdit: true, canDelete: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false }) as never
      )
    }

    /* ------------------- editar ------------------- */
    if (sub === 'editar') {
      const servidorId = interaction.options.getString('servidor', true)
      const asociacion = await Asociacion.findById(servidorId) ?? await Asociacion.findOne(servidorFilter(servidorId))
      if (!asociacion) return void reply(`No se encontró ninguna asociación con \`${servidorId}\`.`)

      return void interaction.editReply(buildEditorPayload(asociacion) as never)
    }

    /* ------------------- eliminar ------------------- */
    if (sub === 'eliminar') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return void reply('**Solo los administradores pueden eliminar asociaciones.**')
      }

      const asociaciones = (await Asociacion.find()).sort((a, b) => a.servidor.localeCompare(b.servidor, 'es', { sensitivity: 'base' })).slice(0, 25)
      if (!asociaciones.length) return void reply('No hay asociaciones registradas para eliminar.')

      const menu = new StringSelectMenuBuilder()
        .setCustomId(ELIMINAR_MENU_ID)
        .setPlaceholder('Selecciona la asociación a eliminar')
      for (const a of asociaciones) {
        menu.addOptions({ label: a.servidor, value: a.id.toString() })
      }

      return void interaction.editReply({
        embeds: [greenEmbed().setTitle('🗑️ Eliminar asociación')
          .setDescription('Selecciona del menú la asociación a eliminar.\nDespués de elegirla se enviará una confirmación que debes pulsar.')]
        , components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
      } as never)
    }

  }
} satisfies SlashCommand

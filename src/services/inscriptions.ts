import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type Client,
  type GuildMember,
  type User
} from 'discord.js'
import GuildModel from '../models/Guild'
import Team from '../models/Team'
import Verification from '../models/Verification'
import { guildId as mainGuildId } from '../config/env'
import { getGuildConfig, setGuildConfigCache } from './guild'
import { ensureVerifiedRole, fetchBrawlPlayer, logTeam, logVerification, normalizePlayerTag } from './teams'
import logger from '../utils/logger'

export const INSCRIPTIONS_CHANNEL_ID = '1568936507270762517'
export const VERIFICATION_CHANNEL_ID = '1112754769472270449'

interface Result {
  ok: boolean
  content: string
  embeds?: EmbedBuilder[]
}

const fail = (content: string): Result => ({ ok: false, content })

export const MAX_ACCOUNTS = 5

const errMsg = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error')

/** Vincula una cuenta de Brawl Stars a un miembro (puede tener varias): valida, guarda, da el rol y manda el log. */
export async function verifyMember(member: GuildMember, rawTag: string): Promise<Result> {
  const tag = normalizePlayerTag(rawTag)
  if (!tag) {
    return fail('Ese tag no es válido. Lo encuentras en tu perfil de Brawl Stars, debajo de tu nombre (ej: `#2PQ8LGY0`).')
  }

  const guild = member.guild
  const role = await ensureVerifiedRole(guild)

  const owner = await Verification.findOne({ guildId: guild.id, tag })
  if (owner) {
    if (owner.userId === member.id) {
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'Verificación ya registrada').catch(() => {})
      return fail(`La cuenta **${owner.playerName}** (\`${owner.tag}\`) ya está vinculada a tu usuario.`)
    }
    return fail(`El tag \`${tag}\` ya está vinculado a otro usuario. Si es tuyo, habla con el staff.`)
  }

  const count = await Verification.countDocuments({ guildId: guild.id, userId: member.id })
  if (count >= MAX_ACCOUNTS) return fail(`Ya tienes ${MAX_ACCOUNTS} cuentas vinculadas, que es el máximo. Desvincula alguna desde **Mis cuentas**.`)

  let player
  try {
    player = await fetchBrawlPlayer(tag)
  } catch (error) {
    logger.error('Verificación: fallo consultando la API de Brawl Stars', { reason: errMsg(error) })
    return fail('No he podido comprobar tu tag ahora mismo. Inténtalo de nuevo en unos minutos.')
  }
  if (!player) return fail(`No existe ningún jugador con el tag \`${tag}\`. Revísalo en tu perfil de Brawl Stars.`)

  const saved = await Verification.create({
    guildId: guild.id,
    userId: member.id,
    tag: player.tag,
    playerName: player.name,
    trophies: player.trophies
  }).catch((error: any) => {
    if (error?.code === 11000) return null
    throw error
  })
  if (!saved) return fail('Ese tag ya está vinculado a un usuario.')

  const added = member.roles.cache.has(role.id) || (await member.roles.add(role, `Verificación con tag ${player.tag}`).then(() => true, () => false))

  await logVerification(
    guild,
    new EmbedBuilder()
      .setColor('Green')
      .setTitle(count === 0 ? 'Usuario verificado' : 'Cuenta adicional vinculada')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Usuario', value: `<@${member.id}> (\`${member.user.tag}\`)` },
        { name: 'ID', value: member.id, inline: true },
        { name: 'Cuenta creada', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Jugador Brawl Stars', value: `**${player.name}** · \`${player.tag}\`` },
        { name: 'Trofeos', value: player.trophies.toLocaleString('es-ES'), inline: true },
        { name: 'Cuentas vinculadas', value: String(count + 1), inline: true }
      )
      .setFooter(added ? null : { text: 'No se pudo dar el rol (permisos o jerarquía del bot)' })
      .setTimestamp()
  )

  if (!added) return { ok: true, content: 'Tu cuenta se ha guardado, pero no he podido darte el rol. Avisa a un administrador.' }
  return {
    ok: true,
    content: `Cuenta **${player.name}** (\`${player.tag}\`) vinculada ✅ Tienes el rol <@&${role.id}>.` +
      (count > 0 ? ` Ahora tienes ${count + 1} cuentas vinculadas.` : ' Ya puedes inscribirte en un equipo.')
  }
}

/** Lista de cuentas del usuario con un select para desvincular. */
export async function accountsPayload(member: GuildMember) {
  const accounts = await Verification.find({ guildId: member.guild.id, userId: member.id }).sort({ verifiedAt: 1 })
  if (!accounts.length) {
    return { content: 'No tienes ninguna cuenta vinculada. Pulsa **Verificar** para añadir una.', embeds: [], components: [] }
  }

  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle('Tus cuentas vinculadas')
    .setDescription(
      accounts
        .map((a, i) => `**${i + 1}. ${a.playerName}** · \`${a.tag}\`\n🏆 ${a.trophies.toLocaleString('es-ES')} · vinculada <t:${Math.floor(a.verifiedAt.getTime() / 1000)}:R>`)
        .join('\n\n')
    )
    .setFooter({ text: `${accounts.length}/${MAX_ACCOUNTS} cuentas` })

  const select = new StringSelectMenuBuilder()
    .setCustomId('insc-desvincular')
    .setPlaceholder('Desvincular una cuenta…')
    .addOptions(accounts.map(a => ({ label: a.playerName.slice(0, 100), description: a.tag, value: a.tag })))

  return {
    content: '',
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)]
  }
}

/** Desvincula una cuenta; si ya no le queda ninguna, le quita el rol. */
export async function unlinkAccount(member: GuildMember, tag: string): Promise<Result> {
  const removed = await Verification.findOneAndDelete({ guildId: member.guild.id, userId: member.id, tag })
  if (!removed) return fail('Esa cuenta ya no está vinculada a tu usuario.')

  const left = await Verification.countDocuments({ guildId: member.guild.id, userId: member.id })
  if (left === 0) {
    const role = await ensureVerifiedRole(member.guild)
    await member.roles.remove(role, 'Sin cuentas vinculadas').catch(() => {})
  }

  await logVerification(
    member.guild,
    new EmbedBuilder()
      .setColor('Orange')
      .setTitle('Cuenta desvinculada')
      .addFields(
        { name: 'Usuario', value: `<@${member.id}> (\`${member.user.tag}\`)` },
        { name: 'Jugador Brawl Stars', value: `**${removed.playerName}** · \`${removed.tag}\`` },
        { name: 'Cuentas restantes', value: String(left), inline: true }
      )
      .setTimestamp()
  )

  return {
    ok: true,
    content: `Cuenta **${removed.playerName}** (\`${removed.tag}\`) desvinculada.` +
      (left === 0 ? ' Ya no tienes cuentas vinculadas, así que he quitado el rol de verificado.' : '')
  }
}

/** Refresca nombre y trofeos de todas las cuentas del usuario y le devuelve el rol si le falta. */
export async function updateAccounts(member: GuildMember): Promise<Result> {
  const accounts = await Verification.find({ guildId: member.guild.id, userId: member.id }).sort({ verifiedAt: 1 })
  if (!accounts.length) return fail('No tienes ninguna cuenta vinculada. Pulsa **Verificar** para añadir una.')

  const lines: string[] = []
  for (const account of accounts) {
    try {
      const player = await fetchBrawlPlayer(account.tag)
      if (!player) {
        lines.push(`⚠️ \`${account.tag}\` ya no existe en Brawl Stars`)
        continue
      }
      const diff = player.trophies - account.trophies
      account.playerName = player.name
      account.trophies = player.trophies
      await account.save()
      lines.push(`✅ **${player.name}** · \`${player.tag}\` · 🏆 ${player.trophies.toLocaleString('es-ES')}${diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}`)
    } catch (error) {
      logger.error('Actualizar cuentas: fallo consultando la API de Brawl Stars', { reason: errMsg(error) })
      lines.push(`❌ \`${account.tag}\`: no se pudo consultar ahora mismo`)
    }
  }

  const role = await ensureVerifiedRole(member.guild)
  let roleNote = ''
  if (!member.roles.cache.has(role.id)) {
    const added = await member.roles.add(role, 'Actualización de cuentas').then(() => true, () => false)
    roleNote = added ? `\n\nTe he devuelto el rol <@&${role.id}>.` : '\n\nNo he podido darte el rol de verificado. Avisa a un administrador.'
  }

  return { ok: true, content: `**Cuentas actualizadas**\n${lines.join('\n')}${roleNote}` }
}

// Evita que dos inscripciones simultáneas metan a la misma persona en dos equipos
const pending = new Set<string>()

/** Inscribe un equipo: el capitán + 2 titulares y hasta 2 suplentes (opcionales), todos verificados y sin equipo. */
export async function registerTeam(captain: GuildMember, rawName: string, others: User[], subs: User[]): Promise<Result> {
  const guild = captain.guild
  const name = rawName.trim()
  if (name.length < 2 || name.length > 32) return fail('El nombre del equipo debe tener entre 2 y 32 caracteres.')
  if (others.length !== 2) return fail('El equipo debe tener 3 titulares (tú incluido).')
  if (subs.length > 2) return fail('Un equipo puede tener como máximo 2 suplentes.')

  const starters = [captain.user, ...others]
  const all = [...starters, ...subs]
  const ids = all.map(u => u.id)

  if (all.some(u => u.bot)) return fail('No puedes inscribir bots en un equipo.')
  if (new Set(ids).size !== ids.length) return fail('Todos los miembros del equipo deben ser personas distintas (tú ya cuentas como titular).')
  if (ids.some(id => pending.has(id))) {
    return fail('Alguno de los jugadores se está inscribiendo ahora mismo en otro equipo. Inténtalo de nuevo.')
  }

  ids.forEach(id => pending.add(id))
  try {
    const members = await guild.members.fetch({ user: ids }).catch(() => null)
    const notInGuild = ids.filter(id => !members?.has(id))
    if (notInGuild.length) return fail(`Estos usuarios no están en el servidor: ${notInGuild.map(id => `<@${id}>`).join(', ')}`)

    const verifications = await Verification.find({ guildId: guild.id, userId: { $in: ids } })
    const notVerified = ids.filter(id => !verifications.some(v => v.userId === id))
    if (notVerified.length) {
      return fail(`Todos los miembros deben estar verificados en <#${VERIFICATION_CHANNEL_ID}>. Faltan: ${notVerified.map(id => `<@${id}>`).join(', ')}`)
    }

    const taken = await Team.find({ guildId: guild.id, players: { $in: ids } })
    if (taken.length) {
      const lines = ids.flatMap(id => {
        const team = taken.find(t => t.players.includes(id))
        return team ? [`<@${id}> ya está en **${team.name}**`] : []
      })
      return fail(`Nadie puede estar en más de un equipo:\n${lines.join('\n')}`)
    }

    const team = await Team.create({
      guildId: guild.id,
      name,
      captainId: captain.id,
      starters: starters.map(u => u.id),
      subs: subs.map(u => u.id),
      players: ids
    }).catch((error: any) => {
      if (error?.code === 11000) return null
      throw error
    })
    if (!team) return fail(`Ya existe un equipo llamado **${name}**. Elige otro nombre.`)

    const line = (id: string) => {
      const accs = verifications.filter(x => x.userId === id)
      return `<@${id}> · ${accs.map(v => `${v.playerName} \`${v.tag}\``).join(', ')}`
    }
    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle(`Nuevo equipo inscrito: ${name}`)
      .addFields(
        { name: 'Capitán', value: `<@${captain.id}>` },
        { name: 'Titulares', value: starters.map(u => line(u.id)).join('\n') },
        { name: 'Suplentes', value: subs.length ? subs.map(u => line(u.id)).join('\n') : 'Sin suplentes' }
      )
      .setTimestamp()

    await logTeam(guild, embed)
    return { ok: true, content: 'Equipo inscrito correctamente ✅', embeds: [embed] }
  } finally {
    ids.forEach(id => pending.delete(id))
  }
}

function verificationPanelPayload() {
  const container = new ContainerBuilder()
    .setAccentColor(0x22c55e)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# ✅ Verificación'),
      new TextDisplayBuilder().setContent(
        '**Vincula tu cuenta de Discord con tu cuenta de Brawl Stars** para obtener el rol de verificado y poder inscribirte en equipos.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '➡️ Pulsa **Verificar** e introduce tu tag de jugador (lo ves en tu perfil, debajo del nombre).',
          '-# Ejemplo: `#2PQ8LGY0`',
          `➡️ Puedes vincular hasta **${MAX_ACCOUNTS} cuentas**: pulsa **Verificar** otra vez con cada tag.`,
          '➡️ **Mis cuentas**: revisa todas tus cuentas vinculadas y desvincula las que quieras.',
          '➡️ **Actualizar**: refresca el nombre y los trofeos de tus cuentas y recupera el rol si lo has perdido.',
          '',
          'Si necesitas ayuda, no dudes en contactar con un miembro del staff.'
        ].join('\n')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row =>
      row.addComponents(
        new ButtonBuilder().setCustomId('insc-verificar').setLabel('Verificar').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('insc-cuentas').setLabel('Mis cuentas').setEmoji('🪪').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('insc-actualizar').setLabel('Actualizar').setEmoji('🔄').setStyle(ButtonStyle.Primary)
      )
    )

  return { flags: MessageFlags.IsComponentsV2 as const, components: [container] }
}

function inscriptionPanelPayload() {
  const container = new ContainerBuilder()
    .setAccentColor(0x3b82f6)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# 📝 Inscripciones de equipos'),
      new TextDisplayBuilder().setContent(
        'Los equipos son de **3 titulares** y hasta **2 suplentes** (opcionales). Quien inscribe el equipo es el capitán y cuenta como titular.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### 1️⃣ Verifícate en <#${VERIFICATION_CHANNEL_ID}>`,
          'Todos los miembros del equipo (suplentes incluidos) tienen que estar verificados con su cuenta de Brawl Stars.',
          '### 2️⃣ Inscribe tu equipo',
          'El capitán pulsa **Inscribir equipo**, pone el nombre y elige a los 2 titulares y, si quiere, hasta 2 suplentes.',
          '-# Nadie puede estar en más de un equipo.'
        ].join('\n')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row =>
      row.addComponents(
        new ButtonBuilder().setCustomId('insc-equipo').setLabel('Inscribir equipo').setEmoji('🛡️').setStyle(ButtonStyle.Primary)
      )
    )

  return { flags: MessageFlags.IsComponentsV2 as const, components: [container] }
}

type PanelKey = 'inscriptionPanelMessageId' | 'verificationPanelMessageId'

/** Publica un panel en su canal, o lo edita si el mensaje guardado sigue existiendo. */
async function publishPanel(client: Client, channelId: string, key: PanelKey, payload: ReturnType<typeof verificationPanelPayload>) {
  const channel = await client.channels.fetch(channelId).catch(() => null)
  if (!channel?.isSendable() || !('messages' in channel)) throw new Error(`Canal ${channelId} no disponible`)

  const config = await getGuildConfig()
  const savedId = config[key]
  if (savedId) {
    const message = await channel.messages.fetch(savedId).catch(() => null)
    if (message) {
      await message.edit(payload)
      return
    }
  }

  const message = await channel.send(payload)
  const updated = await GuildModel.findOneAndUpdate({ guildId: mainGuildId }, { $set: { [key]: message.id } }, { new: true })
  if (updated) setGuildConfigCache(updated)
}

/** Publica/actualiza el panel de verificación y el de inscripciones. */
export async function publishInscriptionPanel(client: Client): Promise<void> {
  await publishPanel(client, VERIFICATION_CHANNEL_ID, 'verificationPanelMessageId', verificationPanelPayload())
  await publishPanel(client, INSCRIPTIONS_CHANNEL_ID, 'inscriptionPanelMessageId', inscriptionPanelPayload())
}

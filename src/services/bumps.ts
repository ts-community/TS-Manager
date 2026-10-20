import {
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Client,
  type Message
} from 'discord.js'
import Bump, { type BumpService } from '../models/Bump'
import logger from '../utils/logger'

export const BUMP_SERVICES: Record<BumpService, { label: string, cooldownMs: number }> = {
  disboard: { label: 'Disboard', cooldownMs: 2 * 60 * 60 * 1000 },
  discadia: { label: 'Discadia', cooldownMs: 24 * 60 * 60 * 1000 }
}

const MENTION_REGEX = /<@!?(\d+)>/

export function getBumpService(message: Message): BumpService | null {
  if (!message.author.bot) return null
  const username = message.author.username.toLowerCase()
  if (username.includes('disboard')) return 'disboard'
  if (username.includes('discadia')) return 'discadia'
  return null
}

// Junta contenido + embeds + Components V2 (algunos bots ya no usan content/embeds)
function getMessageText(message: Message): string {
  let text = message.content || ''
  for (const embed of message.embeds) {
    text += ` ${embed.description || ''} ${embed.title || ''}`
  }
  if (message.components.length > 0) {
    try {
      text += ` ${JSON.stringify(message.components)}`
    } catch {
      // ignore serialization errors
    }
  }
  return text
}

export function isBumpMessage(message: Message, service: BumpService): boolean {
  const text = getMessageText(message).toLowerCase()
  // Ignora "Already bumped. You can bump again <t:X:R>."
  if (text.includes('already bumped')) return false

  if (text.includes('bump') && (text.includes('success') || text.includes('done') || text.includes('server bumped'))) {
    return true
  }
  // Formato nuevo de Discadia: "**Servidor** bumped. +1 Boost earned. ... Next bump <t:X:R>"
  return service === 'discadia' && (text.includes('boost earned') || /\bbumped\./.test(text))
}

export function getBumperId(message: Message): string | null {
  if (message.interactionMetadata) return message.interactionMetadata.user.id

  const match = message.content.match(MENTION_REGEX)
    ?? message.embeds.map(e => e.description?.match(MENTION_REGEX)).find(Boolean)
    ?? (message.components.length > 0 ? JSON.stringify(message.components).match(MENTION_REGEX) : null)

  return match?.[1] ?? null
}

export async function registerBump(message: Message, service: BumpService, bumperId: string): Promise<void> {
  const { label, cooldownMs } = BUMP_SERVICES[service]

  // Si el bot indica el próximo bump (<t:X:R>), el aviso sale justo a esa hora
  let bumpTime = Date.now()
  const nextBump = message.content.match(/next bump <t:(\d+)(?::\w)?>/i)
  if (nextBump) bumpTime = Number(nextBump[1]) * 1000 - cooldownMs

  await Bump.findOneAndUpdate(
    { service },
    { lastBumperId: bumperId, channelId: message.channelId, bumpTime: new Date(bumpTime), notified: false },
    { upsert: true }
  )

  if (!message.channel.isSendable()) return

  const nextBumpUnix = Math.floor((bumpTime + cooldownMs) / 1000)
  const container = new ContainerBuilder()
    .setAccentColor(0x9B4DFF)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## 💜 ¡Gracias por el bump!'),
      new TextDisplayBuilder().setContent(`<@${bumperId}>, gracias por bumpear **${message.guild?.name ?? 'el servidor'}** en **${label}** ✨`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`⏳ Próximo bump disponible <t:${nextBumpUnix}:R>`),
      new TextDisplayBuilder().setContent('🔔 Te avisaré automáticamente cuando sea el momento de volver a hacerlo'),
      new TextDisplayBuilder().setContent('-# Cada bump ayuda a que más gente descubra el servidor')
    )

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [bumperId] }
  })
}

export async function checkBumpReminders(client: Client): Promise<void> {
  for (const [service, { label, cooldownMs }] of Object.entries(BUMP_SERVICES) as [BumpService, typeof BUMP_SERVICES[BumpService]][]) {
    try {
      const bump = await Bump.findOne({ service, notified: false })
      if (!bump || Date.now() - bump.bumpTime.getTime() < cooldownMs) continue

      const channel = await client.channels.fetch(bump.channelId).catch(() => null)
      if (!channel?.isSendable()) continue

      const embed = new EmbedBuilder()
        .setTitle(`¡Es hora de bumpear en ${label}!`)
        .setDescription(
          `¡El cooldown de ${cooldownMs / (60 * 60 * 1000)} horas ha terminado!\n` +
          `Última persona que bumpeó: <@${bump.lastBumperId}>\n\n` +
          `Usa el comando \`/bump\` de ${label} para volver a posicionar el servidor.`
        )
        .setColor(0xE91E9C)

      await channel.send({ content: `<@${bump.lastBumperId}>`, embeds: [embed] })

      bump.notified = true
      await bump.save()
    } catch (error) {
      logger.error(`Bumps: error comprobando el recordatorio de ${label}`, {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}

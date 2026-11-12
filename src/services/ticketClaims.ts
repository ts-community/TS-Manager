import { ChannelType, type GuildMember, type Message, type TextChannel } from 'discord.js'
import { TICKET_CLAIM_MIN_ROLE_ID, TICKETS_BOT_ID, TICKETS_CATEGORY_ID } from '../config/tickets'
import logger from '../utils/logger'

type ClaimEvent = { action: 'claim' | 'unclaim'; username: string }

/** Lee el aviso de Guild Manager: «📌 **usuario** ha reclamado / ha retirado la reclamación del ticket.» */
export function parseClaimMessage(message: Message): ClaimEvent | null {
  if (message.author.id !== TICKETS_BOT_ID) return null
  const channel = message.channel
  if (channel.type !== ChannelType.GuildText || channel.parentId !== TICKETS_CATEGORY_ID) return null

  const text = message.embeds.map(embed => embed.description ?? '').join('\n')
  const match = text.match(/\*\*(.+?)\*\*\s+ha\s+(reclamado el ticket|retirado la reclamación del ticket)/i)
  if (!match) return null
  return { action: match[2].toLowerCase().startsWith('reclamado') ? 'claim' : 'unclaim', username: match[1].trim() }
}

async function findMember(channel: TextChannel, username: string): Promise<GuildMember | null> {
  const lower = username.toLowerCase()
  const cached = channel.guild.members.cache.find(m => m.user.username.toLowerCase() === lower)
  if (cached) return cached
  const found = await channel.guild.members.fetch({ query: username, limit: 10 }).catch(() => null)
  return found?.find(m => m.user.username.toLowerCase() === lower) ?? null
}

/**
 * Al reclamar, los roles de staff por debajo de Instructor que tienen acceso al ticket
 * dejan de poder escribir (quien reclama sí puede). Al retirar la reclamación se devuelve.
 */
export async function applyTicketClaim(message: Message, event: ClaimEvent): Promise<void> {
  const channel = message.channel as TextChannel
  const guild = channel.guild
  const minRole = guild.roles.cache.get(TICKET_CLAIM_MIN_ROLE_ID)
  if (!minRole) {
    logger.warn(`Tickets: no existe el rol mínimo ${TICKET_CLAIM_MIN_ROLE_ID}`)
    return
  }

  const lowerStaffRoles = channel.permissionOverwrites.cache
    .filter(overwrite => overwrite.type === 0 && overwrite.id !== guild.id)
    .map(overwrite => guild.roles.cache.get(overwrite.id))
    .filter((role): role is NonNullable<typeof role> => !!role && role.position < minRole.position)

  const claim = event.action === 'claim'
  for (const role of lowerStaffRoles) {
    await channel.permissionOverwrites.edit(role, { SendMessages: !claim }, { reason: `Ticket ${claim ? 'reclamado' : 'liberado'} por ${event.username}` })
  }

  const claimer = await findMember(channel, event.username)
  if (claimer && claimer.roles.highest.position < minRole.position) {
    if (claim) {
      await channel.permissionOverwrites.edit(claimer, { ViewChannel: true, SendMessages: true }, { reason: 'Ticket reclamado' })
    }
  } else if (!claimer) {
    logger.warn(`Tickets: no se encontró al usuario «${event.username}» que ${claim ? 'reclamó' : 'liberó'} #${channel.name}`)
  }

  logger.info(`Tickets: #${channel.name} ${claim ? 'reclamado' : 'liberado'} por ${event.username} (${lowerStaffRoles.map(r => r.name).join(', ') || 'sin roles por debajo'})`)
}

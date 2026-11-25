import { UserFlags, type Message } from 'discord.js'
import type { BumpService } from '../models/Bump'
import { staffChannels as channels } from '../config/staffChannels'

// Corte acordado con el propietario, Europe/Madrid 21/11/2026 11:36:18.
export const BUMP_COVERAGE_START = '2026-11-21T10:36:18.000Z'

export function providerMatches(message: Message, service: BumpService) {
  const author=message.author
  if(!author.bot || (message.applicationId && message.applicationId!==author.id))return false
  const configured=service==='disboard'?process.env.STAFF_DISBOARD_APP_ID:process.env.STAFF_DISCADIA_APP_ID
  if(configured)return author.id===configured
  // Los roles de integración administrados por Discord están enlazados al ID del bot.
  const role=message.guild?.roles.cache.find(r=>r.managed && r.tags?.botId===author.id)
  const handle=author.username.toLowerCase(),official=service==='disboard'?['disboard','disboard.org']:['discadia']
  return !!role && !!author.flags?.has(UserFlags.VerifiedBot) && official.includes(handle) && official.includes(role.name.toLowerCase())
}

export function eligibleBump(message:Message,service:BumpService) {
  return message.guildId===channels.guild && message.channelId===channels.bumps &&
    message.createdTimestamp>=Date.parse(BUMP_COVERAGE_START) && providerMatches(message,service)
}

/** Discord puede entregar el autor sin flags o aún sin el rol de integración en caché. */
export async function verifiedBump(message:Message,service:BumpService){
  if(eligibleBump(message,service))return true
  if(!message.guild || message.guildId!==channels.guild || message.channelId!==channels.bumps ||
    message.createdTimestamp<Date.parse(BUMP_COVERAGE_START) || !message.author.bot)return false
  if(service==='disboard'?process.env.STAFF_DISBOARD_APP_ID:process.env.STAFF_DISCADIA_APP_ID)return false
  await Promise.all([message.author.fetch(true),message.guild.roles.fetch()]).catch(()=>null)
  return eligibleBump(message,service)
}

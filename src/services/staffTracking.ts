import mongoose from 'mongoose'
import {BUMP_COVERAGE_START} from './bumpCredit'
import type { Client, GuildMember } from 'discord.js'
import { guildId } from '../config/env'
import { getGuildConfig } from './guild'

const madrid = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' })
const DAY = 86_400_000

export async function countStaffMessage(member: GuildMember, timestamp: number, messageId: string) {
  if (member.guild.id !== guildId || member.user.bot) return
  const { staffRoleIds } = await getGuildConfig()
  if (!staffRoleIds.some(id => member.roles.cache.has(id))) return
  const day = madrid.format(timestamp)
  const daily = mongoose.connection.collection<{ _id: string; day: string; userId: string; guildId: string; messages: number; seen: string[] }>('staff_daily')
  const key = { _id: [guildId, member.id, day].join(':'), seen: { $ne: messageId } }
  const update = { $inc: { messages: 1 }, $addToSet: { seen: messageId }, $setOnInsert: { guildId, userId: member.id, day } }
  try {
    await daily.updateOne(key, update, { upsert: true })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    // A replay or a concurrent first message may find the day's document already created.
    await daily.updateOne(key, update)
  }
}

export function hasTrialRole(member: GuildMember) {
  return member.roles.cache.some(role => process.env.STAFF_TRIAL_ROLE_ID
    ? role.id === process.env.STAFF_TRIAL_ROLE_ID
    : role.name.toLocaleLowerCase('es').includes('staff en pruebas'))
}

export async function updateTrial(member: Pick<GuildMember, 'guild' | 'user' | 'id'>, active: boolean, now = Date.now(), observed = false) {
  if (member.guild.id !== guildId || member.user.bot) return
  const trials = mongoose.connection.collection<{ _id: string; start: Date; deadline: Date; guildId: string; userId: string; closedAt?: Date|null; history?: object[] }>('staff_trials')
  const key = { _id: guildId + ':' + member.id }
  if (!active) {
    await trials.updateOne({ ...key, closedAt:null }, { $set: {closedAt:new Date(now)} })
    return
  }
  const previous=await trials.findOne({...key,closedAt:{$type:'date'}})
  if(previous){
    await trials.updateOne({...key,closedAt:previous.closedAt},{$push:{history:{start:previous.start,deadline:previous.deadline,closedAt:previous.closedAt}},$unset:{closedAt:1,reason:1,by:1},$set:{observed,start:new Date(now),deadline:new Date(now+14*DAY)}})
    return
  }
  await trials.updateOne(key, { $setOnInsert: {
    guildId, userId: member.id, observed, start: new Date(now), deadline: new Date(now + 14 * DAY)
  } }, { upsert: true })
}

export async function recordContribution(guild: GuildMember['guild'], userId: string, kind: 'bumps' | 'alliances' | 'affiliations' | 'associations' | 'renewals' | 'welcomes', sourceId: string, at = Date.now(), metadata:Record<string,unknown> = {}) {
  if (guild.id !== guildId) return
  const { staffRoleIds } = await getGuildConfig()
  const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null)
  if (!member || !staffRoleIds.some(id => member.roles.cache.has(id))) return
  const store=mongoose.connection.collection<any>('staff_contributions')
  if(kind==='bumps'){
    await store.updateOne({_id:'bumps:'+sourceId,guildId,userId,at:{$exists:false},manualDecision:{$exists:false}},
      {$set:{...metadata,sourceId,at:new Date(at),status:'credited'}})
  }
  await store.updateOne({ _id: kind + ':' + sourceId }, { $setOnInsert: { ...metadata,guildId, userId, day: madrid.format(at), kind,sourceId,at:new Date(at),status:'credited' } }, { upsert: true })
  if(kind==='bumps')await mongoose.connection.collection<any>('staff_source_health').updateOne({_id:guildId+':bumps'},{$setOnInsert:{guildId,kind,since:new Date(BUMP_COVERAGE_START)},$max:{lastSuccess:new Date(at)},$set:{error:''}},{upsert:true})
}

export async function reconcileTrials(client: Client) {
  const guild = await client.guilds.fetch(guildId)
  const observedAt = Date.now()
  const members = await guild.members.fetch()
  const active = members.filter(member => !member.user.bot && hasTrialRole(member))
  await Promise.all(active.map(member => updateTrial(member, true, observedAt, true)))
  await mongoose.connection.collection('staff_trials').updateMany({
    guildId, closedAt:null, userId: { $nin: [...active.keys()] }, start: { $lt: new Date(observedAt) }
  }, { $set: {closedAt:new Date(observedAt)} })
}

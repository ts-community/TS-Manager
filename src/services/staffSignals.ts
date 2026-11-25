import mongoose from 'mongoose'
import type {GuildMember,Message,PartialMessage} from 'discord.js'
import {MessageFlags} from 'discord.js'
import {staffChannels as ch} from '../config/staffChannels'
import {getGuildConfig} from './guild'

const db=()=>mongoose.connection.db!
const entries=()=>db().collection<any>('staff_contributions')
const joins=()=>db().collection<any>('staff_joins')
const day=(at:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(at)
export const ingestion=()=>process.env.STAFF_INGEST_ENABLED==='1'
export function templateServer(content:string) {
  if(/(?:cómo (?:se )?hac|paso \d|abre un ticket|nuestra plantilla|ejemplo de plantilla)/i.test(content))return null
  const invite=content.match(/(?:https?:\/\/)?(?:discord\.gg\/|discord\.com\/invite\/)([\w-]{2,})/i)
  const lines=content.trim().split(/\r?\n/).filter(s=>s.trim())
  if(!invite||lines.length<3||content.replace(/https?:\/\/\S+/g,'').length<35)return null
  return invite[1]
}
const welcome=/\b(bienvenid[oa]s?|bienvenid[oa]s? al servidor|welcome)\b/i
export async function joinObserved(member:GuildMember,welcomeId?:string) {
  if(!ingestion()||member.guild.id!==ch.guild||member.user.bot)return
  const at=member.joinedAt||new Date(), key=member.id+':'+(+at)
  await joins().updateOne({_id:key},{$setOnInsert:{guildId:ch.guild,userId:member.id,at,day:day(at)},...(welcomeId?{$set:{welcomeId}}:{})},{upsert:true})
}
export async function sourceSeen(kind:string,at=new Date()){
  await db().collection<any>('staff_source_health').updateOne({_id:ch.guild+':'+kind},{$setOnInsert:{guildId:ch.guild,kind,since:at},$set:{lastSuccess:at,error:''}},{upsert:true})
}
async function staffMember(m:Message){
  return !!m.member && (await getGuildConfig()).staffRoleIds.some(id=>m.member!.roles.cache.has(id))
}
async function save(m:Message,kind:string,identity:string,metadata:Record<string,unknown>={},historical=false){
  const key=kind+':'+identity, row=await entries().findOne({_id:key})
  const fresh=await staffMember(m)
  if(!fresh && !m.webhookId && !historical)return
  const status=historical||m.webhookId?'review':'credited'
  const value={guildId:ch.guild,userId:m.author.id,kind,day:day(m.createdAt),sourceId:m.id,channelId:m.channelId,at:m.createdAt,rule:kind+'-v1',...metadata}
  try{await entries().updateOne({_id:key},{$addToSet:{sourceIds:m.id},$setOnInsert:{...value,status}},{upsert:true})}
  catch(e){if((e as {code:number}).code!==11000)throw e;await entries().updateOne({_id:key},{$addToSet:{sourceIds:m.id}})}
  if(row?.status==='revoked'&&!row.manualDecision)await entries().updateOne({_id:key,manualDecision:{$exists:false}},{$set:{...value,status}})
  await sourceSeen(kind)
}
export async function captureSignal(m:Message,historical=false) {
  if(!ingestion()||m.guildId!==ch.guild||m.author.bot&&!m.webhookId||m.flags.has(MessageFlags.IsCrosspost))return
  const partnership=m.channelId===ch.alliances?'alliances':m.channelId===ch.affiliations?'affiliations':''
  if(partnership) {
    const server=templateServer(m.content)
    if(!server || (partnership==='affiliations'&&!/@everyone\b/.test(m.content)))return
    await save(m,partnership,[ch.guild,server,day(m.createdAt)].join(':'),{server},historical)
  } else if(m.channelId===ch.general && !m.webhookId && welcome.test(m.content) && !/de vuelta|otra vez|^\s*>/i.test(m.content)){
    const ids=[...m.mentions.users.keys()]
    const matches=await joins().find({guildId:ch.guild,at:{$lte:m.createdAt,$gte:new Date(m.createdTimestamp-86400000)},
      $or:[{userId:{$in:ids}},{welcomeId:m.reference?.messageId||'-'}]}).toArray()
    for(const joined of matches)await save(m,'welcomes',[m.author.id,joined._id].join(':'),{joinId:joined._id},historical)
  }
}
export async function observeDue(associationId:string,due:Date) {
  if(!ingestion())return
  const cycle=day(due),key=associationId+':'+cycle
  await db().collection<any>('staff_renewal_cycles').updateOne({_id:key},{$setOnInsert:{guildId:ch.guild,associationId,due,cycle,observedAt:new Date()}},{upsert:true})
}
export async function renewal(m:Message,association:{id:string;nextRenovationDate:Date;staffEncargadoId:string|null}) {
  if(!ingestion()||m.guildId!==ch.guild||m.author.bot)return
  if(day(association.nextRenovationDate)<=day(m.createdAt))await observeDue(association.id,association.nextRenovationDate)
  if(!templateServer(m.content)||!await staffMember(m))return
  const receipt=await db().collection<any>('staff_renewal_sources').findOneAndUpdate({_id:m.id},{$setOnInsert:{guildId:ch.guild,associationId:association.id,due:association.nextRenovationDate}},{upsert:true,returnDocument:'after'})
  const due=new Date(receipt!.due)
  await observeDue(association.id,due)
  await save(m,'renewals',association.id+':'+day(due),{associationId:association.id,responsibleId:association.staffEncargadoId,due,cycle:day(due),onTime:day(m.createdAt)<=day(due)})
}
export async function retireSource(m:Message|PartialMessage) {
  if(!ingestion()||m.guildId!==ch.guild)return
  const rows=await entries().find({guildId:ch.guild,sourceIds:m.id}).toArray()
  for(const r of rows){
    await entries().updateOne({_id:r._id},{$pull:{sourceIds:m.id} as any})
    await entries().updateOne({_id:r._id,'sourceIds.0':{$exists:false},manualDecision:{$exists:false}},{$set:{status:'revoked',withdrawn:true}})
  }
}
export async function updateSource(m:Message|PartialMessage) {
  if(!ingestion()||m.guildId!==ch.guild||![ch.general,ch.alliances,ch.affiliations].some(id=>m.channelId===id))return
  const msg=m.partial?await m.fetch():m
  await retireSource(msg)
  await captureSignal(msg)
}

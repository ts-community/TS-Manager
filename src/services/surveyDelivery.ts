import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits as P, type Client, type Guild, type ThreadChannel } from 'discord.js'
import mongoose from 'mongoose'
import { randomUUID, createHash } from 'node:crypto'
import { staffChannels as ch } from '../config/staffChannels'
import { getGuildConfig } from './guild'
import { staffApi } from './staffApi'
import { greenEmbed } from './asociaciones'
import { boardSignature, describe, renderBoard, type Week, type Shift } from './surveyBoard'

const state=()=>mongoose.connection.db!.collection<any>('staff_operations_state')
const dayAt=(at:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(at)
export const nativePollsEnabled=()=>process.env.STAFF_INGEST_ENABLED==='1'
const url=(s:Shift)=>'https://panel.tscomunity.es/encuestas?fecha='+s.localDay
const token=(key:string)=>createHash('sha256').update(key).digest('hex').slice(0,24)
const row=new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('staff-survey:mine').setLabel('Mis encuestas').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('staff-survey:week').setLabel('Ver semana').setStyle(ButtonStyle.Secondary))
export async function thread(guild:Guild,spec:typeof ch.agenda|typeof ch.pollLogs,board=false) {
  const target=await guild.channels.fetch(spec.id,{force:true})
  const me=await guild.members.fetchMe()
  if(guild.id!==ch.guild || !target?.isThread() || target.parentId!==spec.parent || target.locked || !target.permissionsFor(me)?.has([P.ViewChannel,P.ReadMessageHistory,P.SendMessagesInThreads,...(board?[P.AttachFiles]:[])])) throw Error('Hilo o permisos de Discord no disponibles.')
  if(board) {
    const [members,config]=await Promise.all([guild.members.fetch(),getGuildConfig()])
    if(!config.staffRoleIds.length || !target.parent) throw Error('Audiencia de la agenda sin verificar.')
    const membership=target.type===ChannelType.PrivateThread?await target.members.fetch():null
    const publicViewer=members.some(m=>!m.user.bot && !m.roles.cache.some(r=>config.staffRoleIds.includes(r.id)) &&
      target.parent!.permissionsFor(m)?.has(P.ViewChannel) && (!membership||membership.has(m.id)||m.permissions.has(P.ManageThreads)))
    if(publicViewer)throw Error('Hay miembros ajenos al staff con acceso a la agenda.')
  }
  return target
}
export async function lease<T>(key:string,work:(record:any)=>Promise<T>) {
  const owner=randomUUID(),now=new Date()
  let record
  try {record=await state().findOneAndUpdate({_id:key,$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lte:now}}]},
    {$set:{owner,leaseUntil:new Date(+now+180000),guildId:ch.guild},$setOnInsert:{startedAt:now}},{upsert:true,returnDocument:'after'})}
  catch(e){if((e as {code:number}).code===11000)return;throw e}
  if(!record)return
  try{return await work(record)}
  catch(e){await state().updateOne({_id:key,owner},{$set:{error:e instanceof Error?e.message:'Entrega pendiente',failedAt:new Date()}});throw e}
  finally{await state().updateOne({_id:key,owner},{$unset:{leaseUntil:1,owner:1}})}
}
async function history(channel:ThreadChannel,marker:string,since:Date) {
  let before:string|undefined
  for(let i=0;i<25;i++){
    const messages=await channel.messages.fetch({limit:100,...(before?{before}:{})})
    const found=messages.find(m=>m.author.id===channel.client.user.id && m.content.includes(marker))
    if(found)return found
    const last=messages.last()
    if(messages.size<100||!last||last.createdTimestamp<+since)return null
    before=last.id
  }
  throw Error('Historial incompleto. Entrega pendiente de revisión.')
}
async function existing(target:ThreadChannel,record:any,marker:string) {
  if(record.messageId) {
    try{return await target.messages.fetch(record.messageId)}
    catch(e){if((e as {code:number}).code!==10008)throw e}
  }
  return history(target,marker,record.startedAt)
}
async function poster(guild:Guild,w:Week) {
  const key='poster:'+ch.guild,digest=boardSignature(w)
  await lease(key,async record=>{
    if(record.signature===digest && !record.error)return
    const target=await thread(guild,ch.agenda,true),marker='Agenda de encuestas · TS'
    const old=await existing(target,record,marker)
    let png:Buffer|undefined
    try{png=await renderBoard(w)}catch{}
    // Solo la imagen; el texto queda como respaldo si no se pudo generar.
    const content=png?'':'**'+marker+'**\n'+w.items.map(s=>describe(w,s).slice(0,230)).join('\n')
    const files=png?[new AttachmentBuilder(png,{name:'agenda.png',description:'Reparto de lunes a domingo. Ver semana muestra los nombres completos y el estado de cada día.'})]:[]
    const body={content,components:[row],allowedMentions:{parse:[] as never[]},files}
    const message=old?await old.edit({...body,attachments:[]}):await target.send({...body,nonce:token(key),enforceNonce:true})
    await state().updateOne({_id:key,owner:record.owner},{$set:{signature:png?digest:null,messageId:message.id,threadId:target.id,name:target.name,url:message.url,lastSuccess:new Date(),error:png?'':'Imagen pendiente de reintento.'}})
  })
}
export async function reconcilePolls(guild:Guild,day:string) {
  const target=await guild.channels.fetch(ch.polls)
  if(target?.type!==ChannelType.GuildText || !target.permissionsFor(await guild.members.fetchMe())?.has([P.ViewChannel,P.ReadMessageHistory])) throw Error('Historial de encuestas no disponible.')
  const pending:{messageId:string;authorId:string;at:Date}[]=[]
  let before:string|undefined
  for(let page=0;page<25;page++){
    const messages=await target.messages.fetch({limit:100,...(before?{before}:{})})
    const pollMessages=messages.filter(m=>!m.author.bot&&!!m.poll&&dayAt(m.createdAt)===day)
    // El historial llega de más reciente a más antiguo. No se acredita hasta conocer el día completo.
    for(const m of pollMessages.values()) pending.push({messageId:m.id,authorId:m.author.id,at:m.createdAt})
    const oldest=messages.last()
    if(!oldest||messages.size<100||dayAt(oldest.createdAt)<day) {
      for(const m of pending.sort((a,b)=>+a.at-+b.at||a.messageId.localeCompare(b.messageId))) await staffApi(null,'surveys/publication',m)
      return
    }
    before=oldest.id
  }
  throw Error('Día sin conciliar. Aviso en revisión.')
}
export async function deliver(guild:Guild,day:string) {
  if(day!==dayAt(new Date()))return
  const key='reminder:'+ch.guild+':'+day
  await lease(key,async record=>{
    if(record.completed)return
    const fetchShift=async()=>(await staffApi<Week>(null,'surveys/week?from='+day+'&to='+day)).items[0]
    let shift=await fetchShift()
    if(record.result===shift.noticeRevision && !record.error)return
    if(!['published','cancelled'].includes(shift.status)) {
      await reconcilePolls(guild,day)
      shift=await fetchShift()
    }
    const target=await thread(guild,ch.pollLogs),marker='Turno de encuestas · '+day
    const message=await existing(target,record,marker)
    if(shift.status==='published'||shift.status==='cancelled'){
      if(message)await message.edit({content:marker+' · '+(shift.status==='published'?'Publicada':'Suspendida'),embeds:[],allowedMentions:{parse:[]}})
      await state().updateOne({_id:key,owner:record.owner},{$set:{completed:true,lastSuccess:new Date(),error:''}})
      return
    }
    const revision=shift.noticeRevision, recipient=shift.effectiveId
    const content=marker+' · '+(recipient?'<@'+recipient+'> te toca publicar.':'Sin cobertura. Se necesita una reasignación.')+' '+url(shift)
    let sent=message
    if(!message || message.content!==content) {
      const current=await fetchShift()
      if(current.noticeRevision!==revision ||current.effectiveId!==recipient||dayAt(new Date())!==day)return
      // Un cambio de responsable necesita su propia mención; el mensaje anterior queda marcado como relevado.
      const markerForRevision=token(key+':'+revision)
      const recovered=message?.content===content?message:await history(target,content,record.startedAt)
      const calendarDay=new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Madrid'}).format(new Date(day+'T12:00:00Z'))
      const embed=greenEmbed().setTitle('Encuesta del '+calendarDay).setURL(url(shift))
        .setDescription(recipient?'Publica la encuesta de hoy en <#'+ch.polls+'>.':'El turno necesita una persona disponible.')
        .setTimestamp()
      sent=recovered||await target.send({content,embeds:[embed],allowedMentions:{users:recipient?[recipient]:[],parse:[]},nonce:markerForRevision,enforceNonce:true})
      if(message&&sent.id!==message.id)await message.edit({content:marker+' · Relevado',embeds:[],allowedMentions:{parse:[]}})
    }
    await state().updateOne({_id:key,owner:record.owner},{$set:{result:revision,messageId:sent!.id,recipient,day,lastSuccess:new Date(),error:''}})
  })
}
let reconciledDay = ''
export function invalidateSurveyHistory() {reconciledDay=''}
export async function syncSurveys(client:Client) {
  if(!nativePollsEnabled() && process.env.STAFF_SURVEY_BOARD_ENABLED!=='1')return
  const guild=await client.guilds.fetch(ch.guild),today=dayAt(new Date())
  if(nativePollsEnabled() && reconciledDay!==today) {
    await reconcilePolls(guild,today)
    reconciledDay=today
  }
  if(process.env.STAFF_SURVEY_BOARD_ENABLED==='1')await poster(guild,await staffApi<Week>(null,'surveys/week'))
}

export async function checkDueSurveys(client:Client) {
  if(process.env.STAFF_SURVEY_REMINDERS_ENABLED!=='1' || !nativePollsEnabled())return
  const guild=await client.guilds.fetch(ch.guild)
  await deliver(guild,dayAt(new Date()))
}

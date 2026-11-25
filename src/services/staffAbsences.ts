import {ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, type Message, type PartialMessage, type ButtonInteraction, type ModalSubmitInteraction} from 'discord.js'
import mongoose from 'mongoose'
import {staffChannels as ch} from '../config/staffChannels'
import {staffApi} from './staffApi'
import {staffRank} from './permissions'

const sources=()=>mongoose.connection.db!.collection<any>('staff_absence_receipts')
export function parseAbsence(content:string) {
  const clean=content.normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff\ufe0f_*~`]/g,'').trim()
  if(!/parte\s+de\s+inactividad/i.test(clean))return null
  const duration=clean.match(/duraci[oó]n\s*:\s*([^\r\n]*)/i)?.[1]?.trim()||''
  const reason=clean.match(/motivo\s*:\s*([^\r\n]*)/i)?.[1]?.trim()||''
  const dates=duration.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const iso=(d:string,m:string,y:string)=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')
  const valid=(s:string)=>!Number.isNaN(Date.parse(s+'T12:00Z'))&&new Date(s+'T12:00Z').toISOString().slice(0,10)===s
  const start=dates?iso(dates[1],dates[2],dates[3]):'',end=dates?iso(dates[4],dates[5],dates[6]):''
  return {duration,reason,start,end,valid:!!dates&&valid(start)&&valid(end)&&start<=end}
}
export async function ingestAbsence(msg:Message|PartialMessage) {
  if(process.env.STAFF_INGEST_ENABLED!=='1'||msg.guildId!==ch.guild||msg.channelId!==ch.absences)return
  const m=msg.partial?await msg.fetch():msg
  if(m.author.bot || !m.guild || !m.member)return
  const parsed=parseAbsence(m.content)
  if(!parsed || !(await staffRank({guild:m.guild,user:m.author})).staff)return
  const time=m.editedTimestamp||m.createdTimestamp
  const old=await sources().findOne({_id:m.id})
  if(old?.time>=time)return
  let content='Revisa las fechas del parte antes de activar la ausencia.',recordId=old?.recordId
  if(parsed.valid) {
    const result=await staffApi<{_id:string}>(m.author.id,'absences',{...parsed,messageId:m.id,sourceTime:time})
    content='Ausencia registrada del '+parsed.start+' al '+parsed.end+' (ambos incluidos).'
    recordId=result._id
  }
  const components=parsed.valid?[]:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('absence-fix:'+m.id).setStyle(ButtonStyle.Primary).setLabel('Corregir fechas'))]
  const reply=old?.ack?await m.channel.messages.fetch(old.ack).catch(()=>null):null
  const body={content,components,allowedMentions:{parse:[] as never[],repliedUser:false}}
  const ack=reply?await reply.edit(body):await m.reply({...body,nonce:m.id,enforceNonce:true})
  await sources().updateOne({_id:m.id},{$set:{guildId:ch.guild,userId:m.author.id,recordId,time,ack:ack.id}},{upsert:true})
}
export async function deletedAbsence(msg:Message|PartialMessage) {
  if(process.env.STAFF_INGEST_ENABLED!=='1'||msg.guildId!==ch.guild || msg.channelId!==ch.absences)return
  const receipt=await sources().findOne({_id:msg.id})
  if(!receipt?.recordId)return
  const {items}=await staffApi<{items:{_id:string;revision:number}[]}>(receipt.userId,'absences')
  const row=items.find(a=>a._id===receipt.recordId)
  if(row)await staffApi(receipt.userId,'absences/'+row._id+'/source-deleted',{revision:row.revision})
}
export async function correctAbsence(i:ButtonInteraction|ModalSubmitInteraction) {
  const id=i.customId.split(':')[1]
  if(i.guildId!==ch.guild || i.channelId!==ch.absences || !(await staffRank(i)).staff)return i.reply({content:'Parte no disponible.',flags:MessageFlags.Ephemeral})
  const original=await i.channel?.messages.fetch(id).catch(()=>null)
  if(!original ||original.author.id!==i.user.id)return i.reply({content:'Solo el autor puede corregir estas fechas.',flags:MessageFlags.Ephemeral})
  const parsed=parseAbsence(original.content)
  if(i.isButton()){
    const field=new TextInputBuilder().setCustomId('duration').setLabel('Desde dd/mm/aaaa hasta dd/mm/aaaa (con guion)').setStyle(TextInputStyle.Short).setRequired(true).setValue(parsed?.duration.slice(0,80)||'')
    return i.showModal(new ModalBuilder().setCustomId('absence-fix:'+id).setTitle('Corregir fechas').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)))
  }
  const fix=parseAbsence('PARTE DE INACTIVIDAD\nDuración: '+i.fields.getTextInputValue('duration'))
  if(!fix?.valid)return i.reply({content:'Comprueba ambos días, meses y años.',flags:MessageFlags.Ephemeral})
  const record=await staffApi<{_id:string}>(i.user.id,'absences',{start:fix.start,end:fix.end,reason:parsed?.reason||'',messageId:id,sourceTime:Date.now()})
  await sources().updateOne({_id:id},{$set:{recordId:record._id}})
  return i.reply({content:'Ausencia registrada del '+fix.start+' al '+fix.end+'.',flags:MessageFlags.Ephemeral})
}

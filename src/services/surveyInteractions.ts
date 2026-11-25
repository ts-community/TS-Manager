import {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,StringSelectMenuBuilder,UserSelectMenuBuilder,type ButtonInteraction,type ChatInputCommandInteraction,type StringSelectMenuInteraction,type UserSelectMenuInteraction} from 'discord.js'
import mongoose from 'mongoose'
import {randomUUID} from 'node:crypto'
import {staffApi} from './staffApi'
import {staffRank} from './permissions'
import {weekdays,display,describe,label,type Week} from './surveyBoard'

type UI=ButtonInteraction|ChatInputCommandInteraction|StringSelectMenuInteraction|UserSelectMenuInteraction
type Draft={_id:string;actor:string;primaryId:string|null;backupIds:string[];weekday:number;localDay:string;scope:string;revision:number;action:string;expiresAt:Date}
const drafts=()=>mongoose.connection.db!.collection<Draft>('staff_survey_drafts')
const btn=(customId:string,text:string,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId(customId).setLabel(text).setStyle(style)
const send=(i:UI,content:string,components:any[]=[])=>i.reply({content,components,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}})
async function draftCard(i:UI,d:Draft,w:Week) {
  const code='staff-survey:', buttons=new ActionRowBuilder<ButtonBuilder>().addComponents(btn(code+'save:'+d._id,'Confirmar',ButtonStyle.Primary))
  const components:any[]=[]
  if(d.action!=='cancel'){
    const primary=new UserSelectMenuBuilder().setCustomId(code+'primary:'+d._id).setPlaceholder('Cambiar titular').setMaxValues(1)
    const backups=new UserSelectMenuBuilder().setCustomId(code+'backups:'+d._id).setPlaceholder('Elegir refuerzos').setMinValues(0).setMaxValues(25)
    if(d.backupIds.length)backups.setDefaultUsers(d.backupIds)
    components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(primary),new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(backups))
    if(d.backupIds.length>1)components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(code+'first:'+d._id).setPlaceholder('Mover un refuerzo al primer puesto').addOptions(d.backupIds.map(id=>({label:display(w,id).slice(0,100),value:id})))))
  }
  components.push(buttons)
  const text=(d.action==='cancel'?'Cancelar · ':'Reparto · ')+(d.scope==='template'?'Todos los '+weekdays[d.weekday-1].toLowerCase():'Solo esta semana · '+d.localDay)+'\nTitular · '+display(w,d.primaryId)+'\nRefuerzos · '+(d.backupIds.map(id=>display(w,id)).join(' → ')||'Sin refuerzos')
  if(i.isMessageComponent())return i.update({content:text,components,allowedMentions:{parse:[]}})
  return send(i,text,components)
}
export async function surveysInteraction(i:UI) {
  const rank=await staffRank(i)
  if(!rank.staff)return send(i,'Se requiere un rol de staff de TS.')
  const parts=i.isChatInputCommand()?[]:i.customId.split(':')
  const op=i.isChatInputCommand()?i.options.getSubcommand():parts[1]
  const w=await staffApi<Week>(i.user.id,'surveys')
  if(['mine','week','semana','mis-turnos'].includes(op)){
    const personal=op==='mine'||op==='mis-turnos'
    const shifts=personal?w.items.filter(s=>[s.primaryId,...s.backupIds].includes(i.user.id)):w.items
    const page=Math.min(shifts.length-1,Math.max(0,Number(parts[2])||0)),s=shifts[page]
    const nav=new ActionRowBuilder<ButtonBuilder>()
    if(page>0)nav.addComponents(btn('staff-survey:'+(personal?'mine':'week')+':'+(page-1),'Anterior'))
    if(page+1<shifts.length)nav.addComponents(btn('staff-survey:'+(personal?'mine':'week')+':'+(page+1),'Siguiente'))
    if(personal)nav.addComponents(btn('staff-survey:week','Ver semana'))
    if(w.sync?.url) nav.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(w.sync.url).setLabel('Abrir cartel'))
    const rows:any[]=nav.components.length?[nav]:[]
    if(s?.effectiveId===i.user.id && ['pending','confirmed'].includes(s.status))rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btn('staff-survey:confirm:'+s.localDay+':'+s.revision,'Confirmar turno'),btn('staff-survey:request-cover:'+s.localDay+':'+s.revision,'Pedir relevo')))
    const content=s?describe(w,s)+(personal?'\n'+(s.publication?'Publicada por '+display(w,s.publication.authorId):s.effectiveId===i.user.id?'Te toca publicar':s.primaryId===i.user.id?'Titular':'Refuerzo del '+weekdays[s.weekday-1].toLowerCase()):''):'No tienes turnos esta semana.'
    return send(i,content.slice(0,1950),rows)
  }
  if(['confirm','request-cover'].includes(op)){
    await staffApi(i.user.id,'surveys/'+parts[2]+'/'+op,{revision:Number(parts[3])})
    return send(i,op==='confirm'?'Turno confirmado.':'Relevo solicitado.')
  }
  if(!rank.instructor)return send(i,'Se requiere Instructor o superior.')
  if(i.isChatInputCommand()){
    const weekday=i.options.getInteger('dia',true), s=w.items.find(day=>day.weekday===weekday)!
    const scope=op==='asignar'?'template':i.options.getString('alcance',true)
    const source=scope==='template'?w.templates.find(r=>r.weekday===weekday):s
    const d:Draft={_id:randomUUID(),actor:i.user.id,weekday,scope,localDay:s.localDay,action:op==='cancelar'?'cancel':'assign',
      revision:source?.revision||0,primaryId:i.options.getUser('titular')?.id||source?.primaryId||null,backupIds:source?.backupIds||[],expiresAt:new Date(Date.now()+900000)}
    await drafts().createIndex({expiresAt:1},{expireAfterSeconds:0})
    await drafts().insertOne(d)
    return draftCard(i,d,w)
  }
  const d=await drafts().findOne({_id:parts[2],actor:i.user.id,expiresAt:{$gt:new Date()}})
  if(!d)return send(i,'El formulario ha caducado. Abre de nuevo el turno.')
  if(op==='save'){
    const template=d.scope==='template'
    const value=d.action==='cancel'?{primaryId:null,backupIds:[]}:{primaryId:d.primaryId,backupIds:d.backupIds}
    await staffApi(i.user.id,template?'surveys/templates/'+d.weekday:'surveys/'+d.localDay+'/'+d.action,{...value,revision:d.revision},template?'PUT':'POST')
    await drafts().deleteOne({_id:d._id})
    return i.update({content:'Reparto actualizado. '+(w.sync?.url||'El cartel está pendiente de sincronización.'),components:[]})
  }
  if(!i.isAnySelectMenu())return
  if(op==='primary')d.primaryId=i.values[0]
  if(op==='backups')d.backupIds=[...d.backupIds.filter(id=>i.values.includes(id)),...i.values.filter(id=>!d.backupIds.includes(id))]
  if(op==='first')d.backupIds=[i.values[0],...d.backupIds.filter(id=>id!==i.values[0])]
  d.backupIds=d.backupIds.filter(id=>id!==d.primaryId)
  await drafts().updateOne({_id:d._id},{$set:{primaryId:d.primaryId,backupIds:d.backupIds}})
  return draftCard(i,d,w)
}

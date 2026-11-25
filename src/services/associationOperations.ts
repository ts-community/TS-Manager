import mongoose from 'mongoose'
import type {Client,Guild} from 'discord.js'
import {PermissionFlagsBits} from 'discord.js'
import {staffChannels} from '../config/staffChannels'
import Asociacion,{type AsociacionDocument} from '../models/Asociacion'
import {addDays,capitalizeName,schedulePanelsSync,greenEmbed,sendAsociacionesLog,servidorFilter} from './asociaciones'
import {staffRank} from './permissions'

export class AssociationIssue extends Error {
  constructor(public status:number,message:string){super(message)}
}
export async function persistAssociation(row:AsociacionDocument,guild:Guild,actor:string,key:string) {
  if(!(await staffRank({guild,user:{id:actor}})).instructor) throw new AssociationIssue(403,'Se requiere Instructor o superior.')
  if(row.isModified('staffEncargadoId') && row.staffEncargadoId && !(await staffRank({guild,user:{id:row.staffEncargadoId}})).staff) throw new AssociationIssue(400,'Selecciona un encargado del equipo.')
  if(row.isModified('representanteId') && row.representanteId && !await guild.members.fetch(row.representanteId).catch(()=>null)) throw new AssociationIssue(400,'El representante debe pertenecer al servidor.')
  row.ultimaOperacion=key
  try{await row.save()}catch(e){
    if(e instanceof mongoose.Error.VersionError || (e as {code:number}).code===11000)throw new AssociationIssue(409,'Ha cambiado la asociación o el nombre ya existe.')
    throw e
  }
  const target='/asociaciones/'+row.id
  await mongoose.connection.db!.collection('panel_activity').updateOne({key:'association:'+key},{$setOnInsert:{key:'association:'+key,guildId:guild.id,actorId:actor,actor,section:'asociaciones',action:'Editó la asociación',detail:row.servidor,href:target,destinationId:row.canalId,at:new Date()}},{upsert:true})
  schedulePanelsSync(guild.client)
}
export async function editAssociation(client:Client,actor:string,id:string,body:Record<string,unknown>) {
  const guild=await client.guilds.fetch(staffChannels.guild)
  if(!(await staffRank({guild,user:{id:actor}})).instructor)throw new AssociationIssue(403,'Se requiere Instructor o superior.')
  const row=mongoose.isValidObjectId(id)?await Asociacion.findById(id):null
  const channel=row && await guild.channels.fetch(row.canalId).catch(()=>null)
  const member=await guild.members.fetch({user:actor,force:true})
  if(!row||!channel||channel.guildId!==guild.id||!channel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]))throw new AssociationIssue(404,'Asociación no disponible.')
  const key=String(body.requestId||'')
  if(!/^[\w-]{12,80}$/.test(key))throw new AssociationIssue(400,'Falta la clave de operación.')
  if(row.ultimaOperacion===actor+':'+key)return {id:row.id,revision:row.__v}
  if(!Number.isSafeInteger(body.revision)||Number(row.__v||0)!==body.revision)throw new AssociationIssue(409,'La ficha ha cambiado. Compara tu edición.')
  const name=String(body.servidor||'').trim(),days=Number(body.renovacionDias)
  if(!name||name.length>64||!Number.isInteger(days)||days<1||days>365)throw new AssociationIssue(400,'Revisa el nombre y la frecuencia (1–365 días).')
  if(await Asociacion.exists({...servidorFilter(name),_id:{$ne:row._id}}))throw new AssociationIssue(409,'El nombre ya existe.')
  for(const field of ['representanteId','staffEncargadoId'] as const){
    const value=body[field]
    if(value!==null && (typeof value!=='string'||!/^\d{5,25}$/.test(value)))throw new AssociationIssue(400,'Identificador de miembro no válido.')
    row[field]=value
  }
  row.servidor=capitalizeName(name)
  if(row.renovacionDias!==days){row.renovacionDias=days;row.nextRenovationDate=addDays(row.lastRenovationDate,days);row.renovacionAvisada=false}
  await persistAssociation(row,guild,actor,actor+':'+key)
  await sendAsociacionesLog(client,greenEmbed().setTitle('Asociación editada').setDescription('<@'+actor+'> actualizó '+row.servidor+' desde el panel.').setTimestamp())
  return {id:row.id,revision:row.__v}
}

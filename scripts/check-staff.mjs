import {Client,ChannelType,GatewayIntentBits as I,PermissionFlagsBits as P} from 'discord.js'
import mongoose from 'mongoose'
import {staffChannels as c} from '../dist/config/staffChannels.js'
const read=[P.ViewChannel,P.ReadMessageHistory],write=[...read,P.SendMessages]
const targets=[
  ['Cartel',c.agenda.id,c.agenda.parent,[...read,P.SendMessagesInThreads,P.AttachFiles],'thread'],
  ['Aviso de turno',c.pollLogs.id,c.pollLogs.parent,[...read,P.SendMessagesInThreads],'thread'],
  ['Publicación de encuestas',c.polls,null,write,'text'],['Partes',c.absences,null,write,'text'],
  ['Bumps',c.bumps,null,write,'text'],['Bienvenidas',c.general,null,write,'text'],
  ['Alianzas',c.alliances,null,read,'text'],['Afiliaciones',c.affiliations,null,read,'text'],
  ['Categoría de asociaciones',c.associationCategory,null,[P.ViewChannel],'category'],
  ['Tablero de asociaciones',c.associationBoard,'1436773704980758548',[...read,P.SendMessagesInThreads],'thread'],
  ['Registro de asociaciones',c.associationLog,null,read,'sendable']
]
async function inspect(guild,me,staffRoles){
  const result=[]
  for(const [feature,id,parent,permissions,kind] of targets){
    try{
      const channel=await guild.channels.fetch(id,{force:true})
      if(!channel || channel.guildId!==c.guild || parent && channel.parentId!==parent)throw Error('Destino o padre incorrecto.')
      if(kind==='thread' && (!channel.isThread()||channel.locked) || kind==='text' && ![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type) || kind==='category' && channel.type!==ChannelType.GuildCategory || kind==='sendable' && !channel.isSendable())throw Error('Tipo de canal o bloqueo incompatible.')
      const required=kind==='sendable'?[...permissions,channel.isThread()?P.SendMessagesInThreads:P.SendMessages]:permissions
      if(!channel.permissionsFor(me)?.has(required))throw Error('Permisos efectivos insuficientes.')
      if(id===c.agenda.id){
        if(!staffRoles.length)throw Error('Directorio de staff vacío.')
        const members=await guild.members.fetch()
        const membership=channel.type===ChannelType.PrivateThread?await channel.members.fetch():null
        const outsider=members.some(m=>!m.user.bot && !m.roles.cache.some(r=>staffRoles.includes(r.id)) && channel.parent.permissionsFor(m)?.has(P.ViewChannel) && (!membership||membership.has(m.id)||m.permissions.has(P.ManageThreads)))
        if(outsider)throw Error('Agenda visible a miembros ajenos al staff.')
      }
      result.push({feature,id,name:channel.name,ok:true})
    }catch(e){result.push({feature,id,ok:false,error:e.message})}
  }
  return result
}
if(process.argv.includes('--fixture')){
  const guild={channels:{fetch:async id=>{
    const [name,,parent,,kind]=targets.find(t=>t[1]===id)
    return {guildId:c.guild,name,parentId:parent,type:kind==='text'?ChannelType.GuildText:kind==='category'?ChannelType.GuildCategory:ChannelType.PublicThread,
      isThread:()=>kind==='thread',isSendable:()=>true,permissionsFor:()=>({has:()=>true}),parent:{permissionsFor:()=>({has:()=>true})}}
  }},members:{fetch:async()=>[]}}
  const rows=await inspect(guild,{},['fixture'])
  console.table(rows);if(rows.some(r=>!r.ok))process.exitCode=1
}else{
  await import('dotenv/config')
  if(!process.env.MONGO_URL||!process.env.TOKEN)throw Error('Faltan MONGO_URL o TOKEN en Manager.')
  const client=new Client({intents:[I.Guilds,I.GuildMembers,I.GuildMessages,I.MessageContent]})
  let db
  try{
    db=await mongoose.createConnection(process.env.MONGO_URL,{serverSelectionTimeoutMS:4000}).asPromise()
    await db.db.command({ping:1})
    const config=await db.db.collection('guilds').findOne({guildId:c.guild},{projection:{staffRoleIds:1}})
    const ready=new Promise((resolve,reject)=>{client.once('clientReady',resolve);client.once('error',reject)})
    await client.login(process.env.TOKEN);await ready
    const guild=await client.guilds.fetch(c.guild),me=await guild.members.fetchMe()
    const ranks=await guild.roles.fetch()
    const pollRole=ranks.get(c.pollRole),canMention=pollRole?.mentionable || (await guild.channels.fetch(c.polls))?.permissionsFor(me)?.has(P.MentionEveryone)
    const rows=await inspect(guild,me,config?.staffRoleIds||[])
    const api=await fetch(new URL('/health',process.env.TS_API_URL||'http://127.0.0.1:4322'),{signal:AbortSignal.timeout(4000)}).then(r=>r.ok).catch(()=>false)
    const sources=await db.db.collection('staff_source_health').find({guildId:c.guild},{projection:{kind:1,since:1,lastSuccess:1,error:1}}).toArray()
    const operations=await db.db.collection('staff_operations_state').find({guildId:c.guild},{projection:{name:1,threadId:1,lastSuccess:1,error:1,leaseUntil:1}}).limit(100).toArray()
    const ok=rows.every(r=>r.ok)&&api&&!!pollRole&&!!canMention
    console.log(JSON.stringify({ok,guild:guild.id,mongo:true,api,staffRoles:config?.staffRoleIds?.length||0,intents:['Guilds','GuildMembers','GuildMessages','MessageContent'],roleMention:!!canMention,channels:rows,sources,operations},null,2))
    if(!ok)process.exitCode=1
  }finally{client.destroy();await db?.close()}
}

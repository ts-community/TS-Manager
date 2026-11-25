// Leer únicamente éxitos del proveedor y acuses enlazados al mismo evento. El modo por defecto simula.
import {Client,GatewayIntentBits,ChannelType} from 'discord.js'
import mongoose from 'mongoose'
import {readFile,writeFile} from 'node:fs/promises'
import {token,mongoURL} from '../dist/config/env.js'
import {staffChannels as ch} from '../dist/config/staffChannels.js'
import {verifiedBump,BUMP_COVERAGE_START} from '../dist/services/bumpCredit.js'
import {getBumpService,isBumpMessage,getBumperId} from '../dist/services/bumps.js'

const args=process.argv.slice(2),apply=args.includes('--apply')
const param=name=>args.find(v=>v.startsWith('--'+name+'='))?.split('=').slice(1).join('=')
const from=Date.parse(param('from')||BUMP_COVERAGE_START),to=Date.parse(param('to')||new Date().toISOString())
if(!Number.isFinite(from+to)||from<Date.parse(BUMP_COVERAGE_START)||to<from||to-from>31*86400000)throw Error('El intervalo debe empezar en la fecha de cobertura y abarcar hasta 31 días.')
const limit=Math.min(10000,Number(param('limit')||1000))
if(!Number.isInteger(limit)||limit<1)throw Error('Límite no válido.')
const checkpoint=param('cursor')
let cursor=((BigInt(from)-1420070400000n)<<22n)-1n
if(checkpoint){
  const previous=JSON.parse(await readFile(checkpoint,'utf8'))
  if(previous.from!==from||previous.to!==to||previous.apply!==apply||!/^\d+$/.test(previous.after))throw Error('Cursor de otra ejecución.')
  cursor=BigInt(previous.after)
}
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]})
let scanned=0,found=0,review=0
try{
  await new Promise((resolve,reject)=>{client.once('clientReady',resolve);client.login(token).catch(reject)})
  const guild=await client.guilds.fetch(ch.guild),channel=await guild.channels.fetch(ch.bumps)
  if(channel?.type!==ChannelType.GuildText)throw Error('Canal de comandos no disponible.')
  if(apply)await mongoose.connect(mongoURL)
  while(scanned<limit){
    const size=Math.min(100,limit-scanned),page=await channel.messages.fetch({after:String(cursor),limit:size})
    if(!page.size)break
    let done=false
    for(const m of [...page.values()].sort((a,b)=>a.id===b.id?0:BigInt(a.id)<BigInt(b.id)?-1:1)){
      if(m.createdTimestamp>to){done=true;break}
      let source=m
      if(m.author.id===client.user.id&&m.reference?.messageId&&/^¡Gracias por bumpear el servidor, <@!?\d+>/.test(m.content)){
        source=await channel.messages.fetch(m.reference.messageId).catch(()=>null)
      }
      const service=source&&getBumpService(source),userId=source&&getBumperId(source)
      if(service&&userId&&source.createdTimestamp>=from&&await verifiedBump(source,service)&&isBumpMessage(source,service)==='ok'){
        found++
        if(apply){
          const entries=mongoose.connection.collection('staff_contributions'),key='bumps:'+source.id
          const legacy=await entries.findOne({_id:key})
          const meta={guildId:ch.guild,userId,kind:'bumps',sourceId:source.id,provider:service,providerId:source.author.id,rule:'provider-success',channelId:ch.bumps,at:source.createdAt,day:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(source.createdAt)}
          if(legacy){
            await entries.updateOne({_id:key,userId,guildId:ch.guild,at:{$exists:false},manualDecision:{$exists:false}},{$set:meta})
          }else{
            await entries.updateOne({_id:key},{$setOnInsert:{...meta,status:'review',historicalRole:'unconfirmed'}},{upsert:true})
            review++
          }
        }
      }
      cursor=BigInt(m.id);scanned++
    }
    if(done||page.size<size)break
  }
  const result={from,to,apply,after:String(cursor),scanned,found,review}
  if(param('save-cursor'))await writeFile(param('save-cursor'),JSON.stringify(result))
  console.log(result)
}finally{client.destroy();await mongoose.disconnect()}

import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import mongoose from 'mongoose'
import {Collection,ChannelType} from 'discord.js'
import {staffChannels as ch} from '../src/config/staffChannels'
import {writeFile,mkdir} from 'node:fs/promises'
import {renderBoard,describe,type Week} from '../src/services/surveyBoard'

const weekday='2026-11-24'
const days=['2026-11-23',weekday,'2026-11-25','2026-11-26','2026-11-27','2026-11-28','2026-11-29']
const members=['Nora','Izan','Vega'].map((name,i)=>({name,id:String(100001+i),avatarUrl:''}))
const week:Week={today:weekday,items:days.map((localDay,i)=>({localDay,weekday:i+1,primaryId:i===1?members[0].id:null,backupIds:i===1?members.slice(1).map(m=>m.id):[],effectiveId:i===1?members[0].id:null,declined:[],status:i===1?'pending':'uncovered',revision:1,noticeRevision:1})),templates:[],members}
test('cartel con siete días y dos refuerzos en orden',async()=>{
  const png=await renderBoard(week)
  assert.equal(png.readUInt32BE(16),1400)
  assert.match(describe(week,week.items[1]),/Nora.*Izan, Vega/)
  if(process.env.SAVE_STAFF_QA==='1'){
    await mkdir('qa',{recursive:true})
    await writeFile('qa/cartel-semana.png',png)
  }
})
test('reinicio entre envío y acuse, historial no disponible y publicación antes del aviso',{skip:!process.env.STAFF_TEST_MONGO},async t=>{
  const address=process.env.STAFF_TEST_MONGO!
  assert.match(address,/^mongodb:\/\/127\.0\.0\.1:\d+\/?$/)
  const dbName='manager_qa_'+randomUUID().replaceAll('-','')
  await mongoose.connect(address,{dbName})
  t.after(async()=>{if(mongoose.connection.name===dbName)await mongoose.connection.dropDatabase();await mongoose.disconnect()})
  Object.assign(process.env,{TOKEN:'fixture',MONGO_URL:address,GUILD_ID:ch.guild,PREFIX:'!',INTERNAL_API_KEY:'fixture'})
  const {deliver,checkDueSurveys}=await import('../src/services/surveyDelivery')
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date())
  const shift={...week.items[1],localDay:today}
  t.mock.method(globalThis,'fetch',async()=>Response.json({items:[shift]}))
  let writes=0,available=true
  const received=new Collection<string,any>()
  const logs={id:ch.pollLogs.id,parentId:ch.pollLogs.parent,isThread:()=>true,locked:false,client:{user:{id:'bot'}},permissionsFor:()=>({has:()=>true}),
    messages:{fetch:async(o:unknown)=>typeof o==='string'?received.get(o):received},send:async(body:{content:string;embeds:{data:{title?:string,color?:number}}[];allowedMentions:{users:string[]}})=>{
      writes++
      assert.match(body.embeds[0].data.title||'',/^Encuesta del /)
      assert.equal(body.embeds[0].data.color,0x2ecc71)
      assert.deepEqual(body.allowedMentions.users,[shift.effectiveId])
      const m={id:'55555',author:{id:'bot'},content:body.content,edit:async(b:{content:string})=>{m.content=b.content;return m}}
      received.set(m.id,m);return m
    }}
  const polls={type:ChannelType.GuildText,permissionsFor:()=>({has:()=>available}),messages:{fetch:async()=>new Collection()}}
  const guild={id:ch.guild,members:{fetchMe:async()=>({})},channels:{fetch:async(id:string)=>id===ch.polls?polls:logs}}
  const client={guilds:{fetch:async()=>guild}}
  process.env.STAFF_INGEST_ENABLED='1'
  process.env.STAFF_SURVEY_REMINDERS_ENABLED='0'
  await checkDueSurveys(client as never)
  assert.equal(writes,0)
  process.env.STAFF_SURVEY_REMINDERS_ENABLED='1'
  available=false
  await assert.rejects(deliver(guild as never,today),/Historial/)
  assert.equal(writes,0)
  available=true
  await checkDueSurveys(client as never)
  assert.equal(writes,1)
  const states=mongoose.connection.db!.collection<any>('staff_operations_state')
  await states.updateOne({_id:'reminder:'+ch.guild+':'+today},{$unset:{messageId:1,result:1}})
  await deliver(guild as never,today)
  assert.equal(writes,1)
  shift.status='published';shift.noticeRevision++
  await deliver(guild as never,today)
  assert.match(received.first().content,/Publicada/)
  assert.equal(writes,1)
})

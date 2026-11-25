import assert from 'node:assert/strict'
import test from 'node:test'
import {randomUUID} from 'node:crypto'
import mongoose from 'mongoose'
import {staffChannels as ch} from '../src/config/staffChannels'
Object.assign(process.env,{TOKEN:'fixture',MONGO_URL:'mongodb://127.0.0.1:37191',GUILD_ID:ch.guild,PREFIX:'!',STAFF_INGEST_ENABLED:'1',STAFF_DISBOARD_APP_ID:'12345'})
const {parseAbsence}=await import('../src/services/staffAbsences')
const {captureSignal,retireSource}=await import('../src/services/staffSignals')
const {getBumpService,isBumpMessage,handlePossibleBump}=await import('../src/services/bumps')
test('partes con Markdown, días imposibles, años ambiguos y rangos invertidos',()=>{
  assert.equal(parseAbsence('__PARTE DE INACTIVIDAD__\n- __**Duración:**__ 17/11/2026- 27/11/2026\n- __**Motivo:**__ Exámenes')?.end,'2026-11-27')
  for(const d of ['31/02/2026-01/03/2026','01/01-07/01','27/11/2026-17/11/2026'])assert.equal(parseAbsence('Parte de inactividad\nDuración: '+d)?.valid,false)
})
test('bump y agradecimiento, duplicados, edición de plantilla e importación con decisión humana',{skip:!process.env.STAFF_TEST_MONGO},async t=>{
  const address=process.env.STAFF_TEST_MONGO!
  assert.match(address,/^mongodb:\/\/127\.0\.0\.1:\d+\/?$/)
  const dbName='signals_qa_'+randomUUID().replaceAll('-','')
  await mongoose.connect(address,{dbName});t.after(async()=>{if(mongoose.connection.name===dbName)await mongoose.connection.dropDatabase();await mongoose.disconnect()})
  await mongoose.connection.db!.collection('guilds').insertOne({guildId:ch.guild,staffRoleIds:['staff']})
  const member={id:'100001',roles:{cache:new Map([['staff',{id:'staff'}]])}}
  const guild={id:ch.guild,members:{cache:new Map([[member.id,member]])}}
  let thanks='', thankCount=0
  const m:any={id:'50000001',author:{id:'12345',bot:true,username:'DISBOARD'},applicationId:'12345',channelId:ch.bumps,guildId:ch.guild,guild,member,
    interactionMetadata:{name:'bump',user:member},channel:{isSendable:()=>true,send:async(b:any)=>{thankCount++;thanks=b.content;return {id:'600001'}}},content:'Bump done!',embeds:[],components:[],createdTimestamp:Date.parse('2026-11-21T10:36:18Z')}
  const store=mongoose.connection.db!.collection<any>('staff_contributions')
  assert.equal(isBumpMessage(m,'disboard'),'ok')
  await handlePossibleBump({...m,content:''})
  assert.equal(thankCount,0)
  await handlePossibleBump(m)
  await handlePossibleBump(m)
  assert.equal(thankCount,1)
  assert.equal(await store.countDocuments({kind:'bumps'}),1)
  assert.equal(getBumpService({...m,content:thanks,author:{bot:true,username:'TS Manager'}}),null)
  assert.equal(isBumpMessage({...m,content:'Already bumped. Next bump <t:1795263296:R>'},'disboard'),null)
  const second={...m,id:'50000002',content:'Respuesta provisional del proveedor'}
  await handlePossibleBump(second)
  assert.equal(await store.countDocuments({kind:'bumps'}),1)
  await handlePossibleBump({...second,content:'Bump done!'})
  assert.equal(await store.countDocuments({kind:'bumps'}),2)
  assert.equal(thankCount,2)
  const tpl:any={...m,author:{id:member.id,bot:false},flags:{has:()=>false},channelId:ch.alliances,content:'Alianza con Atlas\nComunidad de eventos y actividades para todo el mundo.\nhttps://discord.gg/atlas',createdAt:new Date()}
  await captureSignal(tpl);await captureSignal(tpl);assert.equal(await store.countDocuments({kind:'alliances',status:'credited'}),1)
  await retireSource(tpl);assert.equal(await store.countDocuments({kind:'alliances',status:'credited'}),0)
  await store.updateOne({kind:'alliances'},{$set:{manualDecision:{by:'reviewer'},status:'revoked'}})
  await captureSignal(tpl,true);assert.equal(await store.countDocuments({kind:'alliances',status:'credited'}),0)
})

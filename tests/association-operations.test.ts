import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import {randomUUID} from 'node:crypto'
import {Collection} from 'discord.js'
import {staffChannels} from '../src/config/staffChannels'
test('edición de documento histórico, repetición, conflicto y pérdida de rango',{skip:!process.env.STAFF_TEST_MONGO},async t=>{
  const uri=process.env.STAFF_TEST_MONGO!,dbName='asoc_qa_'+randomUUID().replaceAll('-','')
  assert.match(uri,/^mongodb:\/\/127\.0\.0\.1:\d+\/?$/)
  Object.assign(process.env,{GUILD_ID:staffChannels.guild,PREFIX:'!',TOKEN:'fixture',MONGO_URL:uri})
  await mongoose.connect(uri,{dbName})
  t.after(async()=>{if(mongoose.connection.name===dbName)await mongoose.connection.dropDatabase();await mongoose.disconnect()})
  const {default:Asociacion}=await import('../src/models/Asociacion')
  const {editAssociation}=await import('../src/services/associationOperations')
  assert.equal(Asociacion.collection.name,'asociacions')
  const floor='1202685031219200040',actor='111111111',channel='222222222'
  await mongoose.connection.db!.collection('guilds').insertOne({guildId:staffChannels.guild,staffRoleIds:[floor]})
  const {insertedId}=await mongoose.connection.db!.collection('asociacions').insertOne({servidor:'Atlas',canalId:channel,lastRenovationDate:new Date(),nextRenovationDate:new Date(),renovacionDias:7})
  let authorized=true
  const role={id:floor,comparePositionTo:()=>0},roles=new Collection([[floor,role]])
  const guild:any={id:staffChannels.guild,roles:{fetch:async()=>roles},members:{fetch:async()=>({user:{bot:false},roles:{cache:authorized?roles:new Collection()}})},
    channels:{fetch:async()=>({guildId:staffChannels.guild,permissionsFor:()=>({has:()=>true})})}}
  const client:any={guilds:{fetch:async()=>guild},channels:{fetch:async()=>null}}
  guild.client=client
  const op={requestId:randomUUID(),revision:0,servidor:'Atlas Norte',renovacionDias:3,staffEncargadoId:null,representanteId:null}
  const result=await editAssociation(client,actor,String(insertedId),op)
  assert.equal(result.revision,1)
  assert.deepEqual(await editAssociation(client,actor,String(insertedId),op),result)
  await assert.rejects(editAssociation(client,actor,String(insertedId),{...op,requestId:randomUUID()}),{status:409})
  authorized=false;await assert.rejects(editAssociation(client,actor,String(insertedId),{...op,revision:1}),{status:403})
  const stored=await Asociacion.findById(insertedId).lean()
  assert.equal(stored?.renovacionDias,3);assert.equal('guildId' in stored!,false)
})

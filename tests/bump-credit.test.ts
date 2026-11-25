import test from 'node:test'
import assert from 'node:assert/strict'
import {eligibleBump,BUMP_COVERAGE_START} from '../src/services/bumpCredit'
import {staffChannels as ch} from '../src/config/staffChannels'
test('solo la confirmación del proveedor en comandos a partir del corte inclusivo',()=>{
  process.env.STAFF_DISBOARD_APP_ID='12345'
  const at=Date.parse(BUMP_COVERAGE_START), event={guildId:ch.guild,channelId:ch.bumps,author:{id:'12345',bot:true,username:'DISBOARD'},applicationId:'12345',createdTimestamp:at}
  assert.equal(eligibleBump(event as never,'disboard'),true)
  for(const change of [{createdTimestamp:at-1},{guildId:'other'},{channelId:ch.general},{author:{id:'56789',bot:true,username:'DISBOARD'}},{author:{id:'manager',bot:true},content:'¡Gracias por bumpear el servidor, <@959153630328528976>, se te recordara de nuevo <t:1795263296:R>!'}])
    assert.equal(eligibleBump({...event,...change} as never,'disboard'),false)
})

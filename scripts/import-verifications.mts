// Importa verificaciones antiguas (export de otro bot) al modelo Verification.
// Uso: npx tsx scripts/import-verifications.ts <archivo.json> [--apply]
// Sin --apply solo muestra lo que haría, sin escribir nada.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import mongoose from 'mongoose'
import Verification from '../src/models/Verification'
import User from '../src/models/User'
import { BrawlStarsApiError, getBrawlClubMembers, getBrawlPlayer, normalizeBrawlTag, type BrawlClubRole, type BrawlPlayer } from '../src/services/brawlStars'

type Entry = { memberId: string; bsTag: string; main: boolean; timestamp: number }

const [file, ...flags] = process.argv.slice(2)
const apply = flags.includes('--apply')
const { MONGO_URL: mongoUrl, GUILD_ID: guildId, TOKEN: token } = process.env

if (!file || !mongoUrl || !guildId || !token) {
  console.error('Uso: npx tsx scripts/import-verifications.ts <archivo.json> [--apply] (necesita MONGO_URL, GUILD_ID y TOKEN en el .env)')
  process.exit(1)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Los IDs de Discord superan el entero seguro de JS: se leen como texto antes de parsear.
const raw = readFileSync(file, 'utf8').replace(/"memberId"\s*:\s*(\d+)/g, '"memberId":"$1"')
const entries = (JSON.parse(raw) as { data: Entry[] }).data

// Una verificación por usuario: la cuenta principal; si no hay, la más reciente.
const byUser = new Map<string, Entry>()
for (const entry of entries) {
  const current = byUser.get(entry.memberId)
  const better = !current
    || (entry.main && !current.main)
    || (entry.main === current.main && entry.timestamp > current.timestamp)
  if (better) byUser.set(entry.memberId, entry)
}

async function guildMemberIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  let after = '0'
  for (;;) {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`, {
      headers: { Authorization: `Bot ${token}` }
    })
    if (!response.ok) throw new Error(`Discord respondió ${response.status} al listar miembros`)
    const page = await response.json() as Array<{ user: { id: string } }>
    page.forEach(member => ids.add(member.user.id))
    if (page.length < 1000) return ids
    after = page[page.length - 1].user.id
  }
}

await mongoose.connect(mongoUrl)

const members = await guildMemberIds()
const existing = await Verification.find({ guildId }).lean()
const verifiedUsers = new Set(existing.map(v => v.userId))
const usedTags = new Map(existing.map(v => [normalizeBrawlTag(v.tag), v.userId]))

const clubRanks = new Map<string, Map<string, BrawlClubRole>>()
async function clubRank(clubTag: string, playerTag: string): Promise<BrawlClubRole | null> {
  let ranks = clubRanks.get(clubTag)
  if (!ranks) {
    try {
      ranks = new Map((await getBrawlClubMembers(clubTag)).map(m => [normalizeBrawlTag(m.tag), m.role]))
    } catch {
      ranks = new Map()
    }
    clubRanks.set(clubTag, ranks)
    await sleep(300)
  }
  return ranks.get(playerTag) ?? null
}

const result = { imported: 0, alreadyVerified: 0, notInServer: 0, tagTaken: 0, notFound: 0, invalid: 0, apiErrors: 0 }
const problems: string[] = []
let index = 0

for (const [userId, entry] of byUser) {
  index++
  const tag = normalizeBrawlTag(entry.bsTag)

  if (!/^[0289PYLQGRJCUV]+$/.test(tag)) { result.invalid++; problems.push(`${userId} tag inválido ${entry.bsTag}`); continue }
  if (verifiedUsers.has(userId)) { result.alreadyVerified++; continue }
  if (!members.has(userId)) { result.notInServer++; continue }
  if (usedTags.has(tag) && usedTags.get(tag) !== userId) { result.tagTaken++; problems.push(`${userId} #${tag} ya vinculado a ${usedTags.get(tag)}`); continue }

  let player: BrawlPlayer
  try {
    player = await getBrawlPlayer(tag)
  } catch (error) {
    if (error instanceof BrawlStarsApiError && error.status === 404) { result.notFound++; problems.push(`${userId} #${tag} no existe en Brawl Stars`) }
    else { result.apiErrors++; problems.push(`${userId} #${tag} error de la API: ${(error as Error).message}`) }
    await sleep(300)
    continue
  }
  await sleep(300)

  const clubTag = player.club?.tag ? normalizeBrawlTag(player.club.tag) : null
  const rank = clubTag ? await clubRank(clubTag, tag) : null

  if (apply) {
    await Verification.create({
      guildId,
      userId,
      tag,
      playerName: player.name,
      trophies: player.trophies,
      victories: player['3vs3Victories'] ?? 0,
      clubTag,
      clubName: clubTag ? player.club?.name ?? null : null,
      clubRank: rank,
      verifiedAt: new Date(entry.timestamp * 1000),
      lastCheckedAt: new Date()
    })
    await User.findOneAndUpdate(
      { discordId: userId },
      { $set: { brawlId: tag }, $setOnInsert: { teamId: null } },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(() => null)
  }

  usedTags.set(tag, userId)
  result.imported++
  if (index % 50 === 0) console.log(`… ${index}/${byUser.size}`)
}

console.log(apply ? '\nImportación terminada' : '\nSimulación (nada escrito; añade --apply para guardar)')
console.log(`Entradas en el archivo: ${entries.length} · usuarios distintos: ${byUser.size}`)
console.log(`${apply ? 'Importadas' : 'Se importarían'}: ${result.imported}`)
console.log(`Ya verificados (no se tocan): ${result.alreadyVerified}`)
console.log(`Ya no están en el servidor: ${result.notInServer}`)
console.log(`Tag ya vinculado a otra persona: ${result.tagTaken}`)
console.log(`Cuenta inexistente en Brawl Stars: ${result.notFound}`)
console.log(`Tag con formato inválido: ${result.invalid}`)
console.log(`Errores de la API (se pueden reintentar): ${result.apiErrors}`)
if (problems.length) console.log(`\nDetalle:\n${problems.join('\n')}`)

await mongoose.disconnect()

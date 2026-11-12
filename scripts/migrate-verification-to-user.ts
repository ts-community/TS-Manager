/**
 * Script de migración: mueve los datos de la colección Verification a User.
 *
 * Uso: node --loader ts-node/esm scripts/migrate-verification-to-user.ts
 *
 * Este script:
 * 1. Lee todos los documentos de la colección "Verification".
 * 2. Para cada documento, actualiza el User correspondiente con los datos de Brawl Stars.
 * 3. Borra la colección "Verification" al finalizar.
 *
 * IMPORTANTE: Ejecutar una sola vez antes de arrancar el bot con el nuevo modelo.
 */

import mongoose from 'mongoose'
import { mongodbUri } from '../src/config/env'

async function main() {
  await mongoose.connect(mongodbUri)
  console.log('Conectado a MongoDB')

  // Leer todos los documentos de Verification usando la colección cruda
  const verificationCollection = mongoose.connection.collection('verifications')
  const verifications = await verificationCollection.find({}).toArray()
  console.log(`Se encontraron ${verifications.length} registros en Verification`)

  let migrated = 0
  let errors = 0

  for (const v of verifications) {
    try {
      await mongoose.connection.collection('users').findOneAndUpdate(
        { discordId: v.userId },
        {
          $set: {
            brawlId: v.tag,
            playerName: v.playerName,
            trophies: v.trophies,
            victories: v.victories,
            clubTag: v.clubTag,
            clubName: v.clubName,
            clubRank: v.clubRank,
            rankedPoints: v.rankedPoints,
            verifiedAt: v.verifiedAt,
            lastCheckedAt: v.lastCheckedAt
          },
          $setOnInsert: {
            discordId: v.userId,
            teamId: null
          }
        },
        { upsert: true }
      )
      migrated++
    } catch (err) {
      errors++
      console.error(`Error migrando ${v.userId}:`, err)
    }
  }

  // Borrar la colección Verification
  await verificationCollection.drop().catch(() => {
    // La colección podría no existir, ignorar error
  })
  console.log('Colección Verification eliminada')

  console.log(`Migración completada: ${migrated} migrados, ${errors} errores`)
  await mongoose.disconnect()
  console.log('Desconectado de MongoDB')
}

main().catch((err) => {
  console.error('Error en la migración:', err)
  process.exit(1)
})

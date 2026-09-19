import 'dotenv/config'
import mongoose from 'mongoose'
import Ticket from '../src/models/Ticket'
import Review from '../src/models/Review'

const url = process.env.MONGO_URL
if (!url) {
  console.error('MONGO_URL no definida en el .env')
  process.exit(1)
}

await mongoose.connect(url)

const [tickets, reviews] = await Promise.all([
  Ticket.countDocuments(),
  Review.countDocuments()
])
await Promise.all([Ticket.deleteMany({}), Review.deleteMany({})])

console.log(`Tickets eliminados: ${tickets}. Valoraciones eliminadas: ${reviews}.`)
console.log('La numeración vuelve a empezar en servicios-1.')

await mongoose.disconnect()

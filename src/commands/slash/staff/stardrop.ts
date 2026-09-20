import { SlashCommandBuilder, EmbedBuilder, type ColorResolvable } from 'discord.js'
import type { SlashCommand } from '../../../types/commands'

const EMOJI = {
  blin: '<:bling:1551313024617287751>',
  gema: '<:gema:1551312984255762544>',
  power: '<:power_points:1551317248931668098>',
  coin: '<:coin:1551320974937432174>'
} as const

interface DropRarity {
  value: string
  label: string
  dropEmoji: string
  color: ColorResolvable
  /** Pesos (%) para los 6 niveles de recompensa, en orden. Suman 100. */
  weights: [number, number, number, number, number, number]
}

interface Reward {
  blins: number
  gemas: number
  power: number
  monedas: number
}

// Niveles de recompensa (comunes a todos los drops, solo cambia la probabilidad)
const REWARDS: Reward[] = [
  { blins: 1, gemas: 1, power: 10, monedas: 100 },
  { blins: 3, gemas: 3, power: 30, monedas: 300 },
  { blins: 5, gemas: 5, power: 50, monedas: 500 },
  { blins: 10, gemas: 10, power: 100, monedas: 1000 },
  { blins: 25, gemas: 25, power: 250, monedas: 2500 },
  { blins: 50, gemas: 50, power: 500, monedas: 5000 }
]

const RARITIES: DropRarity[] = [
  {
    value: 'especial',
    label: 'Especial',
    dropEmoji: '<:drop_rare:1551317250982547546>',
    color: 'Green',
    weights: [40, 30, 20, 8, 2, 0]
  },
  {
    value: 'superespecial',
    label: 'Superespecial',
    dropEmoji: '<:drop_superrare:1551317253344071814>',
    color: 'Blue',
    weights: [30, 30, 25, 10, 4, 1]
  },
  {
    value: 'epico',
    label: 'Épico',
    dropEmoji: '<:drop_epic:1551317254526869575>',
    color: 'Purple',
    weights: [20, 25, 30, 15, 8, 2]
  },
  {
    value: 'mitico',
    label: 'Mítico',
    dropEmoji: '<:drop_mythic:1551317255693017088>',
    color: 'Red',
    weights: [15, 20, 25, 20, 15, 5]
  },
  {
    value: 'legendario',
    label: 'Legendario',
    dropEmoji: '<:drop_legendary:1551317257198772354>',
    color: 'Yellow',
    weights: [10, 15, 20, 25, 20, 10]
  }
]

function rollTier(weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0

  let roll = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]
    if (roll < 0) return i
  }
  // Respaldo por redondeo: último nivel con peso > 0
  for (let i = weights.length - 1; i >= 0; i--) {
    if (weights[i] > 0) return i
  }
  return 0
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES')
}

export default {
  data: new SlashCommandBuilder()
    .setName('stardrop')
    .setDescription('Abrir un Starr Drop y revelar su recompensa (no toca la economía)')
    .addSubcommand(sub =>
      sub
        .setName('usar')
        .setDescription('Abrir un Starr Drop de una rareza')
        .addStringOption(opt =>
          opt
            .setName('tipo')
            .setDescription('Rareza del Starr Drop')
            .setRequired(true)
            .addChoices(...RARITIES.map(r => ({ name: r.label, value: r.value })))
        )
        .addUserOption(opt =>
          opt
            .setName('usuario')
            .setDescription('Usuario que recibe el drop (opcional)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo puede ser usado en servidores.',
        ephemeral: true
      })
    }

    if (interaction.options.getSubcommand() !== 'usar') return

    const tipo = interaction.options.getString('tipo', true)
    const usuario = interaction.options.getUser('usuario', false)

    const rarity = RARITIES.find(r => r.value === tipo)
    if (!rarity) {
      return interaction.reply({
        content: 'Rareza no válida.',
        ephemeral: true
      })
    }

    const tierIndex = rollTier(rarity.weights)
    const reward = REWARDS[tierIndex]
    const probability = rarity.weights[tierIndex]

    const opener = `<@${interaction.user.id}>`
    const target = usuario ? `<@${usuario.id}>` : null

    const embed = new EmbedBuilder()
      .setColor(rarity.color)
      .setTitle(`${rarity.dropEmoji} Starr Drop ${rarity.label}`)
      .setDescription(
        target && target !== opener
          ? `${opener} ha abierto un drop para ${target}`
          : `${opener} ha abierto un Starr Drop ${rarity.label}`
      )
      .addFields({
        name: 'Recompensa',
        value: [
          `${EMOJI.blin} **${formatNumber(reward.blins)}** Blins`,
          `${EMOJI.gema} **${formatNumber(reward.gemas)}** Gemas`,
          `${EMOJI.power} **${formatNumber(reward.power)}** Puntos de Fuerza`,
          `${EMOJI.coin} **${formatNumber(reward.monedas)}** Monedas`
        ].join('\n')
      })
      .setFooter({ text: `Probabilidad de este premio: ${probability}% · No se guarda en la economía` })

    return interaction.reply({ embeds: [embed] })
  }
} satisfies SlashCommand

import { ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import type { ButtonHandler } from '../../types/interactions'
import { refreshMemberRoles } from '../../services/verification'
import Verification from '../../models/Verification'

const PANEL_ACCENT = 0x3B82F6
const EMOJI_CLUB = '<:club:1467133380905795848>'
const EMOJI_TROPHIES = '<:copas:1467126361864016025>'
const EMOJI_WINS3VS3 = '<:wins3vs3:1570519008581787788>'
const EMOJI_PRESIDENT = '<:presidente:1467129797992906917>'
const EMOJI_VICE_PRESIDENT = '<:vice:1467129801281376362>'
const EMOJI_VETERAN = '<:vete:1467126232326868992>'

function rankLabel(rank: string | null): string {
  const labels: Record<string, string> = {
    president: 'Presidente',
    vicePresident: 'Vicepresidente',
    senior: 'Veterano',
    member: 'Miembro'
  }
  return rank ? labels[rank] ?? rank : 'Sin club'
}

async function buildSummaryView(view: string, guildId: string): Promise<EmbedBuilder | null> {
  const entries = await Verification.find({ guildId }).sort({ trophies: -1 })

  if (view === 'clubs') {
    const clubCounts = new Map<string, number>()
    for (const entry of entries) {
      if (entry.clubName) clubCounts.set(entry.clubName, (clubCounts.get(entry.clubName) ?? 0) + 1)
    }
    const topClubs = [...clubCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

    if (topClubs.length === 0) {
      return new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_CLUB} **Clubes**\n\nNo hay miembros con club verificado.`)
    }

    return new EmbedBuilder()
      .setColor(PANEL_ACCENT)
      .setDescription(`${EMOJI_CLUB} **Miembros por club**\n\n${topClubs.map(([name, count], i) => `${i + 1}. ${name}: **${count}**`).join('\n')}`)
  }

  if (view === 'trophies') {
    const topPlayers = entries.slice(0, 10)
    if (topPlayers.length === 0) {
      return new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_TROPHIES} **Top Copas**\n\nNo hay miembros verificados.`)
    }

    const trophiesList = topPlayers.map((entry, i) => {
      return `${i + 1}. ${entry.playerName} (#${entry.tag}) · **${(entry.trophies ?? 0).toLocaleString('es-ES')}`
    }).join('\n')
    return new EmbedBuilder()
      .setColor(PANEL_ACCENT)
      .setDescription(`${EMOJI_TROPHIES} **Top Copas**\n\n${trophiesList}`)
  }

  if (view === 'wins3v3') {
    const sorted = [...entries].sort((a, b) => (b.victories ?? 0) - (a.victories ?? 0)).slice(0, 10)
    if (sorted.length === 0) {
      return new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_WINS3VS3} **Top Wins 3v3**\n\nNo hay miembros verificados.`)
    }

    const winsList = sorted.map((entry, i) => {
      return `${i + 1}. ${entry.playerName} (#${entry.tag}) · **${(entry.victories ?? 0).toLocaleString('es-ES')}`
    }).join('\n')
    return new EmbedBuilder()
      .setColor(PANEL_ACCENT)
      .setDescription(`${EMOJI_WINS3VS3} **Top Wins 3v3**\n\n${winsList}`)
  }

  if (view === 'ranks') {
    const rankCounts = new Map<string, number>()
    for (const entry of entries) {
      if (entry.clubRank) rankCounts.set(entry.clubRank, (rankCounts.get(entry.clubRank) ?? 0) + 1)
    }
    const ranks = [...rankCounts.entries()].sort((a, b) => b[1] - a[1])

    if (ranks.length === 0) {
      return new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_PRESIDENT} **Rangos**\n\nNo hay miembros con rango verificado.`)
    }

    const rankEmoji = (rank: string) => rank === 'president' ? EMOJI_PRESIDENT : rank === 'vicePresident' ? EMOJI_VICE_PRESIDENT : EMOJI_VETERAN

    return new EmbedBuilder()
      .setColor(PANEL_ACCENT)
      .setDescription(`${EMOJI_PRESIDENT} **Rangos en clubes**\n\n${ranks.map(([rank, count]) => `${rankEmoji(rank)} ${rankLabel(rank)}: **${count}**`).join('\n')}`)
  }

  return null
}

export default {
  customId: 'verification',

  async execute(interaction) {
    if (interaction.customId === 'verification:verify') {
      const modal = new ModalBuilder()
        .setCustomId('verification:submit')
        .setTitle('Verificar cuenta de Brawl Stars')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('tag')
              .setLabel('Tag de Brawl Stars')
              .setPlaceholder('#2PQ8LGY0')
              .setStyle(TextInputStyle.Short)
              .setMinLength(3)
              .setMaxLength(15)
              .setRequired(true)
          )
        )

      await interaction.showModal(modal)
      return
    }

    if (interaction.customId === 'verification:refresh') {
      await refreshMemberRoles(interaction)
      return
    }

    // Botones del resumen interactivo
    if (interaction.customId.startsWith('verification:summary:')) {
      const view = interaction.customId.replace('verification:summary:', '')
      await interaction.deferUpdate()

      const embed = await buildSummaryView(view, interaction.guildId ?? '')
      if (embed) {
        await interaction.editReply({ embeds: [embed], components: interaction.message.components })
      }
    }
  }
} satisfies ButtonHandler

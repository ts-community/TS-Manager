import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'
import type { ButtonHandler } from '../../types/interactions'
import { refreshMemberRoles } from '../../services/verification'
import User from '../../models/User'

const PANEL_ACCENT = 0x3B82F6
const PAGE_SIZE = 10
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

function rankEmoji(rank: string): string {
  if (rank === 'president') return EMOJI_PRESIDENT
  if (rank === 'vicePresident') return EMOJI_VICE_PRESIDENT
  return EMOJI_VETERAN
}

function buildPaginationButtons(view: string, page: number, totalPages: number) {
  const buttons = new Array<ButtonBuilder>()
  if (totalPages > 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`verification:summary:${view}:${page - 1}`)
        .setLabel('◀ Anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0)
    )
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`verification:summary:${view}:${page + 1}`)
        .setLabel('Siguiente ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    )
  }
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
}

async function buildSummaryView(view: string, _guildId: string, page: number = 0): Promise<{ embed: EmbedBuilder; hasMore: boolean } | null> {
  const entries = await User.find({ brawlId: { $ne: null } }).lean()

  if (view === 'clubs') {
    const clubData = new Map<string, { count: number; ranks: Map<string, number> }>()
    for (const entry of entries) {
      if (entry.clubName) {
        const data = clubData.get(entry.clubName) ?? { count: 0, ranks: new Map() }
        data.count++
        if (entry.clubRank) {
          data.ranks.set(entry.clubRank, (data.ranks.get(entry.clubRank) ?? 0) + 1)
        }
        clubData.set(entry.clubName, data)
      }
    }
    const sortedClubs = [...clubData.entries()].sort((a, b) => b[1].count - a[1].count)
    const totalPages = Math.ceil(sortedClubs.length / PAGE_SIZE)
    const currentPage = Math.min(page, totalPages - 1)
    const pageClubs = sortedClubs.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

    if (sortedClubs.length === 0) {
      return {
        embed: new EmbedBuilder()
          .setColor(PANEL_ACCENT)
          .setDescription(`${EMOJI_CLUB} **Clubes**\n\nNo hay miembros con club verificado.`),
        hasMore: false
      }
    }

    const lines = pageClubs.map(([name, data], i) => {
      const rankParts = [...data.ranks.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([rank, count]) => `${rankEmoji(rank)} ${rankLabel(rank)}: ${count}`)
      const rankStr = rankParts.length > 0 ? ` · ${rankParts.join(' · ')}` : ''
      return `${currentPage * PAGE_SIZE + i + 1}. ${name}: **${data.count}**${rankStr}`
    })

    return {
      embed: new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_CLUB} **Miembros por club** (página ${currentPage + 1}/${totalPages})\n\n${lines.join('\n')}`),
      hasMore: totalPages > 1
    }
  }

  if (view === 'trophies') {
    const sorted = entries.sort((a, b) => (b.trophies ?? 0) - (a.trophies ?? 0))
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
    const currentPage = Math.min(page, totalPages - 1)
    const pageEntries = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

    if (sorted.length === 0) {
      return {
        embed: new EmbedBuilder()
          .setColor(PANEL_ACCENT)
          .setDescription(`${EMOJI_TROPHIES} **Top Copas**\n\nNo hay miembros verificados.`),
        hasMore: false
      }
    }

    const lines = pageEntries.map((entry, i) => {
      return `${currentPage * PAGE_SIZE + i + 1}. ${entry.playerName} (#${entry.brawlId}) · ${EMOJI_TROPHIES} **${(entry.trophies ?? 0).toLocaleString('es-ES')}`
    })

    return {
      embed: new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_TROPHIES} **Top Copas** (página ${currentPage + 1}/${totalPages})\n\n${lines.join('\n')}`),
      hasMore: totalPages > 1
    }
  }

  if (view === 'wins3v3') {
    const sorted = [...entries].sort((a, b) => (b.victories ?? 0) - (a.victories ?? 0))
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
    const currentPage = Math.min(page, totalPages - 1)
    const pageEntries = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

    if (sorted.length === 0) {
      return {
        embed: new EmbedBuilder()
          .setColor(PANEL_ACCENT)
          .setDescription(`${EMOJI_WINS3VS3} **Top Wins 3v3**\n\nNo hay miembros verificados.`),
        hasMore: false
      }
    }

    const lines = pageEntries.map((entry, i) => {
      return `${currentPage * PAGE_SIZE + i + 1}. ${entry.playerName} (#${entry.brawlId}) · ${EMOJI_WINS3VS3} **${(entry.victories ?? 0).toLocaleString('es-ES')}`
    })

    return {
      embed: new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`${EMOJI_WINS3VS3} **Top Wins 3v3** (página ${currentPage + 1}/${totalPages})\n\n${lines.join('\n')}`),
      hasMore: totalPages > 1
    }
  }

  if (view === 'ranked') {
    const withRanked = entries.filter(e => e.rankedPoints != null && e.rankedPoints > 0)
    const sorted = withRanked.sort((a, b) => (b.rankedPoints ?? 0) - (a.rankedPoints ?? 0))
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
    const currentPage = Math.min(page, totalPages - 1)
    const pageEntries = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

    if (sorted.length === 0) {
      return {
        embed: new EmbedBuilder()
          .setColor(PANEL_ACCENT)
          .setDescription('⚔️ **Top Rankeds**\n\nNo hay miembros con puntos de ranked.'),
        hasMore: false
      }
    }

    const lines = pageEntries.map((entry, i) => {
      return `${currentPage * PAGE_SIZE + i + 1}. ${entry.playerName} (#${entry.brawlId}) · ⚔️ **${(entry.rankedPoints ?? 0).toLocaleString('es-ES')} pts**`
    })

    return {
      embed: new EmbedBuilder()
        .setColor(PANEL_ACCENT)
        .setDescription(`⚔️ **Top Rankeds** (página ${currentPage + 1}/${totalPages})\n\n${lines.join('\n')}`),
      hasMore: totalPages > 1
    }
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

    // Botones del resumen interactivo con paginación
    if (interaction.customId.startsWith('verification:summary:')) {
      const parts = interaction.customId.replace('verification:summary:', '').split(':')
      const view = parts[0]
      const page = parts.length > 1 ? parseInt(parts[1], 10) ?? 0 : 0

      await interaction.deferUpdate()

      const result = await buildSummaryView(view, interaction.guildId ?? '', page)
      if (result) {
        const entries = await User.find({ brawlId: { $ne: null } }).lean()
        let totalPages = 1
        if (view === 'clubs') {
          const clubData = new Map<string, number>()
          for (const entry of entries) {
            if (entry.clubName) clubData.set(entry.clubName, (clubData.get(entry.clubName) ?? 0) + 1)
          }
          totalPages = Math.max(1, Math.ceil(clubData.size / PAGE_SIZE))
        } else if (view === 'ranked') {
          const withRanked = entries.filter(e => e.rankedPoints != null && e.rankedPoints > 0)
          totalPages = Math.max(1, Math.ceil(withRanked.length / PAGE_SIZE))
        } else {
          totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
        }

        const paginationRows = buildPaginationButtons(view, page, totalPages)
        await interaction.editReply({ embeds: [result.embed], components: paginationRows })
      }
    }
  }
} satisfies ButtonHandler

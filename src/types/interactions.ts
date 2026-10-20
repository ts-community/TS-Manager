import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  Client
} from 'discord.js'

export interface ButtonHandler {
  customId: string
  execute: (interaction: ButtonInteraction, client: Client) => Promise<void>
}

export interface ModalHandler {
  customId: string
  execute: (interaction: ModalSubmitInteraction, client: Client) => Promise<void>
}

export interface SelectMenuHandler {
  customId: string
  execute: (interaction: StringSelectMenuInteraction, client: Client) => Promise<void>
}
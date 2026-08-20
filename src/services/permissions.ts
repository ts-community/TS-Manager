import { PermissionFlagsBits, GuildMember } from 'discord.js'
import type { GuildMember as GuildMemberType, ChatInputCommandInteraction } from 'discord.js'
import type { CommandPermission } from '../types/commands'
import { getGuildConfig } from './guild'

export interface PermissionContext {
  member: GuildMemberType | ChatInputCommandInteraction['member']
}

export async function hasPermission(
  context: PermissionContext,
  permission: CommandPermission | undefined
): Promise<boolean> {
  const { member } = context

  if (!member) return false
  if (!permission || permission === 'member') return true

  const perms =
    typeof member.permissions === 'string'
      ? BigInt(member.permissions)
      : member.permissions.valueOf()

  const isAdmin =
    (BigInt(perms) & PermissionFlagsBits.Administrator) ===
    PermissionFlagsBits.Administrator

  if (isAdmin) return true

  if (permission === 'admin') {
    return false
  }

  if (permission === 'staff') {
    const config = await getGuildConfig()

    if (config.staffRoleIds.length === 0) return false

    if (member instanceof GuildMember) {
      return member.roles.cache.some(role =>
        config.staffRoleIds.includes(role.id)
      )
    }

    return member.roles.some(roleId =>
      config.staffRoleIds.includes(roleId)
    )
  }

  return false
}

const cooldowns = new Map<string, Map<string, number>>()

export function checkCooldown(commandName: string, userId: string, cooldown: number): number | null {
  if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Map())

  const timestamps = cooldowns.get(commandName)!
  const now = Date.now()
  const expiry = timestamps.get(userId)

  if (expiry && now < expiry) return Math.ceil((expiry - now) / 1000)

  timestamps.set(userId, now + cooldown * 1000)
  setTimeout(() => timestamps.delete(userId), cooldown * 1000)

  return null
}
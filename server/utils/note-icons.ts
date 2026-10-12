import { icons as lucideIcons } from '@iconify-json/lucide'

export const supportedNoteIconNames = [
  ...Object.keys(lucideIcons.icons),
  ...Object.keys(lucideIcons.aliases ?? {})
].sort()

const supportedNoteIconNameSet = new Set(supportedNoteIconNames)

export function isSupportedNoteIcon(icon: unknown): icon is string {
  return typeof icon === 'string'
    && icon.startsWith('i-lucide-')
    && supportedNoteIconNameSet.has(icon.slice('i-lucide-'.length))
}

import { requireAuthenticatedUser } from '../utils/auth'
import { supportedNoteIconNames } from '../utils/note-icons'

export default defineEventHandler((event) => {
  requireAuthenticatedUser(event)
  return supportedNoteIconNames
})

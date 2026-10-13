import { requireAuthenticatedUser } from '../utils/auth'
import { supportedNoteIconNames } from '../utils/note-icons'

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  return supportedNoteIconNames
})

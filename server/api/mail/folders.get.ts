import { createError } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { getMailSettings, listMailFolders } from '../../utils/mail'

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const settings = await getMailSettings()
  if (!settings) {
    throw createError({ statusCode: 409, statusMessage: 'Set up an email account in Mail settings first' })
  }

  return { folders: await listMailFolders(settings) }
})

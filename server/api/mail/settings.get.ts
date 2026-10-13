import { requireAuthenticatedUser } from '../../utils/auth'
import { getMailSettings, isMailEncryptionConfigured, publicMailSettings } from '../../utils/mail'

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const settings = await getMailSettings()
  return {
    settings: settings ? publicMailSettings(settings) : null,
    encryptionConfigured: isMailEncryptionConfigured()
  }
})

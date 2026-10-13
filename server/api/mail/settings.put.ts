import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import {
  encryptMailPassword,
  getMailSettings,
  testMailSettings,
  type MailSettingsInput
} from '../../utils/mail'

interface MailSettingsBody {
  imapHost?: unknown
  imapPort?: unknown
  imapSecure?: unknown
  imapUsername?: unknown
  imapPassword?: unknown
  smtpHost?: unknown
  smtpPort?: unknown
  smtpSecure?: unknown
  smtpUsername?: unknown
  smtpPassword?: unknown
  fromEmail?: unknown
}

function getHost(value: unknown, name: string) {
  const host = typeof value === 'string' ? value.trim() : ''
  if (!host || host.length > 253 || /[\s/\\]/.test(host)) {
    throw createError({ statusCode: 400, statusMessage: `Enter a valid ${name} host` })
  }
  return host
}

function getPort(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw createError({ statusCode: 400, statusMessage: `Enter a valid ${name} port` })
  }
  return value
}

function getUsername(value: unknown, name: string) {
  const username = typeof value === 'string' ? value.trim() : ''
  if (!username || username.length > 254) {
    throw createError({ statusCode: 400, statusMessage: `Enter a valid ${name} username` })
  }
  return username
}

function getPassword(value: unknown, name: string, oldPassword?: string) {
  const password = typeof value === 'string' ? value : ''
  if (!password && oldPassword) {
    return oldPassword
  }
  if (!password || password.length > 1024) {
    throw createError({ statusCode: 400, statusMessage: `Enter a valid ${name} password` })
  }
  return password
}

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const body = await readBody<MailSettingsBody | null>(event) ?? {}
  const existing = await getMailSettings()
  const fromEmail = typeof body.fromEmail === 'string' ? body.fromEmail.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail) || fromEmail.length > 254) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid outgoing email address' })
  }
  if (typeof body.imapSecure !== 'boolean' || typeof body.smtpSecure !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Choose whether each mail connection uses implicit TLS' })
  }

  const settings: MailSettingsInput = {
    imapHost: getHost(body.imapHost, 'IMAP'),
    imapPort: getPort(body.imapPort, 'IMAP'),
    imapSecure: body.imapSecure,
    imapUsername: getUsername(body.imapUsername, 'IMAP'),
    imapPassword: getPassword(body.imapPassword, 'IMAP', existing?.imapPassword),
    smtpHost: getHost(body.smtpHost, 'SMTP'),
    smtpPort: getPort(body.smtpPort, 'SMTP'),
    smtpSecure: body.smtpSecure,
    smtpUsername: getUsername(body.smtpUsername, 'SMTP'),
    smtpPassword: getPassword(body.smtpPassword, 'SMTP', existing?.smtpPassword),
    fromEmail
  }

  const encryptedImapPassword = encryptMailPassword(settings.imapPassword)
  const encryptedSmtpPassword = encryptMailPassword(settings.smtpPassword)

  try {
    await testMailSettings(settings)
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Could not connect to the IMAP or SMTP server: ${error instanceof Error ? error.message : 'Please check the connection settings.'}`
    })
  }

  const db = await useDatabase()
  await db.query(`
    INSERT INTO mail_settings (
      id, imap_host, imap_port, imap_secure, imap_username, imap_password,
      smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, from_email, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
      imap_host = EXCLUDED.imap_host,
      imap_port = EXCLUDED.imap_port,
      imap_secure = EXCLUDED.imap_secure,
      imap_username = EXCLUDED.imap_username,
      imap_password = EXCLUDED.imap_password,
      smtp_host = EXCLUDED.smtp_host,
      smtp_port = EXCLUDED.smtp_port,
      smtp_secure = EXCLUDED.smtp_secure,
      smtp_username = EXCLUDED.smtp_username,
      smtp_password = EXCLUDED.smtp_password,
      from_email = EXCLUDED.from_email,
      updated_at = CURRENT_TIMESTAMP
  `, [
    'default',
    settings.imapHost,
    settings.imapPort,
    settings.imapSecure,
    settings.imapUsername,
    encryptedImapPassword,
    settings.smtpHost,
    settings.smtpPort,
    settings.smtpSecure,
    settings.smtpUsername,
    encryptedSmtpPassword,
    settings.fromEmail
  ])

  return { success: true }
})

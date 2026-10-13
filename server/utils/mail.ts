import { createDecipheriv, randomBytes, createCipheriv } from 'node:crypto'
import { ImapFlow, type FetchMessageObject, type MailboxObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import { useDatabase } from './database'

interface MailSettingsRecord {
  imap_host: string
  imap_port: number
  imap_secure: boolean
  imap_username: string
  imap_password: string
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_username: string
  smtp_password: string
  from_email: string
}

export interface MailSettingsInput {
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUsername: string
  imapPassword: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  smtpPassword: string
  fromEmail: string
}

export interface MailFolder {
  path: string
  name: string
  specialUse?: string
}

const settingsId = 'default'

export function isMailEncryptionConfigured() {
  const encodedKey = process.env.MAIL_CREDENTIALS_KEY || useRuntimeConfig().mailCredentialsKey
  const key = Buffer.from(encodedKey, 'base64')
  return key.length === 32 && key.toString('base64') === encodedKey
}

function encryptionKey() {
  const encodedKey = process.env.MAIL_CREDENTIALS_KEY || useRuntimeConfig().mailCredentialsKey
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Set MAIL_CREDENTIALS_KEY to a base64-encoded 32-byte key before saving mail settings.'
    })
  }
  return key
}

export function encryptMailPassword(password: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join('.')
}

export function decryptMailPassword(encrypted: string) {
  const [encodedIv, encodedTag, encodedData, ...extra] = encrypted.split('.')
  if (!encodedIv || !encodedTag || !encodedData || extra.length) {
    throw new Error('Stored mail credentials have an invalid encrypted format.')
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64'))
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, 'base64')),
    decipher.final()
  ]).toString('utf8')
}

export async function getMailSettings() {
  const db = await useDatabase()
  const result = await db.query<MailSettingsRecord>('SELECT * FROM mail_settings WHERE id = $1', [settingsId])
  const row = result.rows[0]
  if (!row) {
    return null
  }

  return {
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    imapSecure: row.imap_secure,
    imapUsername: row.imap_username,
    imapPassword: decryptMailPassword(row.imap_password),
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: row.smtp_secure,
    smtpUsername: row.smtp_username,
    smtpPassword: decryptMailPassword(row.smtp_password),
    fromEmail: row.from_email
  }
}

export function publicMailSettings(settings: MailSettingsInput) {
  return {
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapSecure: settings.imapSecure,
    imapUsername: settings.imapUsername,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUsername: settings.smtpUsername,
    fromEmail: settings.fromEmail,
    hasImapPassword: Boolean(settings.imapPassword),
    hasSmtpPassword: Boolean(settings.smtpPassword)
  }
}

export function createImapClient(settings: MailSettingsInput) {
  return new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    doSTARTTLS: !settings.imapSecure,
    auth: { user: settings.imapUsername, pass: settings.imapPassword },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    logger: false
  })
}

export function createSmtpTransport(settings: MailSettingsInput) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    requireTLS: !settings.smtpSecure,
    auth: { user: settings.smtpUsername, pass: settings.smtpPassword },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000
  })
}

export async function withImapClient<T>(
  settings: MailSettingsInput,
  operation: (client: ImapFlow) => Promise<T>
) {
  const client = createImapClient(settings)
  try {
    await client.connect()
    return await operation(client)
  } finally {
    if (!client.isClosed) {
      if (client.usable) {
        await client.logout()
      } else {
        client.close()
      }
    }
  }
}

export async function testMailSettings(settings: MailSettingsInput) {
  await withImapClient(settings, async (client) => {
    await client.list()
  })
  const transport = createSmtpTransport(settings)
  try {
    await transport.verify()
  } finally {
    transport.close()
  }
}

export async function listMailFolders(settings: MailSettingsInput): Promise<MailFolder[]> {
  return withImapClient(settings, async client => (await client.list()).map(folder => ({
    path: folder.path,
    name: folder.name,
    ...(folder.specialUse ? { specialUse: folder.specialUse } : {})
  })))
}

export async function syncMailFolder(settings: MailSettingsInput, mailboxPath: string) {
  return withImapClient(settings, async (client) => {
    const folders = await client.list()
    if (!folders.some(folder => folder.path === mailboxPath)) {
      throw createError({ statusCode: 404, statusMessage: 'Mailbox not found on the IMAP server' })
    }

    const lock = await client.getMailboxLock(mailboxPath)
    try {
      const mailbox = client.mailbox
      if (!mailbox) {
        throw new Error('IMAP mailbox was not opened.')
      }
      const startUid = Math.max(1, mailbox.uidNext - 100)
      if (mailbox.exists) {
        const messages = await client.fetchAll(`${startUid}:*`, {
          uid: true,
          envelope: true,
          internalDate: true,
          flags: true
        })
        const db = await useDatabase()
        const databaseClient = await db.connect()
        try {
          await databaseClient.query('BEGIN')
          for (const message of messages) {
            await saveMessageSummary(databaseClient, mailboxPath, mailbox, message)
          }
          await databaseClient.query('COMMIT')
        } catch (error) {
          await databaseClient.query('ROLLBACK')
          throw error
        } finally {
          databaseClient.release()
        }
      }
    } finally {
      lock.release()
    }
  })
}

async function saveMessageSummary(
  client: import('pg').PoolClient,
  mailboxPath: string,
  mailbox: MailboxObject,
  message: FetchMessageObject
) {
  const sender = message.envelope?.from?.[0]
  if (!sender?.address) {
    return
  }

  await client.query(`
    INSERT INTO email_messages (
      id, mailbox, uid_validity, uid, message_id, in_reply_to, sender_name,
      sender_email, recipients, subject, received_at, unread
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (mailbox, uid_validity, uid) DO UPDATE SET
      message_id = EXCLUDED.message_id,
      in_reply_to = EXCLUDED.in_reply_to,
      sender_name = EXCLUDED.sender_name,
      sender_email = EXCLUDED.sender_email,
      recipients = EXCLUDED.recipients,
      subject = EXCLUDED.subject,
      received_at = EXCLUDED.received_at,
      unread = EXCLUDED.unread
  `, [
    `${mailboxPath}:${mailbox.uidValidity}:${message.uid}`,
    mailboxPath,
    mailbox.uidValidity.toString(),
    message.uid,
    message.envelope?.messageId ?? null,
    message.envelope?.inReplyTo ?? null,
    sender.name ?? '',
    sender.address,
    message.envelope?.to?.map(address => address.address).filter(Boolean).join(', ') ?? '',
    message.envelope?.subject ?? '',
    message.internalDate ?? message.envelope?.date ?? new Date(),
    !(message.flags?.has('\\Seen') ?? false)
  ])
}

export async function readMailMessage(id: string) {
  const db = await useDatabase()
  const result = await db.query<{
    id: string
    mailbox: string
    uid_validity: string
    uid: string
    sender_name: string
    sender_email: string
    recipients: string
    subject: string
    received_at: Date
    unread: boolean
  }>(`
    SELECT id, mailbox, uid_validity, uid, sender_name, sender_email, recipients, subject, received_at, unread
    FROM email_messages WHERE id = $1
  `, [id])
  const summary = result.rows[0]
  if (!summary) {
    throw createError({ statusCode: 404, statusMessage: 'Email not found' })
  }

  const settings = await getMailSettings()
  if (!settings) {
    throw createError({ statusCode: 409, statusMessage: 'Mail settings have not been configured' })
  }

  const parsedMessage = await withImapClient(settings, async (client) => {
    const lock = await client.getMailboxLock(summary.mailbox)
    try {
      const mailbox = client.mailbox
      if (!mailbox || mailbox.uidValidity.toString() !== summary.uid_validity) {
        throw createError({ statusCode: 410, statusMessage: 'The mailbox changed; refresh the inbox and try again' })
      }

      const message = await client.fetchOne(summary.uid, { uid: true, source: true }, { uid: true })
      if (!message || !message.source) {
        throw createError({ statusCode: 404, statusMessage: 'Email is no longer available on the server' })
      }

      const parsed = await simpleParser(message.source)
      await client.messageFlagsAdd(summary.uid, ['\\Seen'], { uid: true })
      return parsed
    } finally {
      lock.release()
    }
  })

  const references = parsedMessage.references
  const dbUpdate = await db.query(`
    UPDATE email_messages
    SET text_body = $1, message_id = COALESCE($2, message_id),
        in_reply_to = COALESCE($3, in_reply_to),
        references_header = $4, unread = FALSE
    WHERE id = $5
  `, [
    parsedMessage.text ?? '',
    parsedMessage.messageId ?? null,
    parsedMessage.inReplyTo ?? null,
    Array.isArray(references) ? references.join(' ') : references ?? null,
    id
  ])
  if (!dbUpdate.rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Email was deleted while it was being opened' })
  }

  const replyAddress = parsedMessage.replyTo?.value[0]?.address
    ?? parsedMessage.from?.value[0]?.address
    ?? summary.sender_email
  return {
    id: summary.id,
    mailbox: summary.mailbox,
    senderName: summary.sender_name,
    senderEmail: summary.sender_email,
    recipients: summary.recipients,
    subject: summary.subject,
    receivedAt: summary.received_at.toISOString(),
    unread: false,
    textBody: parsedMessage.text ?? '',
    replyAddress,
    messageId: parsedMessage.messageId ?? null,
    references: Array.isArray(references) ? references : references ? [references] : []
  }
}

export async function replyToMailMessage(id: string, text: string) {
  const db = await useDatabase()
  const result = await db.query<{
    subject: string
    message_id: string | null
    references_header: string | null
    mailbox: string
    uid_validity: string
    uid: string
  }>(`
    SELECT subject, message_id, references_header, mailbox, uid_validity, uid
    FROM email_messages WHERE id = $1
  `, [id])
  const message = result.rows[0]
  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Email not found' })
  }
  const settings = await getMailSettings()
  if (!settings) {
    throw createError({ statusCode: 409, statusMessage: 'Mail settings have not been configured' })
  }

  const details = await readMailMessage(id)
  const references = [...details.references]
  if (message.message_id && !references.includes(message.message_id)) {
    references.push(message.message_id)
  }
  const transport = createSmtpTransport(settings)
  try {
    await transport.sendMail({
      from: settings.fromEmail,
      to: details.replyAddress,
      subject: message.subject.toLowerCase().startsWith('re:') ? message.subject : `Re: ${message.subject}`,
      text,
      ...(message.message_id ? { inReplyTo: message.message_id } : {}),
      ...(references.length ? { references } : {})
    })
  } finally {
    transport.close()
  }
}

export async function deleteMailMessage(id: string) {
  const db = await useDatabase()
  const result = await db.query<{
    mailbox: string
    uid_validity: string
    uid: string
  }>('SELECT mailbox, uid_validity, uid FROM email_messages WHERE id = $1', [id])
  const message = result.rows[0]
  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Email not found' })
  }
  const settings = await getMailSettings()
  if (!settings) {
    throw createError({ statusCode: 409, statusMessage: 'Mail settings have not been configured' })
  }

  await withImapClient(settings, async (client) => {
    const lock = await client.getMailboxLock(message.mailbox)
    try {
      const mailbox = client.mailbox
      if (!mailbox || mailbox.uidValidity.toString() !== message.uid_validity) {
        throw createError({ statusCode: 410, statusMessage: 'The mailbox changed; refresh the inbox and try again' })
      }
      const deleted = await client.messageDelete(message.uid, { uid: true })
      if (!deleted) {
        throw createError({ statusCode: 502, statusMessage: 'The IMAP server did not delete the email' })
      }
    } finally {
      lock.release()
    }
  })

  await db.query('DELETE FROM email_messages WHERE id = $1', [id])
}

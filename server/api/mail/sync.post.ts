import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { getMailSettings, syncMailFolder } from '../../utils/mail'
import type { EmailSummary } from '#shared/types'

interface SyncBody {
  mailbox?: unknown
}

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const body = await readBody<SyncBody | null>(event) ?? {}
  if (typeof body.mailbox !== 'string' || !body.mailbox || body.mailbox.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a valid mail folder' })
  }

  const settings = await getMailSettings()
  if (!settings) {
    throw createError({ statusCode: 409, statusMessage: 'Set up an email account in Mail settings first' })
  }
  await syncMailFolder(settings, body.mailbox)
  const db = await useDatabase()
  const result = await db.query<{
    id: string
    mailbox: string
    sender_name: string
    sender_email: string
    subject: string
    received_at: Date
    unread: boolean
  }>(`
    SELECT id, mailbox, sender_name, sender_email, subject, received_at, unread
    FROM email_messages
    WHERE mailbox = $1
    ORDER BY received_at DESC, uid DESC
    LIMIT 100
  `, [body.mailbox])

  const messages: EmailSummary[] = result.rows.map(row => ({
    id: row.id,
    mailbox: row.mailbox,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    subject: row.subject,
    receivedAt: row.received_at.toISOString(),
    unread: row.unread
  }))

  return { messages }
})

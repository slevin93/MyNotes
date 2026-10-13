import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../../../utils/auth'
import { replyToMailMessage } from '../../../../utils/mail'

interface ReplyBody {
  text?: unknown
}

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Email id is required' })
  }
  const body = await readBody<ReplyBody | null>(event) ?? {}
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text || text.length > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'Reply must be between 1 and 100,000 characters' })
  }
  await replyToMailMessage(id, text)
  return { success: true }
})

import { createReadStream } from 'node:fs'
import { createError, sendStream, setHeader } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import { getMediaDirectory } from '../../utils/media'

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const db = await useDatabase()
  const result = await db.query<{ mime_type: string, extension: string }>(`
    SELECT mime_type, extension FROM media_assets WHERE id = $1 AND user_id = $2
  `, [id, user.id])
  const media = result.rows[0]

  if (!media) {
    throw createError({ statusCode: 404, statusMessage: 'Media not found' })
  }

  setHeader(event, 'Content-Type', media.mime_type)
  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Disposition', 'inline')
  return sendStream(event, createReadStream(`${getMediaDirectory()}/${id}.${media.extension}`))
})

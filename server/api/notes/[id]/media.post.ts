import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createError, getQuery, getRequestHeader, readMultipartFormData } from 'h3'
import { requireAuthenticatedUser } from '../../../utils/auth'
import { useDatabase } from '../../../utils/database'
import { getMediaDirectory, getUploadedMediaType } from '../../../utils/media'

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  const { id: noteId } = getRouterParams(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }

  const db = await useDatabase()
  const note = await db.query(`
    SELECT 1 FROM notes WHERE id = $1 AND user_id = $2 AND workspace_id = $3
  `, [noteId, user.id, workspaceId])
  if (!note.rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  const contentLength = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > 51 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'File exceeds the 50 MB upload limit' })
  }

  const parts = await readMultipartFormData(event)
  const upload = parts?.find(part => part.name === 'file')
  if (!upload?.data.length || !upload.type) {
    throw createError({ statusCode: 400, statusMessage: 'Choose an image or video to upload' })
  }

  const mediaType = getUploadedMediaType(upload.type, upload.data)
  if (!mediaType) {
    throw createError({ statusCode: 415, statusMessage: 'Use a JPEG, PNG, GIF, or WebP image, or an MP4 or WebM video' })
  }
  if (upload.data.length > mediaType.maxSize) {
    const limit = mediaType.kind === 'image' ? '20 MB' : '50 MB'
    throw createError({ statusCode: 413, statusMessage: `File exceeds the ${limit} upload limit` })
  }

  const assetId = randomUUID()
  const mediaDirectory = getMediaDirectory()
  const filePath = join(mediaDirectory, `${assetId}.${mediaType.extension}`)
  await mkdir(mediaDirectory, { recursive: true })
  await writeFile(filePath, upload.data, { flag: 'wx', mode: 0o600 })

  try {
    await db.query(`
      INSERT INTO media_assets (id, user_id, note_id, mime_type, extension)
      VALUES ($1, $2, $3, $4, $5)
    `, [assetId, user.id, noteId, mediaType.mimeType, mediaType.extension])
  } catch (error) {
    try {
      await unlink(filePath)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Could not save the uploaded media or clean up its temporary file',
        { cause: cleanupError }
      )
    }
    throw error
  }

  return {
    id: assetId,
    kind: mediaType.kind,
    url: `/api/media/${assetId}`
  }
})

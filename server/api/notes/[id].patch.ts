import { createError, getQuery, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

interface UpdateNoteBody {
  title?: unknown
  content?: unknown
}

export default defineEventHandler(async (event) => {
  const user = requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }
  const body = await readBody<UpdateNoteBody | null>(event) ?? {}
  const hasTitle = Object.hasOwn(body, 'title')
  const hasContent = Object.hasOwn(body, 'content')
  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const content = typeof body.content === 'string' ? body.content : undefined

  if (!hasTitle && !hasContent) {
    throw createError({ statusCode: 400, statusMessage: 'No note changes were provided' })
  }
  if (hasTitle && (!title || title.length > 200)) {
    throw createError({ statusCode: 400, statusMessage: 'Note title must be between 1 and 200 characters' })
  }
  if (hasContent && (content === undefined || content.length > 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Note content is invalid or too large' })
  }

  const db = useDatabase()
  const result = db.prepare(`
    UPDATE notes
    SET title = CASE WHEN ? THEN ? ELSE title END,
        content = CASE WHEN ? THEN ? ELSE content END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND workspace_id = ?
  `).run(
    hasTitle ? 1 : 0,
    title ?? '',
    hasContent ? 1 : 0,
    content ?? '',
    id,
    user.id,
    workspaceId
  )

  if (result.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  return { success: true }
})

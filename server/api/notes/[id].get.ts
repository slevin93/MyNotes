import { createError, getQuery } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { formatTimestamp, useDatabase } from '../../utils/database'
import type { Note } from '#shared/types'

export default defineEventHandler(async (event): Promise<Note> => {
  const user = await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }

  const db = await useDatabase()
  const result = await db.query<{
    id: string
    workspace_id: string
    parent_id: string | null
    title: string
    icon: string
    content: string
    created_at: Date | string
    updated_at: Date | string
  }>(`
    SELECT id, workspace_id, parent_id, title, icon, content, created_at, updated_at
    FROM notes WHERE id = $1 AND user_id = $2 AND workspace_id = $3
  `, [id, user.id, workspaceId])
  const row = result.rows[0]

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    title: row.title,
    icon: row.icon,
    content: row.content,
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at)
  }
})

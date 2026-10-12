import { createError, getQuery } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { Note } from '#shared/types'

export default defineEventHandler((event): Note => {
  const user = requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }

  const row = useDatabase().prepare(`
    SELECT id, workspace_id, parent_id, title, icon, content, created_at, updated_at
    FROM notes WHERE id = ? AND user_id = ? AND workspace_id = ?
  `).get(id, user.id, workspaceId) as {
    id: string
    workspace_id: string
    parent_id: string | null
    title: string
    icon: string
    content: string
    created_at: string
    updated_at: string
  } | undefined

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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
})

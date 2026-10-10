import { createError, getQuery } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { Note } from '#shared/types'

interface NoteRecord {
  id: string
  workspace_id: string
  parent_id: string | null
  title: string
  content: string
  created_at: string
  updated_at: string
}

export default defineEventHandler((event): Note[] => {
  const user = requireAuthenticatedUser(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }

  const db = useDatabase()
  if (!db.prepare('SELECT 1 FROM workspaces WHERE id = ? AND user_id = ?').get(workspaceId, user.id)) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  }

  const rows = db.prepare(`
    SELECT id, workspace_id, parent_id, title, content, created_at, updated_at
    FROM notes
    WHERE user_id = ? AND workspace_id = ?
    ORDER BY created_at, id
  `).all(user.id, workspaceId) as NoteRecord[]

  return rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
})

import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { Note } from '#shared/types'

interface CreateNoteBody {
  title?: unknown
  parentId?: unknown
  workspaceId?: unknown
}

export default defineEventHandler(async (event): Promise<Note> => {
  const user = requireAuthenticatedUser(event)
  const body = await readBody<CreateNoteBody | null>(event) ?? {}
  const title = typeof body.title === 'string' ? body.title.trim() : 'Untitled note'
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : ''
  const parentId = body.parentId === null || body.parentId === undefined
    ? null
    : typeof body.parentId === 'string' ? body.parentId : undefined

  if (title.length < 1 || title.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Note title must be between 1 and 200 characters' })
  }
  if (parentId === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid parent note' })
  }
  if (!workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }

  const db = useDatabase()
  if (!db.prepare('SELECT 1 FROM workspaces WHERE id = ? AND user_id = ?').get(workspaceId, user.id)) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  }
  if (parentId && !db.prepare(`
    SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND workspace_id = ?
  `).get(parentId, user.id, workspaceId)) {
    throw createError({ statusCode: 404, statusMessage: 'Parent note not found in this workspace' })
  }

  const id = randomUUID()
  db.prepare('INSERT INTO notes (id, user_id, workspace_id, parent_id, title) VALUES (?, ?, ?, ?, ?)')
    .run(id, user.id, workspaceId, parentId, title)
  const created = db.prepare(`
    SELECT id, workspace_id, parent_id, title, content, created_at, updated_at
    FROM notes WHERE id = ? AND user_id = ?
  `).get(id, user.id) as {
    id: string
    workspace_id: string
    parent_id: string | null
    title: string
    content: string
    created_at: string
    updated_at: string
  }

  return {
    id: created.id,
    workspaceId: created.workspace_id,
    parentId: created.parent_id,
    title: created.title,
    content: created.content,
    createdAt: created.created_at,
    updatedAt: created.updated_at
  }
})

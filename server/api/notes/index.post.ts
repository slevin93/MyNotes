import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { formatTimestamp, useDatabase } from '../../utils/database'
import type { Note } from '#shared/types'

interface CreateNoteBody {
  title?: unknown
  parentId?: unknown
  workspaceId?: unknown
}

export default defineEventHandler(async (event): Promise<Note> => {
  const user = await requireAuthenticatedUser(event)
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

  const db = await useDatabase()
  const workspace = await db.query('SELECT 1 FROM workspaces WHERE id = $1 AND user_id = $2', [workspaceId, user.id])
  if (!workspace.rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  }
  if (parentId && !(await db.query(`
    SELECT 1 FROM notes WHERE id = $1 AND user_id = $2 AND workspace_id = $3
  `, [parentId, user.id, workspaceId])).rowCount) {
    throw createError({ statusCode: 404, statusMessage: 'Parent note not found in this workspace' })
  }

  const id = randomUUID()
  await db.query('INSERT INTO notes (id, user_id, workspace_id, parent_id, title) VALUES ($1, $2, $3, $4, $5)', [
    id,
    user.id,
    workspaceId,
    parentId,
    title
  ])
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
    FROM notes WHERE id = $1 AND user_id = $2
  `, [id, user.id])
  const created = result.rows[0]
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the created note' })
  }

  return {
    id: created.id,
    workspaceId: created.workspace_id,
    parentId: created.parent_id,
    title: created.title,
    icon: created.icon,
    content: created.content,
    createdAt: formatTimestamp(created.created_at),
    updatedAt: formatTimestamp(created.updated_at)
  }
})

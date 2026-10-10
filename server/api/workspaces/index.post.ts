import { randomUUID } from 'node:crypto'
import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { Workspace } from '#shared/types'

interface CreateWorkspaceBody {
  name?: unknown
}

export default defineEventHandler(async (event): Promise<Workspace> => {
  const user = requireAuthenticatedUser(event)
  const body = await readBody<CreateWorkspaceBody | null>(event) ?? {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!name || name.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace name must be between 1 and 80 characters' })
  }

  const db = useDatabase()
  const id = randomUUID()
  try {
    db.prepare('INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)').run(id, user.id, name)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw createError({ statusCode: 409, statusMessage: 'A workspace with this name already exists' })
    }
    throw error
  }

  const row = db.prepare('SELECT id, name, created_at FROM workspaces WHERE id = ?').get(id) as {
    id: string
    name: string
    created_at: string
  }

  return { id: row.id, name: row.name, createdAt: row.created_at }
})

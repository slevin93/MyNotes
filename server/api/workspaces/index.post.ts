import { randomUUID } from 'node:crypto'
import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { formatTimestamp, useDatabase } from '../../utils/database'
import type { Workspace } from '#shared/types'

interface CreateWorkspaceBody {
  name?: unknown
}

export default defineEventHandler(async (event): Promise<Workspace> => {
  const user = await requireAuthenticatedUser(event)
  const body = await readBody<CreateWorkspaceBody | null>(event) ?? {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!name || name.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace name must be between 1 and 80 characters' })
  }

  const db = await useDatabase()
  const id = randomUUID()
  try {
    await db.query('INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)', [id, user.id, name])
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'A workspace with this name already exists' })
    }
    throw error
  }

  const result = await db.query<{
    id: string
    name: string
    created_at: Date | string
  }>('SELECT id, name, created_at FROM workspaces WHERE id = $1', [id])
  const row = result.rows[0]
  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the created workspace' })
  }

  return { id: row.id, name: row.name, createdAt: formatTimestamp(row.created_at) }
})

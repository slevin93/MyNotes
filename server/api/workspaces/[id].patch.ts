import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

interface UpdateWorkspaceBody {
  name?: unknown
}

export default defineEventHandler(async (event) => {
  const user = requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const body = await readBody<UpdateWorkspaceBody | null>(event) ?? {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!name || name.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace name must be between 1 and 80 characters' })
  }

  const db = useDatabase()
  try {
    const result = db.prepare(`
      UPDATE workspaces
      SET name = ?
      WHERE id = ? AND user_id = ?
    `).run(name, id, user.id)

    if (result.changes === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw createError({ statusCode: 409, statusMessage: 'A workspace with this name already exists' })
    }
    throw error
  }

  return { success: true }
})

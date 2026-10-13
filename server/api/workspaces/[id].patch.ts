import { createError, readBody } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

interface UpdateWorkspaceBody {
  name?: unknown
}

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const body = await readBody<UpdateWorkspaceBody | null>(event) ?? {}
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!name || name.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace name must be between 1 and 80 characters' })
  }

  const db = await useDatabase()
  try {
    const result = await db.query(`
      UPDATE workspaces
      SET name = $1
      WHERE id = $2 AND user_id = $3
    `, [name, id, user.id])

    if (result.rowCount === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'A workspace with this name already exists' })
    }
    throw error
  }

  return { success: true }
})

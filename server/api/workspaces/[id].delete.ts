import { createError } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const db = await useDatabase()
  const result = await db.query(`
    DELETE FROM workspaces
    WHERE id = $1 AND user_id = $2
  `, [id, user.id])

  if (result.rowCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  }

  return { success: true }
})

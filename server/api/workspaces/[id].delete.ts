import { createError } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  const user = requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const result = useDatabase().prepare(`
    DELETE FROM workspaces
    WHERE id = ? AND user_id = ?
  `).run(id, user.id)

  if (result.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  }

  return { success: true }
})

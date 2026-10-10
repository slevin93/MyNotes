import { createError, getQuery } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  const user = requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }
  const db = useDatabase()
  const result = db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM notes WHERE id = ? AND user_id = ? AND workspace_id = ?
      UNION ALL
      SELECT child.id
      FROM notes child
      JOIN subtree parent ON child.parent_id = parent.id
      WHERE child.user_id = ? AND child.workspace_id = ?
    )
    DELETE FROM notes
    WHERE id IN (SELECT id FROM subtree) AND user_id = ? AND workspace_id = ?
  `).run(id, user.id, workspaceId, user.id, workspaceId, user.id, workspaceId)

  if (result.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  return { success: true }
})

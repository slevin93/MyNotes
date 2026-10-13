import { createError, getQuery } from 'h3'
import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  const workspaceId = getQuery(event).workspaceId
  if (typeof workspaceId !== 'string' || !workspaceId) {
    throw createError({ statusCode: 400, statusMessage: 'Workspace is required' })
  }
  const db = await useDatabase()
  const result = await db.query(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM notes WHERE id = $1 AND user_id = $2 AND workspace_id = $3
      UNION ALL
      SELECT child.id
      FROM notes child
      JOIN subtree parent ON child.parent_id = parent.id
      WHERE child.user_id = $4 AND child.workspace_id = $5
    )
    DELETE FROM notes
    WHERE id IN (SELECT id FROM subtree) AND user_id = $6 AND workspace_id = $7
  `, [id, user.id, workspaceId, user.id, workspaceId, user.id, workspaceId])

  if (result.rowCount === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  return { success: true }
})

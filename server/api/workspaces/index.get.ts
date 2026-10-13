import { requireAuthenticatedUser } from '../../utils/auth'
import { formatTimestamp, useDatabase } from '../../utils/database'
import type { Workspace } from '#shared/types'

interface WorkspaceRecord {
  id: string
  name: string
  created_at: Date | string
}

export default defineEventHandler(async (event): Promise<Workspace[]> => {
  const user = await requireAuthenticatedUser(event)
  const db = await useDatabase()
  const result = await db.query<WorkspaceRecord>(`
    SELECT id, name, created_at
    FROM workspaces
    WHERE user_id = $1
    ORDER BY created_at, id
  `, [user.id])

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    createdAt: formatTimestamp(row.created_at)
  }))
})

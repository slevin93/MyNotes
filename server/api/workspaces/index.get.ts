import { requireAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { Workspace } from '#shared/types'

interface WorkspaceRecord {
  id: string
  name: string
  created_at: string
}

export default defineEventHandler((event): Workspace[] => {
  const user = requireAuthenticatedUser(event)
  const rows = useDatabase().prepare(`
    SELECT id, name, created_at
    FROM workspaces
    WHERE user_id = ?
    ORDER BY created_at, id
  `).all(user.id) as WorkspaceRecord[]

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at
  }))
})

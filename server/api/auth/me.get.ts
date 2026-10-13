import { getAuthenticatedUser } from '../../utils/auth'
import { useDatabase } from '../../utils/database'

export default defineEventHandler(async (event) => {
  const db = await useDatabase()
  const user = await getAuthenticatedUser(event)
  const result = await db.query<{ has_users: boolean }>('SELECT EXISTS (SELECT 1 FROM users) AS has_users')
  return {
    user,
    setupRequired: !result.rows[0]?.has_users
  }
})

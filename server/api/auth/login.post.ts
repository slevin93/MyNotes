import { createError, defineEventHandler, readBody } from 'h3'
import { createUserSession, verifyPassword } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { AuthUser } from '#shared/types'

interface LoginBody {
  email?: unknown
  password?: unknown
  remember?: unknown
}

interface LoginRecord extends AuthUser {
  password_hash: Buffer
  password_salt: Buffer
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody | null>(event) ?? {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const db = await useDatabase()
  const result = await db.query<LoginRecord>(`
    SELECT id, email, password_hash, password_salt
    FROM users
    WHERE LOWER(email) = LOWER($1)
  `, [email])
  const user = result.rows[0]

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const authUser: AuthUser = { id: user.id, email: user.email }
  await createUserSession(event, authUser, body.remember === true)
  return { user: authUser }
})

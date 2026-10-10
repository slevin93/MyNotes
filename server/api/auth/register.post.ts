import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import { createUserSession, hashPassword } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { AuthUser } from '#shared/types'

interface RegisterBody {
  email?: unknown
  password?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterBody | null>(event) ?? {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address' })
  }
  if (password.length < 8 || password.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be between 8 and 128 characters' })
  }

  const db = useDatabase()
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
  }

  const id = randomUUID()
  const { salt, hash } = hashPassword(password)
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
        .run(id, email, hash, salt)
      db.prepare('INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, ?)')
        .run(randomUUID(), id, 'Personal')
    })()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
    }
    throw error
  }

  createUserSession(event, { id, email })
  const user: AuthUser = { id, email }
  return { user }
})

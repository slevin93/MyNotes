import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import { createUserSession, hashPassword } from '../../utils/auth'
import { useDatabase } from '../../utils/database'
import type { AuthUser } from '#shared/types'

interface SetupBody {
  email?: unknown
  password?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SetupBody | null>(event) ?? {}
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address' })
  }
  if (password.length < 8 || password.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be between 8 and 128 characters' })
  }

  const db = await useDatabase()
  const client = await db.connect()
  const id = randomUUID()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(1587389210)')
    const existingUser = await client.query('SELECT 1 FROM users LIMIT 1')
    if (existingUser.rowCount) {
      throw createError({ statusCode: 409, statusMessage: 'The initial account has already been created' })
    }

    const { salt, hash } = hashPassword(password)
    await client.query(
      'INSERT INTO users (id, email, password_hash, password_salt) VALUES ($1, $2, $3, $4)',
      [id, email, hash, salt]
    )
    await client.query(
      'INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)',
      [randomUUID(), id, 'Personal']
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists' })
    }
    throw error
  } finally {
    client.release()
  }

  const user: AuthUser = { id, email }
  await createUserSession(event, user)
  return { user }
})

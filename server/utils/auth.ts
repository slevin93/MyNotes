import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import type { AuthUser } from '#shared/types'
import { useDatabase } from './database'

const cookieName = 'my-notes-session'
const sessionDuration = 30 * 24 * 60 * 60 * 1000

interface UserRecord {
  id: string
  email: string
}

export function hashPassword(password: string, salt = randomBytes(16)) {
  return {
    salt,
    hash: scryptSync(password, salt, 64)
  }
}

export function verifyPassword(password: string, salt: Buffer, hash: Buffer) {
  const candidate = scryptSync(password, salt, hash.length)
  return timingSafeEqual(candidate, hash)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createUserSession(event: H3Event, user: UserRecord, remember = false) {
  const db = await useDatabase()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + sessionDuration
  await db.query('DELETE FROM sessions WHERE expires_at <= $1', [Date.now()])
  await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    user.id,
    expiresAt
  ])

  setCookie(event, cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(remember ? { maxAge: Math.floor(sessionDuration / 1000) } : {})
  })
}

export async function getAuthenticatedUser(event: H3Event): Promise<AuthUser | null> {
  const token = getCookie(event, cookieName)
  if (!token) {
    return null
  }

  const db = await useDatabase()
  const result = await db.query<UserRecord>(`
    SELECT users.id, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
  `, [hashToken(token), Date.now()])
  const row = result.rows[0]

  if (!row) {
    return null
  }

  return { id: row.id, email: row.email }
}

export async function requireAuthenticatedUser(event: H3Event) {
  const user = await getAuthenticatedUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  return user
}

export async function clearUserSession(event: H3Event) {
  const token = getCookie(event, cookieName)
  if (token) {
    await (await useDatabase()).query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  }

  deleteCookie(event, cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  })
}

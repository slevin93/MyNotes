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

export function createUserSession(event: H3Event, user: UserRecord, remember = false) {
  const db = useDatabase()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + sessionDuration
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), user.id, expiresAt)

  setCookie(event, cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(remember ? { maxAge: Math.floor(sessionDuration / 1000) } : {})
  })
}

export function getAuthenticatedUser(event: H3Event): AuthUser | null {
  const token = getCookie(event, cookieName)
  if (!token) {
    return null
  }

  const db = useDatabase()
  const row = db.prepare(`
    SELECT users.id, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), Date.now()) as UserRecord | undefined

  if (!row) {
    return null
  }

  return { id: row.id, email: row.email }
}

export function requireAuthenticatedUser(event: H3Event) {
  const user = getAuthenticatedUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  return user
}

export function clearUserSession(event: H3Event) {
  const token = getCookie(event, cookieName)
  if (token) {
    useDatabase().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  }

  deleteCookie(event, cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  })
}

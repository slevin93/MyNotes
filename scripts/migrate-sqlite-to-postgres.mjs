import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { createPostgresPool, initializeDatabase } from '../server/utils/database.ts'

const sourcePath = resolve(process.argv[2] ?? '.data/notes.sqlite')
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Set DATABASE_URL in .env before running the SQLite import.')
}
if (!existsSync(sourcePath)) {
  throw new Error(`SQLite database not found: ${sourcePath}`)
}

const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true })
const tables = new Set(sqlite.prepare(`
  SELECT name FROM sqlite_master WHERE type = 'table'
`).all().map(row => row.name))
const tableColumns = table => new Set(
  sqlite.pragma(`table_info(${table})`).map(column => column.name)
)
const columns = table => tableColumns(table)
const hasTable = table => tables.has(table)
const selectRows = (table, selection, orderBy = 'id') =>
  hasTable(table) ? sqlite.prepare(`SELECT ${selection} FROM ${table} ORDER BY ${orderBy}`).all() : []
const normalizeTimestamp = (value) => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value !== 'string') {
    return value
  }
  return /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
}

const users = selectRows('users', 'id, email, password_hash, password_salt, created_at', 'created_at, id')
const sourceWorkspaces = selectRows('workspaces', 'id, user_id, name, created_at', 'created_at, id')
const workspacesByUser = new Map()
for (const workspace of sourceWorkspaces) {
  const userWorkspaces = workspacesByUser.get(workspace.user_id) ?? []
  userWorkspaces.push(workspace)
  workspacesByUser.set(workspace.user_id, userWorkspaces)
}
const noteColumns = hasTable('notes') ? columns('notes') : new Set()
const notes = selectRows(
  'notes',
  [
    'id',
    'user_id',
    noteColumns.has('workspace_id') ? 'workspace_id' : 'NULL AS workspace_id',
    noteColumns.has('parent_id') ? 'parent_id' : 'NULL AS parent_id',
    'title',
    noteColumns.has('icon') ? 'icon' : '\'i-lucide-file-text\' AS icon',
    noteColumns.has('content') ? 'content' : '\'\' AS content',
    'created_at',
    noteColumns.has('updated_at') ? 'updated_at' : 'created_at AS updated_at'
  ].join(', '),
  'created_at, id'
)
const sessions = selectRows('sessions', 'token_hash, user_id, expires_at, created_at', 'created_at, token_hash')
const mediaAssets = selectRows(
  'media_assets',
  'id, user_id, note_id, mime_type, extension, created_at',
  'created_at, id'
)

const pool = createPostgresPool(connectionString)
try {
  await initializeDatabase(pool)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(1587389210)')
    const existing = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM workspaces) AS workspaces,
        (SELECT COUNT(*) FROM notes) AS notes,
        (SELECT COUNT(*) FROM sessions) AS sessions,
        (SELECT COUNT(*) FROM media_assets) AS media_assets
    `)
    if (Object.values(existing.rows[0]).some(count => Number(count) > 0)) {
      throw new Error('The PostgreSQL database is not empty. Import stopped without changing it.')
    }

    for (const user of users) {
      await client.query(
        'INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES ($1, $2, $3, $4, $5)',
        [user.id, user.email, user.password_hash, user.password_salt, normalizeTimestamp(user.created_at)]
      )
    }

    for (const workspace of sourceWorkspaces) {
      await client.query(
        'INSERT INTO workspaces (id, user_id, name, created_at) VALUES ($1, $2, $3, $4)',
        [workspace.id, workspace.user_id, workspace.name, normalizeTimestamp(workspace.created_at)]
      )
    }

    for (const user of users) {
      if (!workspacesByUser.has(user.id)) {
        const id = randomUUID()
        workspacesByUser.set(user.id, [{ id, user_id: user.id }])
        await client.query(
          'INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)',
          [id, user.id, 'Personal']
        )
      }
    }

    const workspaceIds = new Map(
      [...workspacesByUser].map(([userId, userWorkspaces]) => [
        userId,
        userWorkspaces[0]?.id
      ])
    )
    for (const note of notes) {
      await client.query(`
        INSERT INTO notes (
          id, user_id, workspace_id, parent_id, title, icon, content, created_at, updated_at
        ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8)
      `, [
        note.id,
        note.user_id,
        note.workspace_id ?? workspaceIds.get(note.user_id),
        note.title,
        note.icon,
        note.content,
        normalizeTimestamp(note.created_at),
        normalizeTimestamp(note.updated_at)
      ])
    }
    for (const note of notes) {
      if (note.parent_id) {
        await client.query('UPDATE notes SET parent_id = $1 WHERE id = $2', [note.parent_id, note.id])
      }
    }

    for (const session of sessions) {
      await client.query(
        'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)',
        [session.token_hash, session.user_id, session.expires_at, normalizeTimestamp(session.created_at)]
      )
    }
    for (const asset of mediaAssets) {
      await client.query(
        'INSERT INTO media_assets (id, user_id, note_id, mime_type, extension, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          asset.id,
          asset.user_id,
          asset.note_id,
          asset.mime_type,
          asset.extension,
          normalizeTimestamp(asset.created_at)
        ]
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  console.info(
    `Imported ${users.length} user(s), ${sourceWorkspaces.length} workspace(s), `
    + `${notes.length} note(s), ${sessions.length} session(s), and ${mediaAssets.length} media record(s).`
  )
  console.info('The SQLite source was opened read-only and has not been modified.')
} finally {
  sqlite.close()
  await pool.end()
}

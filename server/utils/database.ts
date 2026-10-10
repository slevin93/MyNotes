import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let database: Database.Database | undefined

export function useDatabase() {
  if (database) {
    return database
  }

  const config = useRuntimeConfig()
  const databasePath = resolve(process.cwd(), config.databasePath)
  mkdirSync(dirname(databasePath), { recursive: true })
  database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash BLOB NOT NULL,
      password_salt BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS media_assets_user_idx ON media_assets(user_id, id);
  `)

  const noteColumns = database.pragma('table_info(notes)') as { name: string }[]
  if (!noteColumns.some(column => column.name === 'workspace_id')) {
    database.exec('ALTER TABLE notes ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE')
  }

  const migrateWorkspaces = database.transaction(() => {
    const usersWithoutWorkspace = database!.prepare(`
      SELECT id FROM users
      WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.user_id = users.id)
    `).all() as { id: string }[]
    const createWorkspace = database!.prepare(`
      INSERT INTO workspaces (id, user_id, name) VALUES (?, ?, 'Personal')
    `)

    for (const user of usersWithoutWorkspace) {
      createWorkspace.run(randomUUID(), user.id)
    }

    database!.prepare(`
      UPDATE notes
      SET workspace_id = (
        SELECT workspaces.id FROM workspaces
        WHERE workspaces.user_id = notes.user_id
        ORDER BY workspaces.created_at, workspaces.id
        LIMIT 1
      )
      WHERE workspace_id IS NULL
    `).run()
  })
  migrateWorkspaces()

  database.exec(`
    CREATE INDEX IF NOT EXISTS workspaces_user_idx ON workspaces(user_id, created_at);
    CREATE INDEX IF NOT EXISTS notes_user_workspace_parent_idx ON notes(user_id, workspace_id, parent_id);
  `)

  return database
}

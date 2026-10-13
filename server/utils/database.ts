import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

let databasePromise: Promise<Pool> | undefined

const requiredColumns: Record<string, string[]> = {
  users: ['id', 'email', 'password_hash', 'password_salt', 'created_at'],
  sessions: ['token_hash', 'user_id', 'expires_at', 'created_at'],
  workspaces: ['id', 'user_id', 'name', 'created_at'],
  notes: [
    'id',
    'user_id',
    'workspace_id',
    'parent_id',
    'title',
    'icon',
    'content',
    'created_at',
    'updated_at'
  ],
  media_assets: ['id', 'user_id', 'note_id', 'mime_type', 'extension', 'created_at'],
  mail_settings: [
    'id',
    'imap_host',
    'imap_port',
    'imap_secure',
    'imap_username',
    'imap_password',
    'smtp_host',
    'smtp_port',
    'smtp_secure',
    'smtp_username',
    'smtp_password',
    'from_email',
    'updated_at'
  ],
  email_messages: [
    'id',
    'mailbox',
    'uid_validity',
    'uid',
    'message_id',
    'in_reply_to',
    'references_header',
    'sender_name',
    'sender_email',
    'recipients',
    'subject',
    'text_body',
    'received_at',
    'unread',
    'created_at'
  ]
}

export function createPostgresPool(connectionString: string) {
  const pool = new Pool({ connectionString })
  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error', error)
  })
  return pool
}

export async function initializeDatabase(pool: Pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(1587389210)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        password_hash BYTEA NOT NULL,
        password_salt BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'i-lucide-file-text',
        content TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS mail_settings (
        id TEXT PRIMARY KEY CHECK (id = 'default'),
        imap_host TEXT NOT NULL,
        imap_port INTEGER NOT NULL,
        imap_secure BOOLEAN NOT NULL,
        imap_username TEXT NOT NULL,
        imap_password TEXT NOT NULL,
        smtp_host TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        smtp_secure BOOLEAN NOT NULL,
        smtp_username TEXT NOT NULL,
        smtp_password TEXT NOT NULL,
        from_email TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS email_messages (
        id TEXT PRIMARY KEY,
        mailbox TEXT NOT NULL,
        uid_validity BIGINT NOT NULL,
        uid BIGINT NOT NULL,
        message_id TEXT,
        in_reply_to TEXT,
        references_header TEXT,
        sender_name TEXT NOT NULL DEFAULT '',
        sender_email TEXT NOT NULL,
        recipients TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        text_body TEXT NOT NULL DEFAULT '',
        received_at TIMESTAMPTZ NOT NULL,
        unread BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(mailbox, uid_validity, uid)
      );

      CREATE INDEX IF NOT EXISTS media_assets_user_idx ON media_assets(user_id, id);
      CREATE INDEX IF NOT EXISTS email_messages_folder_received_idx
        ON email_messages(mailbox, received_at DESC, uid DESC);
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'i-lucide-file-text';
    `)

    const usersWithoutWorkspace = await client.query<{ id: string }>(`
      SELECT id FROM users
      WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.user_id = users.id)
    `)
    for (const user of usersWithoutWorkspace.rows) {
      await client.query(
        'INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)',
        [randomUUID(), user.id, 'Personal']
      )
    }

    await client.query(`
      UPDATE notes
      SET workspace_id = (
        SELECT workspaces.id FROM workspaces
        WHERE workspaces.user_id = notes.user_id
        ORDER BY workspaces.created_at, workspaces.id
        LIMIT 1
      )
      WHERE workspace_id IS NULL
    `)
    await client.query('ALTER TABLE notes ALTER COLUMN workspace_id SET NOT NULL')
    await client.query(`
      CREATE INDEX IF NOT EXISTS workspaces_user_idx ON workspaces(user_id, created_at);
      CREATE INDEX IF NOT EXISTS notes_user_workspace_parent_idx ON notes(user_id, workspace_id, parent_id);
    `)

    const schema = await client.query<{ table_name: string, column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `, [Object.keys(requiredColumns)])
    const actualColumns = new Map<string, Set<string>>()
    for (const { table_name, column_name } of schema.rows) {
      const columns = actualColumns.get(table_name) ?? new Set<string>()
      columns.add(column_name)
      actualColumns.set(table_name, columns)
    }

    const missing = Object.entries(requiredColumns).flatMap(([table, columns]) =>
      columns
        .filter(column => !actualColumns.get(table)?.has(column))
        .map(column => `${table}.${column}`)
    )
    if (missing.length) {
      throw new Error(`PostgreSQL schema is incomplete; missing required columns: ${missing.join(', ')}`)
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function useDatabase() {
  if (!databasePromise) {
    const config = useRuntimeConfig()
    const connectionString = config.databaseUrl || process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is required to connect to PostgreSQL.')
    }

    const pool = createPostgresPool(connectionString)
    databasePromise = initializeDatabase(pool)
      .then(() => pool)
      .catch(async (error: unknown) => {
        databasePromise = undefined
        await pool.end()
        throw error
      })
  }

  return databasePromise
}

export function formatTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

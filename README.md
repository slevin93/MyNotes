# My Notes

A private, self-hosted notes app built with Nuxt. The single account, sessions, workspaces, and notes are stored in PostgreSQL.

## Setup

Use Node.js 22.22.3 or newer with npm 10.9.4 or newer. Create a PostgreSQL database, copy `.env.example` to `.env`, and set `DATABASE_URL` to the database connection string. Then install dependencies and start the development server:

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. On a new database, the app prompts you to create its one account. Once created, public account setup is permanently disabled for that database and sign-in is required.

The app creates and checks these PostgreSQL tables at startup: `users`, `sessions`, `workspaces`, `notes`, and `media_assets`. It reports an error and stops using an existing table if required columns are missing.

## Email

Set `MAIL_CREDENTIALS_KEY` in `.env` to a stable 32-byte key encoded as Base64. Generate one with:

```bash
openssl rand -base64 32
```

In **Mail settings**, configure one IMAP account for incoming mail and one SMTP account for outgoing mail. Saving verifies both server connections; TLS or STARTTLS is required. Passwords are encrypted in PostgreSQL using `MAIL_CREDENTIALS_KEY`, so keep the key private and back it up. The inbox discovers server folders, syncs when opened and every minute while open, displays email as plain text, and supports replies and remote deletion.

## Migrating from SQLite

Stop the app, set `DATABASE_URL` in `.env`, and run the importer **before creating an account in PostgreSQL**:

```bash
npm run migrate:postgres -- .data/notes.sqlite
```

The source file argument is optional and defaults to `.data/notes.sqlite`. The importer copies users, sessions, workspaces, notes, and media metadata in one transaction. It refuses to import into a PostgreSQL database that already contains data and opens the SQLite database read-only. Keep a backup of the SQLite database and copy `.data/uploads` as well if moving the app to another machine; media files are stored outside PostgreSQL.

## Features

- One-time account setup and password login, with scrypt password hashing.
- Opaque server-side sessions in PostgreSQL and HttpOnly, SameSite cookies.
- Each account has separate workspaces, each containing its own notes.
- Notes support child notes, editing, and recursive deletion.
- Note pages and note APIs are available only to authenticated users.

In production, serve the app over HTTPS so session cookies are marked `Secure`.

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

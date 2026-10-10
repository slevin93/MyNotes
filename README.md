# My Notes

A private, self-hosted notes app built with Nuxt. Accounts, sessions, workspaces, and notes are stored in SQLite.

## Setup

Use Node.js 22.22.3 or newer with npm 10.9.4 or newer, then install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and create an account. The SQLite database is created automatically at `.data/notes.sqlite`.

Set `NUXT_DATABASE_PATH` to choose a different database file. Back up the database file while the app is stopped, or use SQLite's online backup facilities when it is running.

## Features

- Password-based registration and login, with scrypt password hashing.
- Opaque server-side sessions in SQLite and HttpOnly, SameSite cookies.
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

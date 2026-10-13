export interface AuthUser {
  id: string
  email: string
}

export interface Workspace {
  id: string
  name: string
  createdAt: string
}

export interface Note {
  id: string
  workspaceId: string
  parentId: string | null
  title: string
  icon: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface NoteTreeItem extends Note {
  children: NoteTreeItem[]
}

export interface MailFolder {
  path: string
  name: string
  specialUse?: string
}

export interface EmailSummary {
  id: string
  mailbox: string
  senderName: string
  senderEmail: string
  subject: string
  receivedAt: string
  unread: boolean
}

export interface EmailMessage extends EmailSummary {
  recipients: string
  textBody: string
}

export interface MailSettings {
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUsername: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  fromEmail: string
  hasImapPassword: boolean
  hasSmtpPassword: boolean
}

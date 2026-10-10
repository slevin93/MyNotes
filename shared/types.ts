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
  content: string
  createdAt: string
  updatedAt: string
}

export interface NoteTreeItem extends Note {
  children: NoteTreeItem[]
}

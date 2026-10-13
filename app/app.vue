<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Note, NoteTreeItem, Workspace } from '#shared/types'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#00A155' }
  ],
  link: [
    { rel: 'manifest', href: '/manifest.webmanifest' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title: 'My Notes',
  description: 'A private space for your notes'
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const open = ref(true)
const colorMode = useColorMode()
const isAuthPage = computed(() => ['/login', '/register'].includes(route.path))
const requestFetch = useRequestFetch()

const { data: authState } = await useAsyncData('auth-state', () =>
  requestFetch<{ user: { id: string, email: string } | null }>('/api/auth/me'),
{
  watch: [isAuthPage]
})

const { data: workspaces, refresh: refreshWorkspaces } = await useAsyncData<Workspace[]>(
  'workspaces',
  () => authState.value?.user ? requestFetch<Workspace[]>('/api/workspaces') : Promise.resolve([]),
  {
    default: () => [],
    watch: [() => authState.value?.user?.id, isAuthPage]
  }
)

const activeWorkspaceId = computed(() => {
  const requestedId = typeof route.query.workspace === 'string' ? route.query.workspace : null
  return workspaces.value?.find(workspace => workspace.id === requestedId)?.id
    ?? workspaces.value?.[0]?.id
    ?? null
})
const activeWorkspace = computed(() =>
  workspaces.value?.find(workspace => workspace.id === activeWorkspaceId.value) ?? null
)

const { data: notes, status: notesStatus, error: notesError, refresh: refreshNotes } = await useAsyncData<Note[]>(
  'notes',
  () => authState.value?.user && activeWorkspaceId.value
    ? requestFetch<Note[]>('/api/notes', { query: { workspaceId: activeWorkspaceId.value } })
    : Promise.resolve([]),
  {
    default: () => [],
    watch: [() => authState.value?.user?.id, activeWorkspaceId, isAuthPage]
  }
)

function createNoteTree(items: Note[]): NoteTreeItem[] {
  const nodes = new Map<string, NoteTreeItem>()
  for (const item of items) {
    nodes.set(item.id, { ...item, children: [] })
  }

  const roots: NoteTreeItem[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

const noteTree = computed(() => createNoteTree(notes.value ?? []))
const workspaceDialogOpen = ref(false)
const workspaceDialogMode = ref<'create' | 'rename'>('create')
const editingWorkspaceId = ref<string | null>(null)
const workspaceName = ref('')
const workspaceError = ref('')
const workspaceDeleteConfirmation = ref(false)
const deleteDialogOpen = ref(false)
const deleteInProgress = ref(false)
const deleteTarget = ref<{ type: 'note', id: string, name: string } | { type: 'workspace', id: string, name: string } | null>(null)

function openCreateWorkspace() {
  workspaceDialogMode.value = 'create'
  editingWorkspaceId.value = null
  workspaceName.value = ''
  workspaceError.value = ''
  workspaceDeleteConfirmation.value = false
  workspaceDialogOpen.value = true
}

function openManageWorkspace() {
  if (!activeWorkspace.value) {
    return
  }
  workspaceDialogMode.value = 'rename'
  editingWorkspaceId.value = activeWorkspace.value.id
  workspaceName.value = activeWorkspace.value.name
  workspaceError.value = ''
  workspaceDeleteConfirmation.value = false
  workspaceDialogOpen.value = true
}

function requestDeleteWorkspace() {
  if (!activeWorkspace.value) {
    return
  }
  deleteTarget.value = {
    type: 'workspace',
    id: activeWorkspace.value.id,
    name: activeWorkspace.value.name
  }
  workspaceDeleteConfirmation.value = true
}

function onWorkspaceDialogOpenChange(isOpen: boolean) {
  if (!isOpen) {
    workspaceDeleteConfirmation.value = false
    if (deleteTarget.value?.type === 'workspace') {
      deleteTarget.value = null
    }
  }
}

function noteIsInSubtree(noteId: string, rootId: string) {
  let current = notes.value?.find(note => note.id === noteId)
  while (current) {
    if (current.id === rootId) {
      return true
    }
    const parentId = current.parentId
    current = parentId ? notes.value?.find(note => note.id === parentId) : undefined
  }
  return false
}

async function selectWorkspace(workspaceId: string) {
  if (workspaceId === activeWorkspaceId.value) {
    closeMobileSidebar()
    return
  }

  await router.push({ path: '/', query: { workspace: workspaceId } })
  closeMobileSidebar()
}

function closeMobileSidebar() {
  if (import.meta.client && window.matchMedia('(max-width: 1023px)').matches) {
    open.value = false
  }
}

async function selectNote(id: string) {
  await router.push({ path: '/', query: { workspace: activeWorkspaceId.value, note: id } })
}

async function saveWorkspace() {
  workspaceError.value = ''
  try {
    let workspaceId = editingWorkspaceId.value
    if (workspaceDialogMode.value === 'create') {
      const workspace = await $fetch<Workspace>('/api/workspaces', {
        method: 'POST',
        body: { name: workspaceName.value }
      })
      workspaceId = workspace.id
    } else {
      if (!workspaceId) {
        throw new Error('No workspace was selected to rename.')
      }
      await $fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: { name: workspaceName.value }
      })
    }
    await refreshWorkspaces()
    workspaceDialogOpen.value = false
    workspaceName.value = ''
    if (workspaceDialogMode.value === 'create' && workspaceId) {
      await router.push({ path: '/', query: { workspace: workspaceId } })
    }
  } catch (error) {
    workspaceError.value = getErrorMessage(error)
  }
}

async function addNote(parentId: string | null = null) {
  if (!activeWorkspaceId.value) {
    toast.add({ title: 'Create a workspace first', color: 'error' })
    return
  }

  try {
    const note = await $fetch<Note>('/api/notes', {
      method: 'POST',
      body: { title: 'Untitled note', parentId, workspaceId: activeWorkspaceId.value }
    })
    await refreshNotes()
    await router.push({ path: '/', query: { workspace: note.workspaceId, note: note.id } })
    closeMobileSidebar()
  } catch (error) {
    toast.add({ title: 'Could not create note', description: getErrorMessage(error), color: 'error' })
  }
}

function deleteNote(id: string) {
  const note = notes.value?.find(item => item.id === id)
  deleteTarget.value = { type: 'note', id, name: note?.title ?? 'this note' }
  deleteDialogOpen.value = true
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleteInProgress.value) {
    return
  }

  deleteInProgress.value = true
  try {
    if (target.type === 'note') {
      if (!activeWorkspaceId.value) {
        throw new Error('No workspace is selected.')
      }
      const selectedId = typeof route.query.note === 'string' ? route.query.note : null
      if (selectedId && noteIsInSubtree(selectedId, target.id)) {
        await router.push({ path: '/', query: { workspace: activeWorkspaceId.value } })
        if (route.query.note === selectedId) {
          throw new Error('Could not save the selected note before deleting it.')
        }
      }
      await $fetch(`/api/notes/${target.id}`, {
        method: 'DELETE',
        query: { workspaceId: activeWorkspaceId.value }
      })
      await refreshNotes()
    } else {
      const otherWorkspace = workspaces.value?.find(workspace => workspace.id !== target.id)
      await router.push({
        path: '/',
        query: otherWorkspace ? { workspace: otherWorkspace.id } : {}
      })
      if (typeof route.query.note === 'string') {
        throw new Error('Could not save the selected note before deleting its workspace.')
      }
      await $fetch(`/api/workspaces/${target.id}`, { method: 'DELETE' })
      await refreshWorkspaces()
      const nextWorkspace = workspaces.value?.[0]
      await router.push({
        path: '/',
        query: nextWorkspace ? { workspace: nextWorkspace.id } : {}
      })
    }

    deleteDialogOpen.value = false
    deleteTarget.value = null
    if (target.type === 'workspace') {
      workspaceDialogOpen.value = false
      workspaceDeleteConfirmation.value = false
    }
  } catch (error) {
    toast.add({
      title: target.type === 'note' ? 'Could not delete note' : 'Could not delete workspace',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    deleteInProgress.value = false
  }
}

async function logout() {
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await router.push('/login')
  } catch (error) {
    toast.add({ title: 'Could not log out', description: getErrorMessage(error), color: 'error' })
  }
}

const workspaceItems = computed<DropdownMenuItem[][]>(() => [
  (workspaces.value ?? []).map(workspace => ({
    label: workspace.name,
    icon: workspace.id === activeWorkspaceId.value ? 'i-lucide-check' : 'i-lucide-folder',
    onSelect() {
      selectWorkspace(workspace.id)
    }
  })),
  [
    {
      label: 'Edit workspace',
      icon: 'i-lucide-pencil',
      disabled: !activeWorkspace.value,
      onSelect: openManageWorkspace
    },
    {
      label: 'Create workspace',
      icon: 'i-lucide-plus',
      onSelect: openCreateWorkspace
    }
  ]
])

const userItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      children: [
        {
          label: 'Light',
          icon: 'i-lucide-sun',
          type: 'checkbox',
          checked: colorMode.value === 'light',
          onUpdateChecked(checked: boolean) {
            if (checked) {
              colorMode.preference = 'light'
            }
          },
          onSelect(event: Event) {
            event.preventDefault()
          }
        },
        {
          label: 'Dark',
          icon: 'i-lucide-moon',
          type: 'checkbox',
          checked: colorMode.value === 'dark',
          onUpdateChecked(checked: boolean) {
            if (checked) {
              colorMode.preference = 'dark'
            }
          },
          onSelect(event: Event) {
            event.preventDefault()
          }
        }
      ]
    }
  ],
  [{
    label: 'Log out',
    icon: 'i-lucide-log-out',
    onSelect: logout
  }]
])

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.'
}
</script>

<template>
  <NuxtPage
    v-if="isAuthPage"
    class="min-h-screen"
  />
  <div
    v-else
    class="flex min-h-screen flex-1"
  >
    <USidebar
      v-model:open="open"
      collapsible="icon"
      rail
      :ui="{
        container: 'h-full',
        inner: 'bg-elevated/25 divide-transparent',
        body: 'py-0'
      }"
    >
      <template #header="{ state }">
        <div
          v-if="state === 'expanded'"
          class="flex min-w-0 flex-1 items-center gap-1"
        >
          <UDropdownMenu
            :items="workspaceItems"
            :content="{ align: 'start', collisionPadding: 12 }"
            :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-48' }"
          >
            <UButton
              icon="i-lucide-panels-top-left"
              :label="activeWorkspace?.name ?? 'Workspaces'"
              trailing-icon="i-lucide-chevrons-up-down"
              color="neutral"
              variant="ghost"
              class="min-w-0 flex-1 justify-start overflow-hidden"
              :ui="{ trailingIcon: 'text-dimmed ms-auto' }"
            />
          </UDropdownMenu>
        </div>
      </template>

      <template #default="{ state }">
        <div class="space-y-1 px-2 py-3">
          <div
            v-if="state === 'expanded'"
            class="flex items-center justify-between gap-2 px-2 pb-1"
          >
            <p class="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted">
              {{ activeWorkspace?.name ?? 'Notes' }}
            </p>
            <div class="flex shrink-0 items-center gap-1">
              <UButton
                v-if="activeWorkspace"
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Create note in this workspace"
                title="Create note"
                @click="addNote()"
              />
            </div>
          </div>
          <NoteTree
            :items="noteTree"
            :selected-id="typeof route.query.note === 'string' ? route.query.note : null"
            :collapsed="state === 'collapsed'"
            @select="selectNote"
            @create-child="addNote"
            @delete="deleteNote"
          />
          <p
            v-if="!noteTree.length && activeWorkspace"
            class="px-2 py-3 text-sm text-muted"
          >
            {{ notesStatus === 'pending' ? 'Loading notes…' : 'Your notes will appear here.' }}
          </p>
          <p
            v-if="notesError"
            class="px-2 py-3 text-sm text-error"
            role="alert"
          >
            Could not load notes: {{ getErrorMessage(notesError) }}
          </p>
        </div>
      </template>

      <template #footer>
        <UDropdownMenu
          :items="userItems"
          :content="{ align: 'end', collisionPadding: 12 }"
        >
          <UButton
            icon="i-lucide-user-round"
            :label="authState?.user?.email ?? 'Account'"
            trailing-icon="i-lucide-chevrons-up-down"
            color="neutral"
            variant="ghost"
            class="w-full justify-start overflow-hidden"
          />
        </UDropdownMenu>
      </template>
    </USidebar>

    <main class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-10 flex h-(--ui-header-height) shrink-0 items-center gap-2 border-b border-default bg-default/95 px-3 backdrop-blur sm:px-4">
        <UButton
          :icon="open ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          color="neutral"
          variant="ghost"
          :aria-label="open ? 'Close sidebar' : 'Open sidebar'"
          :title="open ? 'Close sidebar' : 'Open sidebar'"
          @click="open = !open"
        />
        <UButton
          icon="i-lucide-plus"
          label="New note"
          color="neutral"
          variant="outline"
          class="ms-auto"
          @click="addNote()"
        />
      </header>
      <div class="min-h-0 flex-1 p-3 sm:p-4 md:p-8">
        <NuxtPage class="size-full" />
      </div>
    </main>
  </div>
  <UModal
    v-model:open="workspaceDialogOpen"
    :title="workspaceDialogMode === 'create' ? 'Create workspace' : 'Edit workspace'"
    :description="workspaceDialogMode === 'create' ? 'Give this workspace a name. Its notes will stay separate from other workspaces.' : 'Update the workspace name or delete this workspace.'"
    :ui="{
      overlay: 'z-[100]',
      content: 'z-[101]'
    }"
    @update:open="onWorkspaceDialogOpenChange"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="saveWorkspace"
      >
        <UFormField
          label="Workspace name"
          name="workspace-name"
          required
        >
          <UInput
            v-model="workspaceName"
            placeholder="e.g. Personal, Projects"
            maxlength="80"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="workspaceError"
          color="error"
          variant="subtle"
          :title="workspaceDialogMode === 'create' ? 'Could not create workspace' : 'Could not update workspace'"
          :description="workspaceError"
        />
        <UAlert
          v-if="workspaceDialogMode === 'rename' && workspaceDeleteConfirmation"
          color="error"
          variant="subtle"
          title="Delete this workspace?"
          :description="`“${deleteTarget?.name}” and all of its notes will be permanently deleted. This cannot be undone.`"
        />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UButton
            v-if="workspaceDialogMode === 'rename' && !workspaceDeleteConfirmation"
            type="button"
            label="Delete workspace"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            @click="requestDeleteWorkspace"
          />
          <div
            v-else-if="workspaceDialogMode === 'rename'"
            class="flex gap-2"
          >
            <UButton
              type="button"
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="workspaceDeleteConfirmation = false"
            />
            <UButton
              type="button"
              label="Delete workspace"
              color="error"
              :loading="deleteInProgress"
              @click="confirmDelete"
            />
          </div>
          <div
            v-if="!workspaceDeleteConfirmation"
            class="ms-auto flex gap-2"
          >
            <UButton
              type="button"
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="workspaceDialogOpen = false"
            />
            <UButton
              type="submit"
              :label="workspaceDialogMode === 'create' ? 'Create workspace' : 'Save name'"
              :disabled="!workspaceName.trim()"
            />
          </div>
        </div>
      </form>
    </template>
  </UModal>
  <UModal
    v-model:open="deleteDialogOpen"
    title="Delete note?"
    :description="`“${deleteTarget?.name}” and all of its child notes will be permanently deleted. This cannot be undone.`"
    :ui="{
      overlay: 'z-[100]',
      content: 'z-[101]'
    }"
    @update:open="open => !open && !deleteInProgress && (deleteTarget = null)"
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="deleteInProgress"
          @click="deleteDialogOpen = false; deleteTarget = null"
        />
        <UButton
          label="Delete"
          color="error"
          :loading="deleteInProgress"
          @click="confirmDelete"
        />
      </div>
    </template>
  </UModal>
</template>

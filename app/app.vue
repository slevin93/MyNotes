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
const createWorkspaceOpen = ref(false)
const workspaceName = ref('')
const workspaceError = ref('')

async function selectWorkspace(workspaceId: string) {
  if (workspaceId === activeWorkspaceId.value) {
    return
  }

  await router.push({ path: '/', query: { workspace: workspaceId } })
}

async function createWorkspace() {
  workspaceError.value = ''
  try {
    const workspace = await $fetch<Workspace>('/api/workspaces', {
      method: 'POST',
      body: { name: workspaceName.value }
    })
    await refreshWorkspaces()
    createWorkspaceOpen.value = false
    workspaceName.value = ''
    await router.push({ path: '/', query: { workspace: workspace.id } })
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
  } catch (error) {
    toast.add({ title: 'Could not create note', description: getErrorMessage(error), color: 'error' })
  }
}

async function deleteNote(id: string) {
  if (!window.confirm('Delete this note and all of its child notes? This cannot be undone.')) {
    return
  }

  try {
    if (!activeWorkspaceId.value) {
      return
    }

    await $fetch(`/api/notes/${id}`, {
      method: 'DELETE',
      query: { workspaceId: activeWorkspaceId.value }
    })
    const selectedId = typeof route.query.note === 'string' ? route.query.note : null
    if (selectedId && notes.value?.some(note => note.id === selectedId)) {
      const selected = notes.value.find(note => note.id === selectedId)
      let ancestor = selected?.parentId ?? null
      const descendants = new Set<string>([id])
      let deleted = selectedId === id
      while (ancestor) {
        if (descendants.has(ancestor)) {
          deleted = true
          break
        }
        const parent = notes.value?.find(note => note.id === ancestor)
        ancestor = parent?.parentId ?? null
      }
      if (deleted) {
        await router.push({ path: '/', query: { workspace: activeWorkspaceId.value } })
      }
    }
    await refreshNotes()
  } catch (error) {
    toast.add({ title: 'Could not delete note', description: getErrorMessage(error), color: 'error' })
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
  [{
    label: 'Create workspace',
    icon: 'i-lucide-plus',
    onSelect() {
      workspaceName.value = ''
      workspaceError.value = ''
      createWorkspaceOpen.value = true
    }
  }]
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
      <template #header>
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
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Create note in this workspace"
            @click="addNote()"
          />
        </div>
      </template>

      <template #default>
        <div class="space-y-1 px-2 py-3">
          <p class="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {{ activeWorkspace?.name ?? 'Notes' }}
          </p>
          <NoteTree
            :items="noteTree"
            :selected-id="typeof route.query.note === 'string' ? route.query.note : null"
            @select="id => router.push({ path: '/', query: { workspace: activeWorkspaceId, note: id } })"
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
      <header class="flex h-(--ui-header-height) shrink-0 items-center border-b border-default px-4">
        <UButton
          icon="i-lucide-panel-left"
          color="neutral"
          variant="ghost"
          aria-label="Toggle sidebar"
          @click="open = !open"
        />
      </header>
      <div class="min-h-0 flex-1 p-4 md:p-8">
        <NuxtPage class="size-full" />
      </div>
    </main>
  </div>
  <UModal
    v-model:open="createWorkspaceOpen"
    title="Create workspace"
    description="Give this workspace a name. Its notes will stay separate from other workspaces."
    :ui="{
      overlay: 'z-[100]',
      content: 'z-[101]'
    }"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="createWorkspace"
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
          title="Could not create workspace"
          :description="workspaceError"
        />
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="createWorkspaceOpen = false"
          />
          <UButton
            type="submit"
            label="Create workspace"
            :disabled="!workspaceName.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { EditorEmojiMenuItem, EditorSuggestionMenuItem } from '@nuxt/ui'
import type { Editor } from '@tiptap/core'
import { gitHubEmojis } from '@tiptap/extension-emoji'
import type { Note, Workspace } from '#shared/types'
import { Video } from '~/extensions/Video'

const route = useRoute()
const requestFetch = useRequestFetch()
const { data: workspaces } = useNuxtData<Workspace[]>('workspaces')
const noteId = computed(() => typeof route.query.note === 'string' ? route.query.note : null)
const workspaceId = computed(() => {
  const requestedId = typeof route.query.workspace === 'string' ? route.query.workspace : null
  return workspaces.value?.find(workspace => workspace.id === requestedId)?.id
    ?? workspaces.value?.[0]?.id
    ?? null
})

const { data: note, status } = await useAsyncData<Note | null>(
  'selected-note',
  () => noteId.value && workspaceId.value
    ? requestFetch<Note>(`/api/notes/${noteId.value}`, { query: { workspaceId: workspaceId.value } })
    : Promise.resolve(null),
  {
    watch: [noteId, workspaceId],
    default: () => null
  }
)

const title = ref('')
const content = ref('')
const isSaving = ref(false)
const errorMessage = ref('')
const savedAt = ref<number | null>(null)
const pictureInput = ref<HTMLInputElement>()
const videoInput = ref<HTMLInputElement>()
const activeUpload = shallowRef<{
  editor: Editor
  from: number
  to: number
  wasEditable: boolean
  kind: 'image' | 'video'
  noteId: string
  workspaceId: string
} | null>(null)
const mediaError = ref('')
let saveTimer: ReturnType<typeof setTimeout> | undefined
const isUploading = computed(() => activeUpload.value !== null)

watch(note, (value) => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  title.value = value?.title ?? ''
  content.value = value?.content ?? ''
  errorMessage.value = ''
  savedAt.value = value ? Date.now() : null
}, { immediate: true })

const isDirty = computed(() =>
  Boolean(note.value && (title.value !== note.value.title || content.value !== note.value.content))
)

function scheduleSave(delay = 800) {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
  if (!note.value || !isDirty.value || !title.value.trim()) {
    return
  }

  saveTimer = setTimeout(() => {
    saveTimer = undefined
    void saveNote()
  }, delay)
}

watch([title, content], () => {
  if (note.value) {
    errorMessage.value = ''
    scheduleSave()
  }
})

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
  }
})

onBeforeRouteUpdate(async () => {
  if (!isDirty.value) {
    return true
  }

  await saveNote()
  return !isDirty.value
})

onBeforeRouteLeave(async () => {
  if (!isDirty.value) {
    return true
  }

  await saveNote()
  return !isDirty.value
})

const suggestionItems: EditorSuggestionMenuItem[][] = [
  [
    {
      type: 'label',
      label: 'Text'
    },
    {
      kind: 'paragraph',
      label: 'Paragraph',
      icon: 'i-lucide-type'
    },
    {
      kind: 'heading',
      level: 1,
      label: 'Heading 1',
      icon: 'i-lucide-heading-1'
    },
    {
      kind: 'heading',
      level: 2,
      label: 'Heading 2',
      icon: 'i-lucide-heading-2'
    },
    {
      kind: 'heading',
      level: 3,
      label: 'Heading 3',
      icon: 'i-lucide-heading-3'
    }
  ],
  [
    {
      type: 'label',
      label: 'Lists'
    },
    {
      kind: 'bulletList',
      label: 'Bullet List',
      icon: 'i-lucide-list'
    },
    {
      kind: 'orderedList',
      label: 'Numbered List',
      icon: 'i-lucide-list-ordered'
    }
  ],
  [
    {
      type: 'label',
      label: 'Insert'
    },
    {
      kind: 'blockquote',
      label: 'Blockquote',
      icon: 'i-lucide-text-quote'
    },
    {
      kind: 'codeBlock',
      label: 'Code Block',
      icon: 'i-lucide-square-code'
    },
    {
      kind: 'horizontalRule',
      label: 'Divider',
      icon: 'i-lucide-separator-horizontal'
    }
  ],
  [
    {
      type: 'label',
      label: 'Media'
    },
    {
      kind: 'insertPicture',
      label: 'Picture',
      icon: 'i-lucide-image-plus'
    },
    {
      kind: 'insertVideo',
      label: 'Video',
      icon: 'i-lucide-video'
    }
  ]
]

const mediaHandlers = {
  insertPicture: {
    canExecute: () => !isUploading.value,
    execute: (editor: Editor) => {
      openMediaPicker('image', editor)
      return editor.chain()
    },
    isActive: () => false
  },
  insertVideo: {
    canExecute: () => !isUploading.value,
    execute: (editor: Editor) => {
      openMediaPicker('video', editor)
      return editor.chain()
    },
    isActive: () => false
  }
}

const emojiItems: EditorEmojiMenuItem[] = gitHubEmojis.filter(
  emoji => !emoji.name.startsWith('regional_indicator_')
)

function openMediaPicker(kind: 'image' | 'video', editor: Editor) {
  const selectedNote = note.value
  if (!selectedNote || activeUpload.value) {
    return
  }

  const input = kind === 'image' ? pictureInput.value : videoInput.value
  if (!input) {
    return
  }

  mediaError.value = ''
  activeUpload.value = {
    editor,
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    wasEditable: editor.isEditable,
    kind,
    noteId: selectedNote.id,
    workspaceId: selectedNote.workspaceId
  }
  editor.setEditable(false)
  input.value = ''
  input.click()
}

function cancelMediaUpload() {
  if (activeUpload.value) {
    finishMediaUpload(activeUpload.value)
  }
}

async function uploadMedia(kind: 'image' | 'video', event: Event) {
  const input = event.currentTarget
  const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined
  const upload = activeUpload.value

  if (!upload || upload.kind !== kind) {
    return
  }
  if (!file) {
    finishMediaUpload(upload)
    return
  }

  const formData = new FormData()
  formData.append('file', file)
  mediaError.value = ''

  try {
    const result = await $fetch<{ url: string }>(`/api/notes/${upload.noteId}/media`, {
      method: 'POST',
      body: formData,
      query: { workspaceId: upload.workspaceId }
    })

    if (!upload.editor.isDestroyed) {
      const chain = upload.editor.chain()
        .focus()
        .setTextSelection({ from: upload.from, to: upload.to })
      const inserted = kind === 'image'
        ? chain.setImage({ src: result.url, alt: file.name.replace(/[\r\n[\]\\]/g, ' ') }).run()
        : chain.insertContent({ type: 'video', attrs: { src: result.url } }).run()
      if (!inserted) {
        throw new Error('The uploaded file could not be inserted into this note.')
      }
    }
  } catch (error) {
    mediaError.value = error instanceof Error ? error.message : 'Please try again.'
  } finally {
    finishMediaUpload(upload)
    if (input instanceof HTMLInputElement) {
      input.value = ''
    }
  }
}

function finishMediaUpload(upload: NonNullable<typeof activeUpload.value>) {
  if (!upload.editor.isDestroyed) {
    upload.editor.setEditable(upload.wasEditable)
    if (upload.wasEditable) {
      upload.editor.commands.focus()
    }
  }
  if (activeUpload.value === upload) {
    activeUpload.value = null
  }
}

async function saveNote() {
  if (!note.value || !isDirty.value || isSaving.value) {
    return
  }

  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const noteId = note.value.id
  const workspaceId = note.value.workspaceId
  const savedTitle = title.value
  const savedContent = content.value
  const titleChanged = savedTitle !== note.value.title
  let saveSucceeded = false
  isSaving.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/notes/${noteId}`, {
      method: 'PATCH',
      body: { title: savedTitle, content: savedContent },
      query: { workspaceId }
    })
    saveSucceeded = true
    if (note.value?.id === noteId) {
      note.value = {
        ...note.value,
        title: savedTitle,
        content: savedContent
      }
      savedAt.value = Date.now()
    }
    if (titleChanged) {
      await refreshNuxtData('notes')
    }
  } catch (error) {
    if (note.value?.id === noteId) {
      errorMessage.value = error instanceof Error ? error.message : 'Please try again.'
    }
  } finally {
    isSaving.value = false
    if (isDirty.value) {
      const draftChangedDuringSave = title.value !== savedTitle || content.value !== savedContent
      if (saveSucceeded) {
        scheduleSave(0)
      } else if (draftChangedDuringSave) {
        scheduleSave()
      }
    }
  }
}
</script>

<template>
  <section
    v-if="note"
    class="mx-auto flex h-full max-w-4xl flex-col gap-5"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UInput
        v-model="title"
        aria-label="Note title"
        placeholder="Untitled note"
        size="xl"
        variant="none"
        class="min-w-0 flex-1 text-2xl font-semibold"
        :ui="{ base: 'px-0 text-2xl font-semibold' }"
        maxlength="200"
      />
      <div class="flex items-center gap-3">
        <span
          v-if="isUploading"
          class="text-sm text-muted"
          role="status"
        >Uploading…</span>
        <span
          v-else-if="isSaving"
          class="text-sm text-muted"
          role="status"
        >Saving…</span>
        <span
          v-else-if="isDirty && !errorMessage"
          class="text-sm text-muted"
        >Unsaved changes</span>
        <span
          v-else-if="savedAt && !errorMessage"
          class="text-sm text-muted"
          role="status"
        >Saved</span>
      </div>
    </div>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      title="Could not save note"
      :description="errorMessage"
    />
    <UAlert
      v-if="mediaError"
      color="error"
      variant="subtle"
      title="Could not upload media"
      :description="mediaError"
    />
    <input
      ref="pictureInput"
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      class="hidden"
      @cancel="cancelMediaUpload"
      @change="uploadMedia('image', $event)"
    >
    <input
      ref="videoInput"
      type="file"
      accept="video/mp4,video/webm"
      class="hidden"
      @cancel="cancelMediaUpload"
      @change="uploadMedia('video', $event)"
    >
    <UEditor
      v-slot="{ editor }"
      v-model="content"
      content-type="markdown"
      placeholder="Write your note..."
      :extensions="[Video]"
      :handlers="mediaHandlers"
      class="min-h-80 flex-1"
    >
      <div class="flex flex-wrap gap-2 border-b border-default px-3 py-2">
        <UButton
          icon="i-lucide-image-plus"
          label="Picture"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="isUploading"
          @click="openMediaPicker('image', editor)"
        />
        <UButton
          icon="i-lucide-video"
          label="Video"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="isUploading"
          @click="openMediaPicker('video', editor)"
        />
      </div>
      <UEditorSuggestionMenu
        :editor="editor"
        :items="suggestionItems"
      />
      <UEditorEmojiMenu
        :editor="editor"
        :items="emojiItems"
      />
      <UEditorDragHandle :editor="editor" />
    </UEditor>
  </section>

  <section
    v-else
    class="grid h-full min-h-80 place-items-center"
  >
    <div class="max-w-sm text-center">
      <span class="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-elevated">
        <UIcon
          name="i-lucide-notebook-pen"
          class="size-6 text-muted"
        />
      </span>
      <h1 class="text-lg font-semibold">
        Your notes, all in one place
      </h1>
      <p class="mt-2 text-sm text-muted">
        Create a note from the sidebar, or select an existing note to continue writing.
      </p>
      <p
        v-if="status === 'pending'"
        class="mt-3 text-sm text-muted"
      >
        Loading note…
      </p>
    </div>
  </section>
</template>

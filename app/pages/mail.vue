<script setup lang="ts">
import type { EmailSummary, MailFolder } from '#shared/types'

interface EmailDetail extends EmailSummary {
  recipients: string
  textBody: string
  replyAddress: string
  messageId: string | null
  references: string[]
}

const folders = ref<MailFolder[]>([])
const messages = ref<EmailSummary[]>([])
const selectedMailbox = ref('')
const selectedMessage = shallowRef<EmailDetail | null>(null)
const replyText = ref('')
const isLoading = ref(true)
const isSyncing = ref(false)
const isSending = ref(false)
const isDeleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
let refreshTimer: ReturnType<typeof setInterval> | undefined

const folderLabel = computed(() =>
  folders.value.find(folder => folder.path === selectedMailbox.value)?.name ?? selectedMailbox.value
)

async function loadFolders() {
  errorMessage.value = ''
  try {
    const result = await $fetch<{ folders: MailFolder[] }>('/api/mail/folders')
    folders.value = result.folders
    if (!folders.value.some(folder => folder.path === selectedMailbox.value)) {
      selectedMailbox.value = folders.value.find(folder => folder.specialUse === '\\Inbox')?.path
        ?? folders.value.find(folder => folder.path.toLowerCase() === 'inbox')?.path
        ?? folders.value[0]?.path
        ?? ''
    }
    if (selectedMailbox.value) {
      await syncMessages()
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function syncMessages() {
  if (!selectedMailbox.value || isSyncing.value) {
    return
  }

  isSyncing.value = true
  try {
    const result = await $fetch<{ messages: EmailSummary[] }>('/api/mail/sync', {
      method: 'POST',
      body: { mailbox: selectedMailbox.value }
    })
    messages.value = result.messages
    if (selectedMessage.value && !result.messages.some(message => message.id === selectedMessage.value?.id)) {
      selectedMessage.value = null
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSyncing.value = false
  }
}

async function selectFolder(path: string) {
  selectedMailbox.value = path
  messages.value = []
  selectedMessage.value = null
  await syncMessages()
}

async function openMessage(message: EmailSummary) {
  errorMessage.value = ''
  replyText.value = ''
  try {
    selectedMessage.value = await $fetch<EmailDetail>(`/api/mail/messages/${encodeURIComponent(message.id)}`)
    const index = messages.value.findIndex(item => item.id === message.id)
    if (index >= 0) {
      messages.value[index] = { ...messages.value[index]!, unread: false }
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  }
}

async function sendReply() {
  if (!selectedMessage.value || !replyText.value.trim()) {
    return
  }

  isSending.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await $fetch(`/api/mail/messages/${encodeURIComponent(selectedMessage.value.id)}/reply`, {
      method: 'POST',
      body: { text: replyText.value }
    })
    replyText.value = ''
    successMessage.value = 'Reply sent.'
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isSending.value = false
  }
}

async function deleteMessage() {
  if (!selectedMessage.value) {
    return
  }

  isDeleting.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/mail/messages/${encodeURIComponent(selectedMessage.value.id)}`, { method: 'DELETE' })
    selectedMessage.value = null
    await syncMessages()
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isDeleting.value = false
  }
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data
    if (data && typeof data === 'object' && 'statusMessage' in data && typeof data.statusMessage === 'string') {
      return data.statusMessage
    }
  }
  return error instanceof Error ? error.message : 'Please try again.'
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
}

onMounted(async () => {
  await loadFolders()
  refreshTimer = setInterval(() => void syncMessages(), 60_000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<template>
  <section class="flex h-full min-h-0 flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">
          Mail
        </h1>
        <p class="text-sm text-muted">
          {{ folderLabel || 'Your email folders' }}
          <span v-if="isSyncing"> · Syncing…</span>
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="isSyncing"
          @click="syncMessages"
        />
        <UButton
          icon="i-lucide-settings-2"
          label="Mail settings"
          color="neutral"
          variant="outline"
          to="/settings/mail"
        />
      </div>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      title="Mail action failed"
      :description="errorMessage"
    />
    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :title="successMessage"
    />

    <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[12rem_minmax(16rem,22rem)_minmax(0,1fr)]">
      <nav class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto">
        <button
          v-for="folder in folders"
          :key="folder.path"
          type="button"
          class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-elevated"
          :class="selectedMailbox === folder.path ? 'bg-elevated font-medium text-highlighted' : 'text-muted'"
          @click="selectFolder(folder.path)"
        >
          <UIcon
            name="i-lucide-folder"
            class="size-4 shrink-0"
          />
          <span class="truncate">{{ folder.name }}</span>
        </button>
        <p
          v-if="!folders.length && !isLoading"
          class="p-3 text-sm text-muted"
        >
          No mail folders found.
        </p>
      </nav>

      <div class="min-h-0 overflow-y-auto rounded-lg border border-default">
        <p
          v-if="isLoading"
          class="p-4 text-sm text-muted"
          role="status"
        >
          Loading mail…
        </p>
        <button
          v-for="message in messages"
          :key="message.id"
          type="button"
          class="flex w-full flex-col gap-1 border-b border-default px-4 py-3 text-left hover:bg-elevated/60"
          :class="[
            selectedMessage?.id === message.id ? 'bg-elevated' : '',
            message.unread ? 'font-semibold text-highlighted' : 'text-muted'
          ]"
          @click="openMessage(message)"
        >
          <span class="flex min-w-0 items-center justify-between gap-2">
            <span class="truncate">{{ message.senderName || message.senderEmail }}</span>
            <span class="shrink-0 text-xs font-normal">{{ formatDate(message.receivedAt) }}</span>
          </span>
          <span class="truncate text-sm">{{ message.subject || '(No subject)' }}</span>
          <span class="truncate text-xs font-normal">{{ message.senderEmail }}</span>
        </button>
        <p
          v-if="!isLoading && !messages.length"
          class="p-4 text-sm text-muted"
        >
          {{ isSyncing ? 'Checking for messages…' : 'This folder is empty.' }}
        </p>
      </div>

      <article class="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-default">
        <template v-if="selectedMessage">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-default p-4">
            <div class="min-w-0">
              <h2 class="break-words text-lg font-semibold">
                {{ selectedMessage.subject || '(No subject)' }}
              </h2>
              <p class="mt-2 break-all text-sm">
                {{ selectedMessage.senderName ? `${selectedMessage.senderName} <${selectedMessage.senderEmail}>` : selectedMessage.senderEmail }}
              </p>
              <p class="break-all text-xs text-muted">
                To: {{ selectedMessage.recipients || '—' }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ formatDate(selectedMessage.receivedAt) }}
              </p>
            </div>
            <UButton
              label="Delete"
              icon="i-lucide-trash-2"
              color="error"
              variant="outline"
              :loading="isDeleting"
              @click="deleteMessage"
            />
          </div>
          <pre class="min-h-40 flex-1 whitespace-pre-wrap break-words p-4 font-sans text-sm leading-6">{{ selectedMessage.textBody || '(This email has no plain-text body.)' }}</pre>
          <form
            class="space-y-3 border-t border-default p-4"
            @submit.prevent="sendReply"
          >
            <p class="text-sm text-muted">
              Reply to {{ selectedMessage.replyAddress }}
            </p>
            <UTextarea
              v-model="replyText"
              placeholder="Write your reply…"
              :rows="5"
              :maxlength="100000"
              required
              class="w-full"
            />
            <div class="flex justify-end">
              <UButton
                type="submit"
                label="Send reply"
                icon="i-lucide-send"
                :loading="isSending"
                :disabled="!replyText.trim()"
              />
            </div>
          </form>
        </template>
        <p
          v-else
          class="grid flex-1 place-items-center p-6 text-center text-sm text-muted"
        >
          Select an email to read it.
        </p>
      </article>
    </div>
  </section>
</template>

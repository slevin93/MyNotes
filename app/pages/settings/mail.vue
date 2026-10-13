<script setup lang="ts">
import type { MailSettings } from '#shared/types'

const isLoading = ref(true)
const isSaving = ref(false)
const settingsError = ref('')
const successMessage = ref('')
const settings = reactive({
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUsername: '',
  imapPassword: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUsername: '',
  smtpPassword: '',
  fromEmail: ''
})
const hasImapPassword = ref(false)
const hasSmtpPassword = ref(false)
const encryptionConfigured = ref(false)

async function loadSettings() {
  isLoading.value = true
  settingsError.value = ''
  try {
    const result = await $fetch<{
      settings: MailSettings | null
      encryptionConfigured: boolean
    }>('/api/mail/settings')
    encryptionConfigured.value = result.encryptionConfigured
    if (result.settings) {
      Object.assign(settings, result.settings)
      hasImapPassword.value = result.settings.hasImapPassword
      hasSmtpPassword.value = result.settings.hasSmtpPassword
    }
  } catch (error) {
    settingsError.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}

async function saveSettings() {
  isSaving.value = true
  settingsError.value = ''
  successMessage.value = ''
  try {
    await $fetch('/api/mail/settings', {
      method: 'PUT',
      body: { ...settings }
    })
    settings.imapPassword = ''
    settings.smtpPassword = ''
    hasImapPassword.value = true
    hasSmtpPassword.value = true
    successMessage.value = 'Mail connections verified and settings saved.'
  } catch (error) {
    settingsError.value = getErrorMessage(error)
  } finally {
    isSaving.value = false
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

onMounted(loadSettings)
</script>

<template>
  <section class="mx-auto flex h-full max-w-3xl flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold">
        Mail settings
      </h1>
      <p class="mt-1 text-sm text-muted">
        Connect one mailbox using IMAP for incoming mail and SMTP for outgoing mail.
      </p>
    </div>

    <UAlert
      v-if="isLoading"
      color="neutral"
      variant="subtle"
      title="Loading mail settings"
      description="Checking whether an email account is configured."
    />
    <template v-else>
      <UAlert
        v-if="!encryptionConfigured"
        color="warning"
        variant="subtle"
        title="Set MAIL_CREDENTIALS_KEY before saving"
        description="Add a stable, base64-encoded 32-byte key to .env (for example: openssl rand -base64 32). Mail passwords are encrypted in the database with this key. Keep it private and back it up."
      />
      <UAlert
        v-if="settingsError"
        color="error"
        variant="subtle"
        title="Could not save mail settings"
        :description="settingsError"
      />
      <UAlert
        v-if="successMessage"
        color="success"
        variant="subtle"
        title="Mail settings saved"
        :description="successMessage"
      />

      <form
        class="space-y-6"
        @submit.prevent="saveSettings"
      >
        <UCard>
          <template #header>
            <h2 class="font-semibold">
              Incoming mail (IMAP)
            </h2>
          </template>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="IMAP host"
              name="imap-host"
              required
            >
              <UInput
                v-model="settings.imapHost"
                placeholder="imap.example.com"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Port"
              name="imap-port"
              required
            >
              <UInput
                v-model.number="settings.imapPort"
                type="number"
                min="1"
                max="65535"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Username"
              name="imap-username"
              required
            >
              <UInput
                v-model="settings.imapUsername"
                autocomplete="username"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Password"
              name="imap-password"
              :required="!hasImapPassword"
            >
              <UInput
                v-model="settings.imapPassword"
                type="password"
                autocomplete="new-password"
                :placeholder="hasImapPassword ? 'Leave blank to keep saved password' : 'IMAP password or app password'"
                :required="!hasImapPassword"
                class="w-full"
              />
            </UFormField>
            <label class="flex items-center gap-2 text-sm sm:col-span-2">
              <UCheckbox v-model="settings.imapSecure" />
              Use implicit TLS (usually port 993; otherwise STARTTLS is required)
            </label>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold">
              Outgoing mail (SMTP)
            </h2>
          </template>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="SMTP host"
              name="smtp-host"
              required
            >
              <UInput
                v-model="settings.smtpHost"
                placeholder="smtp.example.com"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Port"
              name="smtp-port"
              required
            >
              <UInput
                v-model.number="settings.smtpPort"
                type="number"
                min="1"
                max="65535"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Username"
              name="smtp-username"
              required
            >
              <UInput
                v-model="settings.smtpUsername"
                autocomplete="username"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Password"
              name="smtp-password"
              :required="!hasSmtpPassword"
            >
              <UInput
                v-model="settings.smtpPassword"
                type="password"
                autocomplete="new-password"
                :placeholder="hasSmtpPassword ? 'Leave blank to keep saved password' : 'SMTP password or app password'"
                :required="!hasSmtpPassword"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="From email address"
              name="from-email"
              required
              class="sm:col-span-2"
            >
              <UInput
                v-model="settings.fromEmail"
                type="email"
                placeholder="you@example.com"
                required
                class="w-full"
              />
            </UFormField>
            <label class="flex items-center gap-2 text-sm sm:col-span-2">
              <UCheckbox v-model="settings.smtpSecure" />
              Use implicit TLS (usually port 465; otherwise STARTTLS is required)
            </label>
          </div>
        </UCard>

        <div class="flex justify-end">
          <UButton
            type="submit"
            label="Test connections and save"
            icon="i-lucide-save"
            :loading="isSaving"
          />
        </div>
      </form>
    </template>
  </section>
</template>

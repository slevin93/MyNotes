<script setup lang="ts">
const email = ref('')
const password = ref('')
const remember = ref(false)
const errorMessage = ref('')
const isSubmitting = ref(false)

async function login() {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value, remember: remember.value }
    })
    await navigateTo('/')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-elevated/30 p-4">
    <UPageCard class="w-full max-w-md shadow-sm">
      <div class="mb-6 text-center">
        <span class="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-primary text-white">
          <UIcon
            name="i-lucide-notebook-pen"
            class="size-5"
          />
        </span>
        <h1 class="text-2xl font-semibold">
          Welcome back
        </h1>
        <p class="mt-1 text-sm text-muted">
          Sign in to continue to your notes.
        </p>
      </div>

      <form
        class="space-y-4"
        @submit.prevent="login"
      >
        <UFormField
          label="Email"
          name="email"
          required
        >
          <UInput
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Password"
          name="password"
          required
        >
          <UInput
            v-model="password"
            type="password"
            placeholder="Your password"
            autocomplete="current-password"
            required
            class="w-full"
          />
        </UFormField>
        <label class="flex items-center gap-2 text-sm text-muted">
          <UCheckbox v-model="remember" />
          Remember me for 30 days
        </label>
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          title="Could not sign in"
          :description="errorMessage"
        />
        <UButton
          type="submit"
          label="Sign in"
          block
          :loading="isSubmitting"
        />
      </form>
    </UPageCard>
  </main>
</template>

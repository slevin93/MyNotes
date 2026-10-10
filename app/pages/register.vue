<script setup lang="ts">
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function register() {
  errorMessage.value = ''
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  isSubmitting.value = true
  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email: email.value, password: password.value }
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
          Create your account
        </h1>
        <p class="mt-1 text-sm text-muted">
          Keep your notes private and organized.
        </p>
      </div>

      <form
        class="space-y-4"
        @submit.prevent="register"
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
            placeholder="At least 8 characters"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            required
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Confirm password"
          name="confirm-password"
          required
        >
          <UInput
            v-model="confirmPassword"
            type="password"
            placeholder="Enter your password again"
            autocomplete="new-password"
            minlength="8"
            maxlength="128"
            required
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          title="Could not create your account"
          :description="errorMessage"
        />
        <UButton
          type="submit"
          label="Create account"
          block
          :loading="isSubmitting"
        />
      </form>

      <p class="mt-5 text-center text-sm text-muted">
        Already registered?
        <NuxtLink
          to="/login"
          class="font-medium text-primary hover:underline"
        >Sign in</NuxtLink>
      </p>
    </UPageCard>
  </main>
</template>

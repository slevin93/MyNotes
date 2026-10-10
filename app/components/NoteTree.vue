<script setup lang="ts">
import type { NoteTreeItem } from '#shared/types'

defineProps<{
  items: NoteTreeItem[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  createChild: [id: string]
  delete: [id: string]
}>()
</script>

<template>
  <ul class="space-y-0.5">
    <li
      v-for="item in items"
      :key="item.id"
    >
      <div
        class="group flex min-w-0 items-center gap-1 rounded-md"
        :class="selectedId === item.id ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated/60 hover:text-highlighted'"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 truncate px-2 py-1.5 text-left text-sm"
          :aria-current="selectedId === item.id ? 'page' : undefined"
          @click="emit('select', item.id)"
        >
          <UIcon
            name="i-lucide-file-text"
            class="size-4 shrink-0"
          />
          <span class="truncate">{{ item.title }}</span>
        </button>
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Add child note"
          class="opacity-0 group-hover:opacity-100 focus:opacity-100"
          @click="emit('createChild', item.id)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          aria-label="Delete note"
          class="me-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
          @click="emit('delete', item.id)"
        />
      </div>
      <div
        v-if="item.children.length"
        class="ms-3 border-s border-default ps-1"
      >
        <NoteTree
          :items="item.children"
          :selected-id="selectedId"
          @select="emit('select', $event)"
          @create-child="emit('createChild', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </li>
  </ul>
</template>

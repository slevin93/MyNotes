<script setup lang="ts">
import type { NoteTreeItem } from '#shared/types'

defineProps<{
  items: NoteTreeItem[]
  selectedId: string | null
  collapsed: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  createChild: [id: string]
  delete: [id: string]
}>()

const collapsedItems = ref(new Set<string>())

function toggleChildren(id: string) {
  const next = new Set(collapsedItems.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  collapsedItems.value = next
}
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
          :class="collapsed ? 'justify-center px-0' : ''"
          :aria-current="selectedId === item.id ? 'page' : undefined"
          :title="item.title"
          @click="emit('select', item.id)"
        >
          <UIcon
            :name="item.icon"
            class="size-4 shrink-0"
          />
          <span
            v-if="!collapsed"
            class="truncate"
          >{{ item.title }}</span>
        </button>
        <UButton
          v-if="item.children.length && !collapsed"
          :icon="collapsedItems.has(item.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="collapsedItems.has(item.id) ? 'Expand child notes' : 'Collapse child notes'"
          :aria-expanded="!collapsedItems.has(item.id)"
          :title="collapsedItems.has(item.id) ? 'Expand child notes' : 'Collapse child notes'"
          @click="toggleChildren(item.id)"
        />
        <UButton
          v-if="!collapsed"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Add child note"
          class="opacity-0 group-hover:opacity-100 focus:opacity-100"
          @click="emit('createChild', item.id)"
        />
        <UButton
          v-if="!collapsed"
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
        v-if="item.children.length && !collapsed && !collapsedItems.has(item.id)"
        class="ms-3 border-s border-default ps-1"
      >
        <NoteTree
          :items="item.children"
          :selected-id="selectedId"
          :collapsed="collapsed"
          @select="emit('select', $event)"
          @create-child="emit('createChild', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </li>
  </ul>
</template>

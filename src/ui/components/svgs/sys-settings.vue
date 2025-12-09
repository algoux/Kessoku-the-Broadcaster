<script lang="ts">
import { Vue, Options } from 'vue-class-component';

@Options({})
export default class SysSettingsIcon extends Vue {}
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    style="color: var(--font-secondary-color)"
    stroke-linejoin="round"
  >
    <path d="M14 17H5" />
    <path d="M19 7h-9" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </svg>
</template>

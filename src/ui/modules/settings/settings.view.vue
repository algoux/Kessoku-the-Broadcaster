<script lang="ts">
import { Vue, Options } from 'vue-class-component';

@Options({})
export default class SettingsView extends Vue {

}
</script>

<template>
    <div class="settings-view">
        Settings View
    </div>
</template>

<style scoped lang="less">
.settings-view {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--font-secondary-color);
}
</style>
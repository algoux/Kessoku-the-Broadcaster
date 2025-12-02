<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { ElCheckbox } from 'element-plus';

@Options({
    components: {
        ElCheckbox,
    },
})
export default class SettingsContent extends Vue {}
</script>

<template>
    <div class="settings-content">
        <div class="settings-content-box">
            <div class="settings-content-section">
                <p class="settings-content-section-title">系统设置</p>
                <el-checkbox >开机自启动</el-checkbox>
            </div>
            <div class="settings-content-section">
                <p class="settings-content-section-title">视频缓存路径</p>
                
            </div>
        </div>
    </div>
</template>

<style scoped lang="less">
.settings-content {
    width: 70%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 5px ;
    &-box {
        width: 100%;
        height: 100%;
        margin: auto;
        background-color: var(--bg-primary-color);
        border-radius: 10px;
        padding-top: 40px;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    &-section {
        width: 80%;
        height: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        color: var(--font-primary-color);
    }
}
</style>
# 架构总览（跨文件理解）

## 进程边界
- **主进程**：`src/electron/main.ts`
  - 窗口创建（登录/主窗口/设置）、托盘、IPC 注册、WebSocket 生命周期、录制服务、配置服务。
- **预加载层**：`src/electron/preload.cts`
  - 统一暴露 `window.electron`，负责 renderer ↔ main 的 IPC 桥接。
- **渲染进程**：`src/ui/**`
  - Vue 3（class-style 组件）+ Hash Router（`/`、`/login`、`/settings`）。

## 关键链路
- 登录链路：`login-form.vue` -> `window.electron.login` -> `WebSocketService.connect`。
- 就绪与推流链路：
  1. `HomeView` 上报设备状态 `reportDeviceState`
  2. main 调 `confirmReady`
  3. main 发送 `transport-ready`
  4. `RendererService + MediasoupClient` 初始化 transport 并 `produce`
- 录制/回看链路：
  - renderer `RecordRTC` 按片段发送 blob -> main `VideoRecordingService` 落盘 -> ffmpeg 裁剪回看片段。

## 状态组织方式
- `HomeView` 是渲染层状态中心，通过 `@Provide` 向 `home-header`、`device-card`、`config-dialog` 等子组件注入共享状态与操作。

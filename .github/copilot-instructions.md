# 仓库 Copilot 指令

## 指令入口（自动读取）
- 本文件用于放置全局规则与跨文件约束。
- 细分规则放在 `.github/instructions/*.instructions.md`，会与本文件一起自动读取。
- 本仓库使用中文维护指令文件。

## 构建、校验与打包命令
- 安装依赖：`pnpm install`
  - 会触发 `postinstall`，执行 `node scripts/setup-ffmpeg.js` 下载当前平台 ffmpeg 资源。
- 本地开发：`pnpm dev`（并行启动 Vite + Electron）。
- 构建渲染进程：`pnpm run build`（输出 `dist/ui`）。
- 转译 Electron 代码：`pnpm run transpile:electron`（输出 `dist/electron`）。
- 打包命令：
  - `pnpm run dist:mac` / `dist:win` / `dist:linux`
  - `pnpm run dist:mac:arm64` / `dist:mac:x64` / `dist:win:x64` / `dist:win:arm64` / `dist:linux:x64` / `dist:linux:arm64`
- lint：`pnpm run lint`

## 测试现状
- 当前仓库没有 `test` 脚本，也没有测试文件约定。
- 因此当前不存在“单测/单文件测试”命令。

## 高层架构
- **主进程**（`src/electron/main.ts`）：窗口管理、IPC 注册、WebSocket、配置管理、录制与回放处理。
- **预加载层**（`src/electron/preload.cts`）：通过 `contextBridge` 暴露统一的 `window.electron` API。
- **渲染层**（`src/ui/**`）：Vue 3 + Hash 路由；`HomeView` 通过 `@Provide` 管理并分发共享状态。
- **推流链路**：`DeviceManager` 采集设备 -> `RendererService/MediasoupClient` 初始化 transport 并 produce -> main 通过 IPC 转发服务端请求。
- **录制回放链路**：renderer 用 `RecordRTC` 分片上报 -> main `VideoRecordingService` 落盘 -> ffmpeg 裁剪回放片段。

## 关键约定
- 跨进程 DTO 统一定义在 `src/common/config.interface.ts`，避免重复定义 payload。
- IPC 变更必须同步 `types.d.ts`、`src/electron/preload.cts`、`src/electron/main.ts` 三处。
- 渲染层仅通过 `window.electron.*` 调用 IPC，不直接用 `ipcRenderer`。
- 设备 `classId` 规则：`<type>_main`、`<type>_<index>`；该 ID 用作服务端 `trackId`，需保持稳定。
- Simulcast 持久化仅保存 `rid/scaleResolutionDownBy/maxBitRate`，`maxFramerate` 只在运行时注入。
- 用户配置/日志/缓存目录：`~/.Kessoku-the-Broadcaster/`。
- 资源路径需区分环境：开发环境走仓库 `resources/**`，打包后走 `process.resourcesPath/**`。
- 路径别名：`@ -> src/ui`，`common -> src/common`。
- 版本基线：`.node-version` 为 `v20`；CI 发布流使用 Node 22 + pnpm 9。

## 分文件规则索引
- `10-build-commands.instructions.md`：命令与测试现状
- `20-architecture.instructions.md`：跨文件架构与关键链路
- `30-ipc-contract.instructions.md`：IPC 合同同步规则
- `40-device-conventions.instructions.md`：设备、classId、simulcast 与配置落盘
- `50-release-and-env.instructions.md`：发布流程、环境与 ffmpeg 约定

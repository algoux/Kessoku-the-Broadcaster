# 构建与校验命令约定

## 依赖与开发
- 安装依赖：`pnpm install`
  - 会触发 `postinstall`，执行 `node scripts/setup-ffmpeg.js` 下载当前平台的 ffmpeg/ffprobe 到 `resources/ffmpeg/<platform>-<arch>/`。
- 本地开发：`pnpm dev`（并行启动 Vite 与 Electron）。

## 构建与打包
- 仅构建渲染进程：`pnpm run build`（输出 `dist/ui`）。
- 仅转译 Electron 主进程/预加载：`pnpm run transpile:electron`（输出 `dist/electron`）。
- 打包：
  - 通用：`pnpm run dist:mac` / `pnpm run dist:win` / `pnpm run dist:linux`
  - 指定架构：`pnpm run dist:mac:arm64`、`dist:mac:x64`、`dist:win:x64`、`dist:win:arm64`、`dist:linux:x64`、`dist:linux:arm64`
- lint：`pnpm run lint`

## 测试现状
- 当前 `package.json` 未提供 `test` 脚本，仓库内也没有测试文件约定。
- 因此当前不存在“单测/单文件测试”命令。

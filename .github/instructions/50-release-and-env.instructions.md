# 发布与环境约定

## 版本与运行环境
- 本地版本线索：
  - `.node-version` 为 `v20`
  - README 标注 `pnpm v8`
- CI 发布工作流（`.github/workflows/ci.yml`）当前使用 Node 22 + pnpm 9。
- 如调整 Node/pnpm 策略，需要同步检查本地文档与 CI。

## ffmpeg 相关
- `pnpm install` 后会执行 `scripts/setup-ffmpeg.js` 下载当前平台 ffmpeg。
- 运行时 ffmpeg 路径由 `src/electron/utils/path-resolver.ts` 统一解析：
  - 开发环境：仓库 `resources/ffmpeg/...`
  - 打包环境：`process.resourcesPath/ffmpeg/...`

## 用户数据目录
- 配置/日志/缓存位于：`~/.Kessoku-the-Broadcaster/`
  - `config.json`
  - `logs/`
  - `cache/`

## 发布脚本与 CI 联动
- 打包脚本定义在 `package.json` 的 `dist:*`。
- CI 基于 tag 触发，并按平台/架构矩阵调用对应 `dist:*` 命令。
- 若改动打包命令或产物命名，需要同步更新 `ci.yml` 中 matrix 与 artifact 匹配规则。

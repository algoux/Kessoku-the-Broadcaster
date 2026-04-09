# 设备与推流约定

## classId 规则（高优先级）
- 设备业务标识使用 `classId`，格式为 `<type>_main` 或 `<type>_<index>`。
  - 例如：`screen_main`、`camera_0`、`microphone_1`。
- `classId` 既用于本地设备管理，也作为上报/推流时的 `trackId`，需保持稳定。

## 设备配置持久化
- 视频设备（screen/camera）持久化字段：
  - `id`, `classId`, `name`, `width`, `height`, `frameRate`, `simulcastConfigs`
- 麦克风持久化字段：
  - `id`, `classId`, `name`, `sampleRate`, `channelCount`, `channelMode`
- 持久化入口：
  - 视频：`window.electron.updateVideoConfig(...)`
  - 音频：`window.electron.updateAudioConfig(...)`

## Simulcast 约束
- 配置文件中只保存：`rid`, `scaleResolutionDownBy`, `maxBitRate`。
- 运行时才注入 `maxFramerate`（基于当前帧率），不要把运行时字段写回配置。

## 修改设备参数时
- 调整约束后要刷新 `settings/capabilities/formatSetting`，并同步写回配置。
- 删除设备时要先停流再更新配置，避免遗留无效 stream 引用。

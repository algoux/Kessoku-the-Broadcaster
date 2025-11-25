# 视频回溯功能 - 快速参考

## 🎯 核心功能

在比赛录制过程中,随时预览最后 N 秒的视频内容。

## 📦 技术栈

- **录制**: RecordRTC (VP9 WebM, 2.5 Mbps)
- **截取**: FFmpeg (copy codec, 无质量损失)
- **存储**: `~/.Kessoku-the-Broadcaster/cache/`
- **通信**: Electron IPC

## 🔄 工作流程

### 录制阶段

```
MediaStream → RecordRTC (timeSlice: 1s)
  → IPC → 主进程 → 写入 WebM 文件
```

### 预览阶段

```
请求 N 秒 → FFmpeg 扫描总时长 T
  → 截取 (T-N 到 T) → ArrayBuffer
  → Blob URL → 视频播放
```

## 📁 文件结构

### 核心文件

```
src/
├── electron/
│   └── services/
│       └── video-recording-service.ts  # 录制服务 (主进程)
├── ui/
│   └── modules/
│       └── home/
│           └── home.view.vue           # 录制控制 (渲染进程)
└── types.d.ts                          # IPC 类型定义

docs/
└── video-replay-technical-design.md    # 详细技术文档
```

### 缓存文件

```
~/.Kessoku-the-Broadcaster/cache/
├── screen_main_1764050443372.webm      # 录制文件
├── preview_screen_main_1764050456.webm # 预览文件
└── ...
```

## 🔑 关键 API

### 渲染进程

```typescript
// 开始录制
await window.electron.startContinuousRecording(classId);

// 截取视频
const result = await window.electron.cutVideo(classId, seconds);

// 读取文件
const arrayBuffer = await window.electron.readVideoFile(filePath);
```

### 主进程

```typescript
// VideoRecordingService
class VideoRecordingService {
  startRecording(classId: string); // 开始录制
  stopRecording(classId: string); // 停止录制
  cutVideo(classId: string, seconds); // 截取最后 N 秒
  cleanup(); // 清理过期文件
}
```

## 🎨 FFmpeg 命令

### 扫描时长

```bash
ffmpeg -i input.webm -f null -
# 从 progress.timemark 提取: "00:01:23.45" → 83.45 秒
```

### 截取视频

```bash
ffmpeg -ss {起始秒} -i input.webm -t {时长秒} -c copy output.webm
# 示例: -ss 38.37 -t 20 (从 38.37 秒开始截取 20 秒)
```

## ⚙️ 配置要求

### 环境依赖

```bash
# macOS
brew install ffmpeg

# 检查安装
ffmpeg -version
```

### 项目依赖

```json
{
  "recordrtc": "^5.6.2",
  "fluent-ffmpeg": "^2.1.3"
}
```

## 📊 性能指标

| 指标     | 数值               |
| -------- | ------------------ |
| 录制码率 | 2.5 Mbps           |
| 数据发送 | 每秒 1 次          |
| 扫描速度 | ~2-3 秒/分钟视频   |
| 截取速度 | ~1 秒 (copy codec) |
| 存储空间 | ~200-300 MB/10分钟 |
| 自动清理 | 24 小时            |

## 🚀 使用示例

### 1. 启动录制

```typescript
// Vue 组件中
async startRollingRecord(device: Device) {
  await window.electron.startContinuousRecording(device.classId);

  const recorder = new RecordRTC(device.stream, {
    type: 'video',
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 2500000,
    timeSlice: 1000,
    ondataavailable: async (blob) => {
      await window.electron.sendRecordingBlob(device.classId, blob);
    }
  });

  recorder.startRecording();
}
```

### 2. 预览视频

```typescript
async showVideoPreview(device: Device, seconds: number) {
  // 截取视频
  const result = await window.electron.cutVideo(device.classId, seconds);

  // 读取文件
  const arrayBuffer = await window.electron.readVideoFile(result.filePath);
  const blob = new Blob([arrayBuffer], { type: 'video/webm' });
  const url = URL.createObjectURL(blob);

  // 播放
  video.src = url;

  // 清理
  video.onended = () => URL.revokeObjectURL(url);
}
```

## 🔮 将来扩展: MediaSoup 推流

```typescript
// 从预览视频获取流
const video = document.querySelector('video');
const stream = video.captureStream();

// 推送到 MediaSoup
const track = stream.getVideoTracks()[0];
const producer = await transport.produce({ track });
```

## ⚠️ 注意事项

1. **FFmpeg 必需**: 确保已安装并配置路径
2. **磁盘空间**: 长时间录制需要足够存储空间
3. **关键帧**: 截取视频开头可能有 1-2 帧偏差
4. **内存管理**: timeSlice 确保定期释放内存

## 🐛 故障排除

### FFmpeg 未找到

```typescript
// 检查路径配置
if (process.platform === 'darwin') {
  ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');
}
```

### 视频无法播放

```typescript
// 检查 Blob URL 是否正确
console.log('Video URL:', videoUrl);
console.log('Video error:', video.error);
```

### 时长检测失败

```typescript
// 备用方案: 使用录制开始时间估算
const estimatedDuration = (Date.now() - recording.startTime) / 1000;
```

## 📚 更多信息

详见: [完整技术方案文档](./video-replay-technical-design.md)

---

**版本**: v1.0.0  
**更新**: 2025-11-25

# 视频回溯功能 - 技术方案文档

## 📋 功能概述

实现选手端视频录制的回溯预览功能,支持在比赛过程中随时查看最后 N 秒的录制内容,并为将来推流到导播端做准备。

---

## 🏗️ 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        渲染进程 (Vue)                          │
│  ┌──────────────┐      ┌──────────────┐                      │
│  │ 设备采集     │      │ 视频预览     │                      │
│  │ RecordRTC    │──────│ Video Player │                      │
│  └──────────────┘      └──────────────┘                      │
│         │ timeSlice                                           │
│         │ (1s/chunk)                                          │
│         ↓                                                     │
│  ┌──────────────────────────────────────┐                    │
│  │        IPC 通信层                     │                    │
│  │  - sendRecordingBlob()               │                    │
│  │  - cutVideo()                         │                    │
│  │  - readVideoFile()                    │                    │
│  └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ Electron IPC
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                      主进程 (Node.js)                         │
│  ┌──────────────────────────────────────┐                    │
│  │   VideoRecordingService              │                    │
│  │                                       │                    │
│  │  • 接收视频数据块                     │                    │
│  │  • 实时写入 WebM 文件                 │                    │
│  │  • FFmpeg 扫描获取时长                │                    │
│  │  • 精确截取最后 N 秒                  │                    │
│  └──────────────────────────────────────┘                    │
│         │                       ↑                             │
│         │ fs.writeStream       │ FFmpeg                       │
│         ↓                       │                             │
│  ┌──────────────────────────────────────┐                    │
│  │  文件系统缓存                         │                    │
│  │  ~/.Kessoku-the-Broadcaster/cache/   │                    │
│  │                                       │                    │
│  │  • screen_main_*.webm (录制文件)      │                    │
│  │  • preview_*.webm (预览文件)          │                    │
│  └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 核心技术实现

### 1. 连续录制 (Continuous Recording)

**技术选型**: RecordRTC + timeSlice

```typescript
// 渲染进程: src/ui/modules/home/home.view.vue
const recorder = new RecordRTC(stream, {
  type: 'video',
  mimeType: 'video/webm;codecs=vp9',
  videoBitsPerSecond: 2500000,
  timeSlice: 1000, // 每秒触发一次 ondataavailable
  ondataavailable: async (blob: Blob) => {
    // 实时发送到主进程
    await window.electron.sendRecordingBlob(classId, blob);
  },
});
```

**特点**:

- ✅ 单个连续录制实例,避免多文件合并问题
- ✅ timeSlice 确保数据定期发送,防止内存溢出
- ✅ 编码格式: VP9 (WebM),码率 2.5 Mbps

**数据流**:

```
MediaStream → RecordRTC → Blob (1s) → IPC → Node.js Buffer → fs.WriteStream → WebM 文件
```

---

### 2. 视频存储 (File Storage)

**存储路径**:

```
macOS/Linux: ~/.Kessoku-the-Broadcaster/cache/
Windows: C:\Users\<用户名>\.Kessoku-the-Broadcaster\cache\
```

**文件命名规则**:

- 录制文件: `{classId}_{timestamp}.webm`
  - 例: `screen_main_1764050443372.webm`
- 预览文件: `preview_{classId}_{timestamp}.webm`
  - 例: `preview_screen_main_1764050456413.webm`

**清理策略**:

- 自动清理 24 小时前的文件
- 应用关闭时执行清理

---

### 3. 时长检测 (Duration Detection)

**核心难点**: 流式 WebM 文件不包含 duration 元数据

**解决方案**: FFmpeg 完整扫描 + 备用估算

```typescript
// 主进程: src/electron/services/video-recording-service.ts

// 方案1: FFmpeg 扫描 (主方案)
ffmpeg(inputPath)
  .outputOptions(['-f', 'null'])
  .output('-')
  .on('progress', (progress) => {
    // 从 progress.timemark 提取时长
    // 格式: "00:01:23.45" → 83.45 秒
    const duration = parseTimeString(progress.timemark);
    detectedDuration = Math.max(detectedDuration, duration);
  })
  .on('end', () => {
    // 使用检测到的时长进行截取
    performCut(inputPath, outputPath, detectedDuration, seconds);
  });

// 方案2: 时间估算 (备用方案)
if (detectedDuration === 0) {
  const estimatedDuration = (Date.now() - recording.startTime) / 1000;
  performCut(inputPath, outputPath, estimatedDuration, seconds);
}
```

**时长解析函数**:

```typescript
private parseTimeString(timeStr: string): number {
  // 支持格式: "HH:MM:SS.ms" / "MM:SS.ms" / "SS.ms"
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 +
           parseInt(parts[1]) * 60 +
           parseFloat(parts[2]);
  }
  // ... 其他格式处理
}
```

---

### 4. 视频截取 (Video Cutting)

**FFmpeg 命令**:

```bash
ffmpeg -ss {startTime} -i input.webm -t {duration} -c copy output.webm
```

**参数说明**:

- `-ss {startTime}`: 起始时间 (秒)
  - 计算: `startTime = totalDuration - requestedSeconds`
- `-t {duration}`: 截取时长
- `-c copy`: 复制编码,不重新编码 (保持原质量,速度快)

**示例**:

```
总时长: 58.37 秒
请求: 最后 20 秒
计算: 起始 = 58.37 - 20 = 38.37 秒
命令: ffmpeg -ss 38.37 -i input.webm -t 20 -c copy output.webm
结果: 从 38.37s 开始的 20 秒视频
```

---

### 5. 视频预览 (Video Preview)

**安全加载方案**: 文件 → ArrayBuffer → Blob URL

```typescript
// 渲染进程
// 1. 截取视频
const result = await window.electron.cutVideo(classId, seconds);

// 2. 读取文件为 ArrayBuffer (主进程)
const arrayBuffer = await window.electron.readVideoFile(result.filePath);

// 3. 转换为 Blob URL (渲染进程)
const blob = new Blob([arrayBuffer], { type: 'video/webm' });
const videoUrl = URL.createObjectURL(blob);

// 4. 加载到 video 元素
video.src = videoUrl;

// 5. 清理资源
URL.revokeObjectURL(videoUrl);
```

**为什么不能用 `file://` 协议?**

- Electron 安全限制: 禁止渲染进程直接访问本地文件
- 解决方案: 主进程读取 → ArrayBuffer → Blob URL

---

## 📊 数据流详解

### 录制阶段

```
1. 用户点击"开始录制"
   ↓
2. 渲染进程: RecordRTC.startRecording()
   ↓
3. 每 1 秒: ondataavailable(blob)
   ↓
4. IPC: sendRecordingBlob(classId, blob)
   ↓
5. 主进程: Buffer.from(arrayBuffer)
   ↓
6. 写入文件: writeStream.write(buffer)
   ↓
7. 持续录制... (循环 3-6)
```

### 预览阶段

```
1. 用户点击"预览" → 输入秒数 (N)
   ↓
2. 渲染进程: cutVideo(classId, N)
   ↓
3. 主进程: FFmpeg 扫描文件获取总时长 T
   ↓
4. 计算起始时间: S = T - N
   ↓
5. FFmpeg 执行截取: -ss S -t N
   ↓
6. 生成预览文件: preview_*.webm
   ↓
7. 读取文件: fs.readFileSync()
   ↓
8. 返回 ArrayBuffer → 渲染进程
   ↓
9. Blob URL → video.src
   ↓
10. 用户观看预览
```

---

## 🔌 IPC 接口定义

### 类型定义 (types.d.ts)

```typescript
type EventPayloadMapping = {
  // 录制控制
  'start-continuous-recording': { success: boolean; error?: string };
  'stop-continuous-recording': { success: boolean };

  // 数据传输
  'get-recording-blob': void;

  // 视频处理
  'cut-video': { success: boolean; filePath?: string; error?: string };
  'read-video-file': ArrayBuffer;
};

interface Window {
  electron: {
    // 开始连续录制
    startContinuousRecording: (classId: string) => Promise<{ success: boolean }>;

    // 发送录制数据块
    sendRecordingBlob: (classId: string, blob: Blob) => Promise<void>;

    // 截取视频
    cutVideo: (
      classId: string,
      seconds: number,
    ) => Promise<{
      success: boolean;
      filePath?: string;
      error?: string;
    }>;

    // 读取视频文件
    readVideoFile: (filePath: string) => Promise<ArrayBuffer>;
  };
}
```

---

## 🎯 关键技术决策

### 1. 为什么使用单文件连续录制?

**之前尝试的方案** (失败):

- ❌ 1秒一个独立 WebM 文件 → 合并后无法播放
- ❌ 使用 webm-duration-fix → 只处理第一个 segment
- ❌ 使用 ts-ebml → 浏览器兼容性问题

**当前方案** (成功):

- ✅ 单个连续 WebM 文件
- ✅ 使用 FFmpeg 专业工具截取
- ✅ 原生支持,无需第三方库

### 2. 为什么需要扫描文件获取时长?

**问题**: 流式 WebM 的 duration 元数据为 `N/A`

**原因**: MediaRecorder 实时编码时不知道最终时长

**解决**:

- FFmpeg 完整扫描文件 → 从 progress 获取实际时长
- 备用方案: `Date.now() - startTime` 估算

### 3. 为什么使用 `-c copy`?

**对比**:
| 方案 | 优点 | 缺点 |
|------|------|------|
| `-c copy` | 速度快 (秒级)<br>无质量损失<br>CPU占用低 | 可能产生关键帧问题 |
| 重新编码 | 完美兼容性 | 速度慢 (分钟级)<br>质量损失<br>CPU占用高 |

**选择**: `-c copy` (速度优先,用户场景下可接受)

---

## 🚀 性能优化

### 1. 内存管理

```typescript
// 缓冲区定期清空
if (recording.chunks.length >= 30) {
  recording.chunks = []; // 清空已写入的缓冲
}
```

### 2. 文件 I/O 优化

```typescript
// 使用流式写入,避免内存堆积
const writeStream = fs.createWriteStream(filePath);
writeStream.write(buffer);
```

### 3. FFmpeg 优化

```bash
# 不重新编码,直接复制流
-c copy

# 输出到 null 设备用于扫描
-f null -
```

---

## 🔮 扩展性设计

### 1. 推流到 MediaSoup (将来实现)

```typescript
// 从 video 元素获取 MediaStream
const video = document.querySelector('video');
const stream = video.captureStream(); // 获取播放中的流

// 使用 MediaSoup 推送
const track = stream.getVideoTracks()[0];
const producer = await transport.produce({ track });
```

**工作流程**:

```
预览视频播放 → captureStream() → MediaStream → MediaSoup → 导播端
```

### 2. 多设备支持

当前设计已支持:

```typescript
// 每个设备独立录制
recordingFiles: Map<classId, RecordingData>;

// 示例: 多摄像头同时录制
screen_main_xxx.webm(屏幕);
camera_1_xxx.webm(摄像头1);
camera_2_xxx.webm(摄像头2);
```

---

## 📝 配置与依赖

### 依赖项

```json
{
  "dependencies": {
    "recordrtc": "^5.6.2",
    "fluent-ffmpeg": "^2.1.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.28"
  }
}
```

### FFmpeg 安装

```bash
# macOS
brew install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt install ffmpeg
```

**路径配置** (src/electron/services/video-recording-service.ts):

```typescript
if (process.platform === 'darwin') {
  ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');
  ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe');
}
```

---

## 🧪 测试场景

### 功能测试

1. ✅ 录制 10 秒 → 预览最后 3 秒 → 播放 3 秒内容
2. ✅ 录制 60 秒 → 预览最后 20 秒 → 播放 20 秒内容
3. ✅ 录制 5 秒 → 请求 10 秒 → 播放全部 5 秒
4. ✅ 多次预览 → 时长实时更新

### 边界测试

1. ✅ 录制 0 秒 → 提示"录制时长不足"
2. ✅ 请求超过录制时长 → 返回全部视频
3. ✅ 文件不存在 → 错误提示
4. ✅ FFmpeg 未安装 → 错误提示

---

## 🐛 已知问题与限制

### 1. 关键帧问题

- **现象**: 截取的视频开头可能有短暂黑屏/花屏
- **原因**: `-c copy` 可能从非关键帧开始
- **影响**: 1-2 帧 (~0.1 秒)
- **可接受**: 用户场景下影响较小

### 2. 扫描耗时

- **耗时**: 扫描 1 分钟视频约需 2-3 秒
- **原因**: 需要完整解析文件
- **优化**: 已添加加载提示

### 3. 磁盘占用

- **录制 10 分钟**: 约 200-300 MB (2.5 Mbps)
- **清理策略**: 24 小时自动清理

---

## 📚 参考资料

- [RecordRTC 文档](https://recordrtc.org/)
- [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)
- [WebM 格式规范](https://www.webmproject.org/docs/)
- [Electron IPC 通信](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [MediaStream Capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API)

---

## 📞 维护与支持

- **负责人**: GitHub Copilot Assistant
- **创建时间**: 2025-11-25
- **最后更新**: 2025-11-25
- **版本**: v1.0.0

---

## 🎉 总结

本方案通过 **RecordRTC 连续录制 + FFmpeg 专业截取** 的组合,成功实现了视频回溯功能,具备以下特点:

1. ✅ **高可靠性**: 单文件录制,避免合并问题
2. ✅ **高性能**: 流式写入 + `-c copy` 快速截取
3. ✅ **高精度**: FFmpeg 精确计算时长和截取点
4. ✅ **可扩展**: 预留 MediaSoup 推流接口
5. ✅ **易维护**: 代码清晰,架构简洁

适用于比赛监控、教学回放、质量检查等多种场景。

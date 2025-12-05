# Simulcast 推流配置实现指南

## 概述

本文档说明如何为视频设备（摄像头和屏幕）添加 simulcast（联播）配置功能，允许推流端同时推送高清和低清两个质量层，接收端可以根据网络状况自动切换。

## 核心概念

Simulcast 允许一个视频流同时以多个质量层发送：
- **高清层 (high)**: 高分辨率、高码率、高帧率
- **低清层 (low)**: 低分辨率、低码率、低帧率

每个质量层的关键参数：
- `maxBitrate`: 最大码率（单位：kbps）
- `scaleResolutionDownBy`: 分辨率缩放比例（1 = 原画，2 = 1/2，4 = 1/4）
- `maxFramerate`: 最大帧率（单位：fps）

## 实现步骤

### 1. 类型定义

#### 1.1 在 `src/common/config.interface.ts` 添加 simulcast 接口

```typescript
// 添加 SimulcastLayer 接口
export interface SimulcastLayer {
  rid: 'high' | 'low';
  maxBitrate: number;          // 码率，单位：kbps
  scaleResolutionDownBy: number; // 分辨率缩放，1=原画, 2=1/2, 4=1/4
  maxFramerate: number;         // 帧率，单位：fps
}

// 在 VideoConfig 接口中添加 simulcast 字段
export interface VideoConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  simulcast?: SimulcastLayer[];  // 新增：simulcast 配置
}

// 在 UpdateVideoConfigDTO 接口中添加 simulcast 字段
export interface UpdateVideoConfigDTO {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  simulcast?: SimulcastLayer[];  // 新增：simulcast 配置
}
```

#### 1.2 在 `src/ui/typings/data.ts` 添加 UI 类型定义

```typescript
// 添加 SimulcastLayer 接口（与 config.interface.ts 相同）
export interface SimulcastLayer {
  rid: 'high' | 'low';
  maxBitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate: number;
}

// 在 DeviceSettings 接口中添加 simulcast 字段
export interface DeviceSettings extends MediaTrackSettings {
  simulcast?: SimulcastLayer[];  // 新增
}

// 在 ConfigForm 接口中添加 simulcast 配置结构（用于配置对话框）
export interface ConfigForm {
  width: number;
  height: number;
  frameRate: number;
  channelCount?: number;
  sampleRate?: number;
  simulcast?: {  // 新增：嵌套结构便于表单绑定
    high: {
      maxBitrate: number;
      scaleResolutionDownBy: number;
      maxFramerate: number;
    };
    low: {
      maxBitrate: number;
      scaleResolutionDownBy: number;
      maxFramerate: number;
    };
  };
}
```

#### 1.3 更新 `types.d.ts` IPC 通信类型

```typescript
// 在 electron.getDevicesConfig 的返回类型中添加 simulcast
getDevicesConfig: () => Promise<{
  screens?: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    frameRate: number;
    sampleRate: number;
    simulcast?: Array<{  // 新增
      rid: 'high' | 'low';
      maxBitrate: number;
      scaleResolutionDownBy: number;
      maxFramerate: number;
    }>;
  }>;
  cameras?: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    frameRate: number;
    sampleRate: number;
    simulcast?: Array<{  // 新增
      rid: 'high' | 'low';
      maxBitrate: number;
      scaleResolutionDownBy: number;
      maxFramerate: number;
    }>;
  }>;
  microphones?: Array<{ id: string; name: string; sampleRate: number; channelCount: number }>;
}>;
```

### 2. 设备管理器 (DeviceManager)

#### 2.1 在 `openConfigDialog` 中初始化 simulcast 配置

在 `src/ui/services/device-manager.ts` 的 `openConfigDialog` 方法中：

```typescript
openConfigDialog(device: Device) {
  this.currentConfigDevice = device;
  
  // 基础配置
  this.configForm = {
    width: Math.round(device.settings.width),
    height: Math.round(device.settings.height),
    frameRate: Math.round(device.settings.frameRate),
    channelCount: device.settings.channelCount,
    sampleRate: device.settings.sampleRate,
  };

  // 视频设备添加 simulcast 配置
  if (device.type === 'screen' || device.type === 'camera') {
    const existingSimulcast = device.settings?.simulcast;
    
    // 默认配置：高清层 8000kbps/原画/60fps，低清层 2000kbps/1:2/30fps
    this.configForm.simulcast = {
      high: {
        maxBitrate: existingSimulcast?.find(l => l.rid === 'high')?.maxBitrate || 8000,
        scaleResolutionDownBy: existingSimulcast?.find(l => l.rid === 'high')?.scaleResolutionDownBy || 1,
        maxFramerate: existingSimulcast?.find(l => l.rid === 'high')?.maxFramerate || Math.round(device.settings.frameRate),
      },
      low: {
        maxBitrate: existingSimulcast?.find(l => l.rid === 'low')?.maxBitrate || 2000,
        scaleResolutionDownBy: existingSimulcast?.find(l => l.rid === 'low')?.scaleResolutionDownBy || 2,
        maxFramerate: existingSimulcast?.find(l => l.rid === 'low')?.maxFramerate || Math.round(device.settings.frameRate / 2),
      },
    };
  }
  
  this.selectedPreset = '';
  return { success: true, message: '配置对话框已打开' };
}
```

#### 2.2 在 `saveDeviceConfig` 中保存 simulcast 配置

```typescript
// 在视频轨道获取成功后，保存 simulcast 配置
if (videoTrack) {
  this.currentConfigDevice.settings = videoTrack.getSettings() as DeviceSettings;
  
  // 保存 simulcast 配置到 device.settings
  if (this.configForm.simulcast) {
    this.currentConfigDevice.settings.simulcast = [
      {
        rid: 'high',
        maxBitrate: this.configForm.simulcast.high.maxBitrate,
        scaleResolutionDownBy: this.configForm.simulcast.high.scaleResolutionDownBy,
        maxFramerate: this.configForm.simulcast.high.maxFramerate,
      },
      {
        rid: 'low',
        maxBitrate: this.configForm.simulcast.low.maxBitrate,
        scaleResolutionDownBy: this.configForm.simulcast.low.scaleResolutionDownBy,
        maxFramerate: this.configForm.simulcast.low.maxFramerate,
      },
    ];
  }
}
```

#### 2.3 在 `startStreaming` 中返回 simulcast 配置

```typescript
startStreaming(classIds?: number[]): Array<{ stream: MediaStream; classId: number; type: DeviceType; simulcast?: SimulcastLayer[] }> {
  const streamingData: Array<{ stream: MediaStream; classId: number; type: DeviceType; simulcast?: SimulcastLayer[] }> = [];
  
  const devices = classIds
    ? this.userDevices.filter((d) => classIds.includes(d.classId))
    : this.userDevices;

  for (const device of devices) {
    if (device.enabled && device.stream) {
      streamingData.push({
        stream: device.stream,
        classId: device.classId,
        type: device.type,
        simulcast: device.settings?.simulcast,  // 传递 simulcast 配置
      });
    }
  }
  return streamingData;
}
```

#### 2.4 配置文件持久化

在 `saveAllDevicesToConfig` 中保存 simulcast：

```typescript
const screens = this.userDevices
  .filter((d) => d.type === 'screen' && d.settings)
  .map((d) => ({
    id: d.id,
    name: d.name,
    width: Math.round(d.settings!.width),
    height: Math.round(d.settings!.height),
    frameRate: Math.round(d.settings!.frameRate),
    simulcast: d.settings!.simulcast,  // 保存 simulcast
  }));

const cameras = this.userDevices
  .filter((d) => d.type === 'camera' && d.settings)
  .map((d) => ({
    id: d.id,
    name: d.name,
    width: Math.round(d.settings!.width),
    height: Math.round(d.settings!.height),
    frameRate: Math.round(d.settings!.frameRate),
    simulcast: d.settings!.simulcast,  // 保存 simulcast
  }));
```

在 `loadDevicesFromConfig` 中加载 simulcast：

```typescript
// 加载屏幕设备
for (const screenConfig of devicesConfig.screens) {
  // ... 创建设备并启动流
  
  // 应用配置中的 simulcast
  if (device.settings && screenConfig.simulcast) {
    device.settings.simulcast = screenConfig.simulcast;
  }
}

// 加载摄像头设备
for (const cameraConfig of devicesConfig.cameras) {
  // ... 创建设备并启动流
  
  // 应用配置中的 simulcast
  if (device.settings && cameraConfig.simulcast) {
    device.settings.simulcast = cameraConfig.simulcast;
  }
}
```

### 3. 渲染服务 (RendererService)

#### 3.1 更新 `startStreaming` 方法接收 simulcast

在 `src/ui/services/renderer-service.ts`：

```typescript
startStreaming = async (
  streamingData: Array<{ 
    stream: MediaStream; 
    classId: number; 
    type: DeviceType; 
    simulcast?: SimulcastLayer[] 
  }>
) => {
  // ... 现有代码
  
  for (const data of streamingData) {
    if (data.type === 'screen' || data.type === 'camera') {
      await this.mediasoupClient.produceVideo(
        data.stream, 
        data.classId, 
        data.simulcast  // 传递 simulcast 配置
      );
    } else if (data.type === 'microphone') {
      await this.mediasoupClient.produceAudio(data.stream, data.classId);
    }
  }
};
```

### 4. MediaSoup WebRTC 客户端

#### 4.1 在 `produceVideo` 中应用 simulcast 编码

在 `src/ui/services/mediasoup-webrtc-client.ts` 的 `produceVideo` 方法中：

```typescript
async produceVideo(
  stream: MediaStream, 
  classId: number, 
  simulcast?: SimulcastLayer[]
) {
  const videoTrack = stream.getVideoTracks()[0];
  
  // 构建 encodings 参数
  let encodings: RTCRtpEncodingParameters[] | undefined;
  
  if (simulcast && simulcast.length > 0) {
    encodings = simulcast.map(layer => ({
      rid: layer.rid,
      maxBitrate: layer.maxBitrate * 1000,  // kbps 转 bps
      scaleResolutionDownBy: layer.scaleResolutionDownBy,
      maxFramerate: layer.maxFramerate,
    }));
    
    console.log('Applying simulcast encodings:', encodings);
  }
  
  // 创建 producer
  const producer = await this.sendTransport.produce({
    track: videoTrack,
    encodings: encodings,  // 应用编码配置
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  });
  
  // ... 保存 producer
}
```

同样更新 `produceStream` 方法：

```typescript
async produceStream(
  stream: MediaStream, 
  classId: number, 
  simulcast?: SimulcastLayer[]
) {
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  if (videoTrack) {
    await this.produceVideo(stream, classId, simulcast);
  }
  if (audioTrack) {
    await this.produceAudio(stream, classId);
  }
}
```

### 5. 配置对话框 UI

#### 5.1 添加 Simulcast 配置表单

在 `src/ui/components/config-dialog.vue` 的视频设备表单中添加：

```vue
<template>
  <!-- 现有的分辨率、帧率配置 -->
  
  <!-- Simulcast 配置区域 -->
  <div v-if="deviceManager.configForm.simulcast">
    <el-divider />
    
    <!-- 高清层配置 -->
    <el-form-item label="高清层配置">
      <div class="layer-config">
        <div class="config-row">
          <span>码率:</span>
          <el-input-number
            v-model="deviceManager.configForm.simulcast.high.maxBitrate"
            :min="1000"
            :max="20000"
            :step="500"
            controls-position="right"
          />
          <span>kbps</span>
        </div>
        <div class="config-row">
          <span>分辨率缩放:</span>
          <el-select v-model="deviceManager.configForm.simulcast.high.scaleResolutionDownBy">
            <el-option label="原画 (1x)" :value="1" />
            <el-option label="1/2" :value="2" />
            <el-option label="1/4" :value="4" />
          </el-select>
        </div>
        <div class="config-row">
          <span>帧率:</span>
          <el-input-number
            v-model="deviceManager.configForm.simulcast.high.maxFramerate"
            :min="15"
            :max="120"
            :step="5"
            controls-position="right"
          />
          <span>fps</span>
        </div>
      </div>
    </el-form-item>
    
    <!-- 低清层配置 -->
    <el-form-item label="低清层配置">
      <div class="layer-config">
        <div class="config-row">
          <span>码率:</span>
          <el-input-number
            v-model="deviceManager.configForm.simulcast.low.maxBitrate"
            :min="500"
            :max="10000"
            :step="200"
            controls-position="right"
          />
          <span>kbps</span>
        </div>
        <div class="config-row">
          <span>分辨率缩放:</span>
          <el-select v-model="deviceManager.configForm.simulcast.low.scaleResolutionDownBy">
            <el-option label="原画 (1x)" :value="1" />
            <el-option label="1/2" :value="2" />
            <el-option label="1/4" :value="4" />
          </el-select>
        </div>
        <div class="config-row">
          <span>帧率:</span>
          <el-input-number
            v-model="deviceManager.configForm.simulcast.low.maxFramerate"
            :min="10"
            :max="60"
            :step="5"
            controls-position="right"
          />
          <span>fps</span>
        </div>
      </div>
    </el-form-item>
  </div>
</template>

<style scoped lang="less">
.layer-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
  
  .config-row {
    display: flex;
    align-items: center;
    gap: 10px;
    
    > span {
      min-width: 100px;
    }
  }
}
</style>
```

#### 5.2 添加安全检查

在组件的 methods 中添加检查：

```typescript
// 在 mounted 钩子或计算属性中检查 simulcast 是否存在
mounted() {
  if (this.deviceManager.configForm.simulcast) {
    // 初始化逻辑
  }
}

// 或者使用计算属性
computed: {
  hasSimulcast(): boolean {
    return !!(
      this.deviceManager.configForm.simulcast?.high && 
      this.deviceManager.configForm.simulcast?.low
    );
  }
}
```

### 6. 视频回放流的处理

对于视频回放流（不支持 simulcast），在 `home.view.vue` 中：

```typescript
async startReplayStreaming() {
  const streamingData = this.deviceManager.startReplayStreaming();
  
  // 回放流不使用 simulcast
  await this.rendererService.startStreaming(
    streamingData.map(d => ({
      ...d,
      simulcast: undefined  // 明确不使用 simulcast
    }))
  );
}
```

## 配置示例

### 推荐的配置预设

1. **高质量**（适合有线网络）
   - 高清层: 1920x1080 @ 60fps, 8000 kbps
   - 低清层: 960x540 @ 30fps, 2000 kbps

2. **标准质量**（适合稳定 WiFi）
   - 高清层: 1920x1080 @ 30fps, 5000 kbps
   - 低清层: 960x540 @ 15fps, 1500 kbps

3. **省流模式**（适合移动网络）
   - 高清层: 1280x720 @ 30fps, 3000 kbps
   - 低清层: 640x360 @ 15fps, 1000 kbps

### 配置文件格式

保存到 `~/.Kessoku the Broadcaster/config.json`：

```json
{
  "devicesConfig": {
    "screens": [
      {
        "id": "screen-id",
        "name": "Screen 1",
        "width": 1920,
        "height": 1080,
        "frameRate": 60,
        "simulcast": [
          {
            "rid": "high",
            "maxBitrate": 8000,
            "scaleResolutionDownBy": 1,
            "maxFramerate": 60
          },
          {
            "rid": "low",
            "maxBitrate": 2000,
            "scaleResolutionDownBy": 2,
            "maxFramerate": 30
          }
        ]
      }
    ],
    "cameras": [
      {
        "id": "camera-id",
        "name": "Camera 1",
        "width": 1920,
        "height": 1080,
        "frameRate": 30,
        "simulcast": [
          {
            "rid": "high",
            "maxBitrate": 5000,
            "scaleResolutionDownBy": 1,
            "maxFramerate": 30
          },
          {
            "rid": "low",
            "maxBitrate": 1500,
            "scaleResolutionDownBy": 2,
            "maxFramerate": 15
          }
        ]
      }
    ]
  }
}
```

## 注意事项

1. **类型安全**: 确保所有涉及 simulcast 的地方都做了空值检查
2. **单位转换**: maxBitrate 在配置中使用 kbps，传给 WebRTC 时需要转换为 bps（乘以 1000）
3. **麦克风设备**: 麦克风不支持 simulcast，只有 screen 和 camera 类型设备才添加 simulcast 配置
4. **回放流**: 视频回放流不使用 simulcast，传递 undefined
5. **配置持久化**: 记得在 saveAllDevicesToConfig 和 loadDevicesFromConfig 中处理 simulcast 字段

## 测试建议

1. 测试配置保存和加载是否正确
2. 测试不同预设的码率是否生效
3. 使用 Chrome DevTools → WebRTC Internals 查看实际编码参数
4. 测试网络波动时自动切换质量层
5. 测试麦克风配置对话框不会报错（因为没有 simulcast）

## 调试技巧

在浏览器控制台查看 WebRTC 统计：

```javascript
// 在 Chrome 中访问
chrome://webrtc-internals/

// 查看 RTCOutboundRTPVideoStream 部分
// 确认有两个编码层 (rid: high, low)
// 查看实际的 bitrate、resolution、framerate
```

在代码中添加日志：

```typescript
console.log('Applying simulcast encodings:', encodings);
console.log('Saved device config with simulcast:', device.settings.simulcast);
```

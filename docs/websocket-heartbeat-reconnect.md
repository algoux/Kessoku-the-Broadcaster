# WebSocket 心跳检测与断线重连技术文档

## 概述

本文档详细描述了 Kessoku the Broadcaster 选手端应用中 WebSocket 服务的心跳检测机制和断线重连策略。该机制确保了选手端与导播服务器之间的连接稳定性，并能在网络波动或服务器重启时自动恢复连接和状态。

## 核心目标

1. **连接监控**：实时监测 WebSocket 连接状态
2. **心跳检测**：定期发送心跳包，及时发现连接异常
3. **自动重连**：连接断开后自动尝试重新连接
4. **状态恢复**：重连成功后自动恢复设备和准备状态

## 技术架构

### 1. 连接状态管理

#### 状态定义

```typescript
connectionState: 'connected' | 'disconnected' | 'connecting';
```

- **`connected`**: 已成功连接并注册到服务器
- **`disconnected`**: 完全断开连接，未在重连中
- **`connecting`**: 正在连接或重连中

#### 状态流转

```
初始化 → disconnected
   ↓
用户登录 → connecting
   ↓
注册成功 → connected
   ↓
断线检测 → connecting (自动重连)
   ↓
重连成功 → connected
```

### 2. 心跳检测机制

#### 配置参数

```typescript
private readonly HEARTBEAT_INTERVAL = 5000;  // 5秒 - 心跳发送间隔
private readonly HEARTBEAT_TIMEOUT = 10000;  // 10秒 - 心跳超时时间
private lastHeartbeatResponse: number;        // 最后一次收到心跳响应的时间戳
```

#### 工作流程

```
启动心跳 (startHeartbeat)
   ↓
每 5 秒执行一次
   ↓
发送 ping 消息 → socket.emit('ping')
   ↓
等待 pong 响应 → socket.on('pong')
   ↓
更新 lastHeartbeatResponse
   ↓
检查是否超时 (now - lastHeartbeatResponse > 10s)
   ↓
超时 → 断开连接 → 触发重连
```

#### 实现细节

**启动心跳**

```typescript
private startHeartbeat() {
  this.stopHeartbeat(); // 先停止旧的心跳

  this.heartbeatTimer = setInterval(() => {
    if (this.socket && this.socket.connected) {
      // 发送心跳
      this.socket.emit('ping');

      // 检查上次心跳响应时间
      const now = Date.now();
      if (now - this.lastHeartbeatResponse > this.HEARTBEAT_TIMEOUT) {
        console.warn('心跳超时，开始重连...');
        this.socket.disconnect();
        this.connectionState = 'disconnected';
        this.startReconnecting();
      }
    }
  }, this.HEARTBEAT_INTERVAL);
}
```

**监听心跳响应**

```typescript
this.socket.on('pong', () => {
  this.lastHeartbeatResponse = Date.now();
});
```

#### 心跳检测优势

1. **主动发现问题**：不等待业务操作失败，主动检测连接状态
2. **快速响应**：10 秒内发现连接异常
3. **避免资源浪费**：避免在断开的连接上尝试业务操作

### 3. 断线重连机制

#### 配置参数

```typescript
private readonly RECONNECT_INTERVAL = 3000;  // 3秒 - 重连尝试间隔
private reconnectTimer?: NodeJS.Timeout;     // 重连定时器
```

#### 触发场景

1. **初次连接失败** (`connect_error`)
2. **连接断开** (`disconnect`)
3. **心跳超时** (10秒无响应)

#### 重连流程

```
检测到断线
   ↓
设置状态为 connecting
   ↓
启动重连循环 (startReconnecting)
   ↓
立即尝试重连 (attemptReconnect)
   ↓
每 3 秒重试一次
   ↓
┌─────────────────────┐
│ 清理旧连接           │
│ - 移除业务监听器     │
│ - 断开 socket        │
└─────────────────────┘
   ↓
┌─────────────────────┐
│ 创建新连接           │
│ - 新建 socket.io     │
│ - 设置连接处理器     │
│ - 监听 pong 事件     │
└─────────────────────┘
   ↓
等待 connect 事件
   ↓
获取 RTP 能力
   ↓
注册到服务器
   ↓
注册成功？
   ├─ 是 → 设置 connected → 恢复设备状态 → 停止重连
   └─ 否 → 断开连接 → 等待下次重连
```

#### 核心实现

```typescript
private startReconnecting() {
  if (this.reconnectTimer) {
    return; // 防止重复启动
  }

  console.log('开始自动重连...');
  this.connectionState = 'connecting';

  const attemptReconnect = async () => {
    // 已连接成功，停止重连
    if (this.connectionState === 'connected' && this.socket?.connected) {
      this.stopReconnecting();
      return;
    }

    console.log('尝试重新连接到服务器...');

    // 1. 清理旧连接
    if (this.socket) {
      this.socket.off('startStreamingRequest');
      this.socket.off('stopStreamingRequest');
      this.socket.off('replayRequest');
      this.socket.off('stopReplayRequest');
      this.socket.disconnect();
    }

    // 2. 创建新连接
    this.socket = io(this.serviceURL, {
      reconnection: false, // 禁用 socket.io 自带的重连
    });

    // 3. 设置连接处理器
    this.setupConnectionHandlers();

    // 4. 监听心跳
    this.socket.on('pong', () => {
      this.lastHeartbeatResponse = Date.now();
    });

    // 5. 等待连接成功并注册
    this.socket.once('connect', () => {
      // 获取 RTP 能力 → 注册 → 恢复状态
    });

    // 6. 监听连接错误
    this.socket.once('connect_error', (error) => {
      console.error('重连失败:', error.message);
      this.connectionState = 'connecting'; // 保持重连状态
    });
  };

  // 立即尝试一次
  attemptReconnect();

  // 然后每 3 秒重试
  this.reconnectTimer = setInterval(attemptReconnect, this.RECONNECT_INTERVAL);
}
```

### 4. 统一的连接处理器

为了避免事件监听器的重复绑定和状态管理混乱，我们实现了统一的连接处理器。

```typescript
private setupConnectionHandlers() {
  if (!this.socket) return;

  // 先移除旧监听器，避免重复
  this.socket.off('disconnect');
  this.socket.off('connect');

  // 监听断开连接
  this.socket.on('disconnect', (reason: string) => {
    console.log('与服务器断开连接:', reason);
    this.isConnected = false;
    this.stopHeartbeat();

    // 根据当前状态决定行为
    if (!this.reconnectTimer) {
      // 不在重连循环中，启动重连
      this.connectionState = 'disconnected';
      this.startReconnecting();
    } else {
      // 已在重连循环中，保持 connecting 状态
      this.connectionState = 'connecting';
    }
  });

  // 监听连接成功
  this.socket.on('connect', () => {
    console.log('Socket 连接成功:', this.socket.id);
    // 注意：不在这里设置 isConnected
    // 等注册成功后再设置，确保业务可用
  });
}
```

#### 设计要点

1. **避免重复监听**：使用 `off()` 移除旧监听器
2. **统一入口**：所有连接状态变化都通过这个处理器
3. **智能判断**：根据是否在重连循环中采取不同策略
4. **业务隔离**：连接管理和业务事件监听分离

### 5. 状态持久化与恢复

#### 状态记录

```typescript
private lastDeviceState: any[] = [];      // 最后上报的设备状态
private lastReadyState: boolean = false;  // 最后的准备状态
```

每次上报设备状态时，同步保存到内存：

```typescript
reportDeviceState(devices: any[], isReady: boolean): void {
  // 保存状态
  this.lastDeviceState = devices;
  this.lastReadyState = isReady;

  if (!this.socket || !this.socket.connected) {
    console.warn('WebSocket 未连接，无法上报设备状态（已保存状态，等待重连后上报）');
    return;
  }

  this.socket.emit('reportDeviceState', {
    devices,
    isReady,
    playerName: this.playerName,
  });
}
```

#### 状态恢复

重连成功并注册后，自动上报最后的状态：

```typescript
if (response.success) {
  this.isConnected = true;
  this.connectionState = 'connected';
  this.setupEventHandlers();
  this.startHeartbeat();
  this.stopReconnecting();

  // 恢复设备状态
  if (this.lastDeviceState.length > 0 || this.lastReadyState) {
    console.log('重连后恢复设备状态:', {
      devices: this.lastDeviceState.length,
      isReady: this.lastReadyState,
    });
    this.reportDeviceState(this.lastDeviceState, this.lastReadyState);
  }
}
```

#### 恢复场景

1. **服务器重启**：服务器恢复后，选手端自动上报状态
2. **网络波动**：短暂断线重连后，保持原有准备状态
3. **客户端掉线**：重新连接后，服务器能获取最新状态

### 6. UI 状态同步

通过 IPC 通信，实时向渲染进程同步连接状态。

#### 主进程侧

```typescript
// main.ts
ipcMainHandle('get-connection-status', async () => {
  return webSocketService.getConnectionStatus();
});
```

#### 渲染进程侧

```typescript
// home.view.vue
async mounted() {
  // 获取初始状态
  const initialState = await window.electron.getConnectionStatus();
  this.connectionState = this.mapConnectionState(initialState);

  // 监听状态变化
  window.electron.onConnectionStateChanged((state) => {
    this.connectionState = this.mapConnectionState(state);
  });
}
```

#### UI 展示

```vue
<template>
  <div :class="connectionStateClass">
    {{ connectionStateText }}
  </div>
</template>
```

- **绿色**：已连接 (connected)
- **橙色闪烁**：连接中 (connecting)
- **红色**：断开连接 (disconnected)

## 时序图

### 初次连接流程

```
用户           WebSocketService        Socket.IO        服务器
 │                    │                    │              │
 │  登录              │                    │              │
 ├───────────────────>│                    │              │
 │                    │  创建连接           │              │
 │                    ├───────────────────>│              │
 │                    │                    │  connect     │
 │                    │                    ├─────────────>│
 │                    │                    │  connected   │
 │                    │  getRouterRtp      │<─────────────┤
 │                    ├───────────────────────────────────>│
 │                    │  rtpCapabilities   │              │
 │                    │<───────────────────────────────────┤
 │                    │  register          │              │
 │                    ├───────────────────────────────────>│
 │                    │  success           │              │
 │                    │<───────────────────────────────────┤
 │                    │  启动心跳           │              │
 │                    │                    │              │
 │  连接成功          │                    │              │
 │<───────────────────┤                    │              │
```

### 心跳检测流程

```
WebSocketService        Timer              Socket.IO        服务器
 │                       │                    │              │
 │  启动心跳             │                    │              │
 │──────────────────────>│                    │              │
 │                       │  5秒到期           │              │
 │<──────────────────────┤                    │              │
 │  emit('ping')         │                    │              │
 ├──────────────────────────────────────────────────────────>│
 │                       │                    │  pong        │
 │<──────────────────────────────────────────────────────────┤
 │  更新 lastHeartbeat   │                    │              │
 │                       │  5秒到期           │              │
 │<──────────────────────┤                    │              │
 │  emit('ping')         │                    │              │
 ├──────────────────────────────────────────────────────────>│
 │                       │  10秒超时          │              │
 │<──────────────────────┤                    │              │
 │  检测超时             │                    │              │
 │  disconnect()         │                    │              │
 │  startReconnecting()  │                    │              │
```

### 断线重连流程

```
WebSocketService        Timer              Socket.IO        服务器
 │                       │                    │              │
 │  检测到断线           │                    │              │
 │  startReconnecting()  │                    │              │
 │──────────────────────>│                    │              │
 │                       │  立即尝试           │              │
 │<──────────────────────┤                    │              │
 │  清理旧连接           │                    │              │
 │  创建新连接           │                    │              │
 ├───────────────────────────────────────────>│              │
 │                       │                    │  connect     │
 │                       │                    ├─────────────>│
 │                       │                    │  ✗ refused   │
 │                       │  3秒到期           │<─────────────┤
 │<──────────────────────┤                    │              │
 │  重试                 │                    │              │
 ├───────────────────────────────────────────>│              │
 │                       │                    │  connect     │
 │                       │                    ├─────────────>│
 │                       │                    │  ✓ connected │
 │                       │                    │<─────────────┤
 │  注册并恢复状态       │                    │              │
 ├──────────────────────────────────────────────────────────>│
 │  success              │                    │              │
 │<──────────────────────────────────────────────────────────┤
 │  stopReconnecting()   │                    │              │
 │──────────────────────>│                    │              │
 │  启动心跳             │                    │              │
```

## 关键设计决策

### 1. 为什么禁用 Socket.IO 自带的重连？

```typescript
this.socket = io(this.serviceURL, {
  reconnection: false, // 禁用自动重连
});
```

**原因**：

- Socket.IO 的自动重连只处理连接层，不处理业务层（注册、状态恢复）
- 我们需要在重连后执行一系列业务逻辑（获取 RTP 能力、注册、恢复设备状态）
- 手动控制重连逻辑更灵活，可以添加自定义行为

### 2. 为什么使用 `once` 和 `on` 混合监听？

**`once` 用于临时事件**：

```typescript
this.socket.once('connect', () => {
  // 仅在首次连接或重连时执行一次
});
```

**`on` 用于持久监听**：

```typescript
this.socket.on('disconnect', () => {
  // 每次断开都需要处理
});
```

**原因**：

- `once` 避免回调累积，防止内存泄漏
- `on` 确保持续监听连接状态变化
- 通过 `off()` 清理旧监听器，避免重复绑定

### 3. 为什么分离连接处理和业务处理？

**连接处理**：`setupConnectionHandlers()`

- 管理 `connect` 和 `disconnect` 事件
- 处理连接状态变化
- 触发重连逻辑

**业务处理**：`setupEventHandlers()`

- 监听业务消息（推流请求、回看请求等）
- 不处理连接状态

**原因**：

- 职责分离，代码更清晰
- 避免在业务事件中混入连接管理逻辑
- 重连时只需清理业务监听器，保留连接监听器

### 4. 为什么在重连循环中保持 `connecting` 状态？

```typescript
if (!this.reconnectTimer) {
  this.connectionState = 'disconnected';
  this.startReconnecting();
} else {
  this.connectionState = 'connecting';
}
```

**原因**：

- 向用户传达"正在尝试重连"的信息
- 避免频繁切换 `disconnected` ↔ `connecting` 状态
- UI 显示更友好（橙色闪烁 vs 红色）

## 异常处理

### 1. 服务器宕机

**现象**：`ECONNREFUSED` 错误

**处理**：

- 捕获 `connect_error` 事件
- 保持 `connecting` 状态
- 每 3 秒重试，直到服务器恢复

**日志**：

```
重连失败: connect ECONNREFUSED 127.0.0.1:3001
尝试重新连接到服务器...
重连失败: connect ECONNREFUSED 127.0.0.1:3001
...
重连成功，正在注册...
重连并注册成功
```

### 2. 心跳超时

**现象**：10 秒内未收到 `pong` 响应

**处理**：

- 主动断开连接：`socket.disconnect()`
- 触发 `disconnect` 事件
- 自动启动重连

**日志**：

```
心跳超时，开始重连...
与服务器断开连接: io client disconnect
开始自动重连...
```

### 3. 注册失败

**现象**：重连后注册返回 `success: false`

**处理**：

- 断开当前连接
- 保持重连循环继续运行
- 等待下次重连尝试

**日志**：

```
重连注册失败: Player already registered
尝试重新连接到服务器...
```

### 4. 网络波动

**现象**：短暂断线后自动恢复

**处理**：

- 检测到 `disconnect` 事件
- 立即启动重连
- 成功后恢复设备状态

**用户体验**：

- UI 显示"连接中"（橙色闪烁）
- 几秒后自动恢复为"已连接"（绿色）
- 准备状态保持不变

## 性能优化

### 1. 定时器管理

- **心跳定时器**：使用 `setInterval`，每 5 秒检查一次
- **重连定时器**：使用 `setInterval`，每 3 秒尝试一次
- **清理机制**：连接成功后立即停止重连定时器，避免资源浪费

### 2. 事件监听器清理

```typescript
// 清理旧连接时，只移除业务监听器
this.socket.off('startStreamingRequest');
this.socket.off('stopStreamingRequest');
this.socket.off('replayRequest');
this.socket.off('stopReplayRequest');
```

**优点**：

- 避免内存泄漏
- 防止重复触发回调
- 减少事件处理开销

### 3. 状态记录而非查询

```typescript
private lastDeviceState: any[] = [];
private lastReadyState: boolean = false;
```

**优点**：

- 无需查询 UI 状态
- 避免跨进程通信
- 重连时立即可用

## 配置参数建议

### 当前配置

| 参数               | 值      | 说明         |
| ------------------ | ------- | ------------ |
| HEARTBEAT_INTERVAL | 5000ms  | 心跳发送间隔 |
| HEARTBEAT_TIMEOUT  | 10000ms | 心跳超时时间 |
| RECONNECT_INTERVAL | 3000ms  | 重连尝试间隔 |

### 调整建议

**高稳定性场景**（数据中心、有线网络）：

```typescript
HEARTBEAT_INTERVAL = 10000; // 10秒
HEARTBEAT_TIMEOUT = 20000; // 20秒
RECONNECT_INTERVAL = 5000; // 5秒
```

**低延迟场景**（比赛直播、实时交互）：

```typescript
HEARTBEAT_INTERVAL = 3000; // 3秒
HEARTBEAT_TIMEOUT = 6000; // 6秒
RECONNECT_INTERVAL = 1000; // 1秒
```

**弱网环境**（移动网络、WiFi）：

```typescript
HEARTBEAT_INTERVAL = 5000; // 5秒
HEARTBEAT_TIMEOUT = 15000; // 15秒
RECONNECT_INTERVAL = 5000; // 5秒
```

## 测试场景

### 1. 正常连接测试

1. 启动服务器
2. 启动选手端
3. 输入选手名称并登录
4. 验证：UI 显示"已连接"（绿色）

### 2. 心跳超时测试

1. 建立连接
2. 在服务器端断开网络（不关闭服务）
3. 等待 10 秒
4. 验证：UI 显示"连接中"（橙色），控制台显示"心跳超时"

### 3. 服务器重启测试

1. 选手端保持运行
2. 重启服务器
3. 验证：
   - 选手端自动检测断线
   - UI 显示"连接中"
   - 服务器启动后自动重连
   - 恢复准备状态

### 4. 状态恢复测试

1. 选手端点击"准备就绪"
2. 添加设备（屏幕、摄像头、麦克风）
3. 手动断开服务器
4. 重启服务器
5. 验证：
   - 自动重连成功
   - 准备状态恢复为"就绪"
   - 设备列表正确上报

### 5. 网络波动测试

1. 建立连接并准备就绪
2. 短暂断开网络（2-3 秒）
3. 恢复网络
4. 验证：
   - UI 短暂显示"连接中"
   - 自动恢复为"已连接"
   - 状态保持一致

## 故障排查

### 问题：一直显示"连接中"

**可能原因**：

1. 服务器未启动
2. URL 配置错误
3. 防火墙阻止连接

**排查步骤**：

1. 检查服务器是否运行：`pnpm dev`
2. 验证 URL：检查 `settings.json` 中的 `serviceURL`
3. 查看控制台错误：`ECONNREFUSED` 或 `ETIMEDOUT`

### 问题：频繁断线重连

**可能原因**：

1. 网络不稳定
2. 心跳超时设置过短
3. 服务器性能问题

**排查步骤**：

1. 检查网络延迟：`ping <server-ip>`
2. 增加心跳超时：`HEARTBEAT_TIMEOUT = 15000`
3. 查看服务器日志

### 问题：重连后状态丢失

**可能原因**：

1. `reportDeviceState` 未正确保存状态
2. 重连注册失败
3. 服务器未正确处理状态

**排查步骤**：

1. 查看控制台："重连后恢复设备状态" 日志
2. 验证 `lastDeviceState` 和 `lastReadyState` 值
3. 检查服务器端 `reportDeviceState` 事件处理

## 未来优化方向

### 1. 指数退避重连

当前重连间隔固定为 3 秒，可以改为指数退避：

```typescript
1st attempt: 1s
2nd attempt: 2s
3rd attempt: 4s
4th attempt: 8s
...
max: 30s
```

### 2. 重连次数限制

添加最大重连次数，避免无限重连：

```typescript
private maxReconnectAttempts = 10;
private reconnectAttempts = 0;
```

### 3. 连接质量监控

记录心跳延迟和丢包率：

```typescript
private heartbeatLatencies: number[] = [];
private avgLatency: number = 0;
```

### 4. 离线消息队列

在断线期间缓存消息，重连后发送：

```typescript
private messageQueue: any[] = [];
```

### 5. 用户通知

长时间断线后弹窗提示：

```typescript
if (disconnectedTime > 60000) {
  showNotification('连接已断开超过 1 分钟');
}
```

## 总结

Kessoku the Broadcaster 的 WebSocket 心跳检测和断线重连机制通过以下设计实现了高可用性：

1. **主动监控**：5 秒心跳间隔，10 秒超时检测
2. **快速恢复**：3 秒重连间隔，立即尝试重连
3. **状态持久**：内存记录设备和准备状态，重连后自动恢复
4. **清晰架构**：连接管理和业务逻辑分离，事件监听器统一管理
5. **用户体验**：实时 UI 状态同步，明确的连接状态指示

该机制已在以下场景中验证：

- ✅ 服务器重启
- ✅ 网络波动
- ✅ 心跳超时
- ✅ 状态恢复

能够确保选手端在各种网络环境下保持稳定连接，为直播推流提供可靠的基础。

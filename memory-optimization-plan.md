# 内存优化方案（参考文档）

## 目标
- 降低应用长时间运行时的内存持续增长。
- 消除录制链路、IPC 监听链路、音频链路中的对象滞留。
- 建立可重复的基线采样与验收标准，避免回归。

## 基线采样（先做）
1. 主进程：每 10 秒记录 `process.memoryUsage()` 与 `process.getProcessMemoryInfo()`。
2. 渲染进程：每 10 秒记录 `performance.memory.usedJSHeapSize`（可用时）。
3. 关键对象计数：
   - `RecorderService.rollingRecordsMap.size`
   - `VideoRecordingService.recordingFiles.size`
   - 主要 IPC 监听器数量
4. 固定场景：登录 -> 刷新设备 -> 准备/取消准备循环 -> 增删设备 -> 设置页开关 -> 连续录制。

## 优化优先级

### P0（优先落地）
1. **录制生命周期闭环**
   - 文件：
     - `src/ui/services/media-recorder.ts`
     - `src/ui/modules/home/home.view.vue`
   - 目标：
     - 增加 `stopRollingRecord(classId)`、`stopAllRollingRecords()`。
     - 在移除设备和 `beforeUnmount` 时统一 stop + destroy + map.delete。
     - 同步调用主进程 `stopContinuousRecording`，避免主进程录制实例残留。

2. **IPC 监听可回收**
   - 文件：
     - `src/ui/services/renderer-service.ts`
     - `src/ui/modules/home/home.view.vue`
     - `src/electron/preload.cts`
   - 目标：
     - 保存所有 `window.electron.on*` 返回的 off 函数。
     - 在 cleanup/unmount 中统一反注册，避免重复创建服务后监听叠加。

3. **主进程录制缓冲减负**
   - 文件：
     - `src/electron/services/video-recording-service.ts`
     - `src/electron/typings/data.ts`
   - 目标：
     - 移除 `chunks` 缓存策略，改为“到包即写”。
     - 处理 writeStream backpressure（`write === false` 时等待 `drain`）。

4. **退出时统一清理**
   - 文件：
     - `src/electron/main.ts`
   - 目标：
     - 在退出生命周期调用录制服务 cleanup，确保无残留录制资源与文件句柄。

### P1（中优先级）
1. **立体声音频链路释放**
   - 文件：
     - `src/ui/services/device-manager.ts`
   - 目标：
     - `createStereoStream` 创建的 `AudioContext`、源流 `stream1/stream2` 可追踪并可显式释放。
     - 在 `stopDeviceStream` 时同步释放。

2. **设备刷新增量化**
   - 文件：
     - `src/ui/modules/home/home.view.vue`
     - `src/ui/services/device-manager.ts`
   - 目标：
     - 将“全量重建流”改为“增量变更”，降低瞬时分配峰值。

3. **缓存目录策略**
   - 文件：
     - `src/electron/services/video-recording-service.ts`
   - 目标：
     - 在“按时间清理”外加入“按目录总大小清理”策略。

### P2（治理与防回归）
1. **内存诊断面板/日志**
   - 文件：
     - `src/electron/main.ts`
     - `src/ui/*`（调试入口）
   - 目标：
     - 展示主/渲染进程内存曲线与关键对象数量。

2. **稳定性回归场景**
   - 目标：
     - 固化长跑场景，持续比较优化前后曲线，防止后续改动回退。

## 验收标准（建议）
1. 场景结束后，关键对象数回到基线：
   - 录制实例数与当前活跃设备一致。
   - 主要 IPC 监听器数量不累积。
2. 多次“增删设备 + 开关准备”后，不出现阶梯式不可回落增长。
3. 长时间录制场景中，内存曲线趋稳而非线性持续上升。

## 执行顺序（建议）
1. 批次 A：P0（1~4）
2. 批次 B：P1（1~3）
3. 批次 C：P2（1~2）

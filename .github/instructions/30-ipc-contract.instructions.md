# IPC 合同维护规则

新增或修改 IPC 通道时，必须同步更新以下三处：

1. `types.d.ts`
   - `EventPayloadMapping` 中新增事件与 payload 类型。
   - `Window['electron']` 中新增方法签名（invoke/on/send）。
2. `src/electron/preload.cts`
   - 通过 `ipcInvoke` / `ipcOn` / `ipcSend` 暴露到 `window.electron`。
3. `src/electron/main.ts`
   - 使用 `ipcMainHandle` / `ipcMainOn` 注册处理器与事件逻辑。

## 渲染层约束
- 渲染进程只通过 `window.electron.*` 访问 IPC。
- 不直接在渲染层使用 `ipcRenderer`。

## 命名与 payload 约束
- 事件命名保持既有风格（如 `kebab-case` 与现有事件前缀）。
- payload shape 在三处定义中必须完全一致，避免“主进程返回结构”与“渲染层类型”漂移。

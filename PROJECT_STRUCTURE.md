# Kessoku-the-Broadcaster 选手端项目结构

## 📁 项目概览

```
Kessoku-the-Broadcaster/
├── 📋 package.json                    # 项目配置和依赖
├── 📋 tsconfig.json                   # TypeScript 配置
├── 📋 types.d.ts                      # 全局类型定义
├── 📋 vite.config.ts                  # Vite 构建配置
├── 📋 electron-builder.json           # Electron 打包配置
├── 🌐 index.html                      # HTML 入口文件
├── 📁 public/                         # 静态资源
├── 📁 resources/                      # 应用资源
├── 📁 scripts/                        # 构建脚本
├── 📁 dist-electron/                  # Electron 编译输出
├── 📁 dist-vue/                       # Vue 编译输出
└── 📁 src/                           # 源代码
    ├── 📁 common/                    # 公共模块
    │   ├── types.ts                  # 通用类型定义
    │   └── modules/                  # 通用组件模块
    ├── 📁 electron/                  # 主进程代码
    │   ├── main.ts                   # 主进程入口
    │   ├── preload.cts               # 预加载脚本
    │   ├── tsconfig.json             # Electron TypeScript配置
    │   ├── services/                 # 主进程服务
    │   │   └── websocket-service.ts  # WebSocket 信令服务
    │   └── utils/                    # 主进程工具
    │       ├── index.ts              # 工具入口
    │       ├── menu.js               # 菜单配置
    │       ├── path-resolver.ts      # 路径解析
    │       ├── resource-manager.ts   # 资源管理
    │       └── tray.ts               # 系统托盘
    └── 📁 ui/                        # 渲染进程代码
        ├── main.ts                   # Vue 应用入口
        ├── app.vue                   # 根组件
        ├── index.less                # 全局样式
        ├── assets/                   # UI 资源
        ├── router/                   # Vue 路由
        ├── components/               # 通用组件
        │   └── login-form.vue        # 登录表单组件
        ├── services/                 # 渲染进程服务
        │   ├── mediasoup-webrtc-client.ts  # WebRTC 客户端
        │   └── renderer-service.ts   # 渲染进程协调服务
        ├── modules/                  # 功能模块
        │   └── home/                 # 主页模块
        │       └── home.view.vue     # 主页视图
        └── utils/                    # UI 工具
```

## 🎯 核心组件说明

### 主进程 (Electron Main Process)

- **main.ts**: 应用启动入口，创建窗口，设置 IPC 处理器
- **websocket-service.ts**: 负责与服务器的 WebSocket 信令通信
- **preload.cts**: 预加载脚本，提供安全的 IPC 接口

### 渲染进程 (Vue + WebRTC)

- **renderer-service.ts**: 协调 IPC 通信和 MediaSoup 客户端
- **mediasoup-webrtc-client.ts**: 纯 WebRTC 推流客户端
- **home.view.vue**: 主界面，设备管理和推流控制

## 🔄 数据流向

```
服务器 ←→ WebSocket ←→ 主进程 ←→ IPC ←→ 渲染进程 ←→ WebRTC
```

## 📦 主要依赖

### 核心框架

- **Electron**: 跨平台桌面应用框架
- **Vue 3**: 前端界面框架
- **TypeScript**: 类型安全的 JavaScript

### 实时通信

- **mediasoup-client**: WebRTC 媒体通信
- **socket.io-client**: WebSocket 信令通信

### 构建工具

- **Vite**: 快速构建工具
- **electron-builder**: Electron 应用打包

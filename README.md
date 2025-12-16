# Kessoku the Broadcaster 🎈
> 专注于算法竞赛的直播推流客户端

## 🤨 配套使用
该软件为选手端推流程序，需要结合导播端程序 [Kessoku the Overlay](https://github.com/algoux/Kessoku-the-Overlay) 使用。

## 🛠️ 技术栈
- typescript
- vue 3.2
- vue-class-component v8
- vue-propety-decorator
- element-plus
- electron 39.1
- mediasoup-client 3
- socket.io-client
- fluent-ffmpeg
- recordertc

## 📦️ 环境需求
- macOS、Linux、装有 `git bash` 的 Windows 操作系统
- nodeJS v20
- pnpm v8

## 🚀 快速开始
### 安装依赖
确保您的终端有良好的网络环境
> 如果您是中国大陆 🇨🇳 开发者，请打开`.npmrc`中的 electron 加速源
```bash
$ pnpm i
```

### 启动本地开发
```bash
$ pnpm dev
```

## 📁 项目结构
本项目采用模块式开发架构。主进程模块在`electron`目录下，渲染进程在`ui`目录下，应用通用配置在`common`目录下。主进程与渲染进程的通信配置在`src/electron/preload.cts`。
```text
.
├── Kessoku-the-Broadcaster/
├── src/
│   ├── electron/ # electron 主进程模块
│   │   ├── services/ # 主进程服务类
│   │   ├── utils/ # 主进程工具函数
│   │   ├── typings/ # 主进程类型定义
│   │   ├── main.ts # 主进程入口文件
│   │   └── preload.cts # IPC 通信配置文件
│   ├── ui/ # electron 渲染进程模块
│   │   ├── components/ # 通用组建
│   │   ├── assets/
│   │   │   ├── css/
│   │   │   └── img/
│   │   ├── modules/ # 路由组件
│   │   ├── services/ # 渲染进程服务类
│   │   ├── typings/ # 渲染进程类型定义
│   │   ├── utils/ # 渲染进程工具函数
│   │   ├── app.vue
│   │   ├── main.ts
│   │   ├── index.less # 全局样式
│   │   └── routes.ts # 路由配置
│   └── common/ # 通用类型定义
│       ├── typings/
│       │   └── srk.types.ts
│       └── config.interface.ts
├── index.html
├── types.d.ts # 拓展 Windows 接口，以及事件类型约束
├── electron-builder.json # electron 构建配置文件
├── vite.config.ts
├── package.json
└── pnpm-lock.yaml

```

## 📄 开源协议
本项目使用 [GPL License v3.0](./LICENSE) 协议

## 📧 联系我们
发送邮箱至 <algoux.org@gmail.com> 或直接在仓库提交 **issue** 以联系我们。

## 🔗 相关链接
algoux 官网：<https://algoux.org>

## 👥 致谢
- 所有贡献者 - 感谢每一位为项目贡献代码的开发者
- Electron 社区 - 提供优秀的跨平台应用开发框架
- 所有该产品的使用者 - 你们的支持是我们开发下去最大的动力

## 📊 项目统计

- ⭐ **Star 数量**: ![GitHub stars](https://img.shields.io/github/stars/algoux/Kessoku-the-Broadcaster)
- 📥 **下载次数**: ![GitHub downloads](https://img.shields.io/github/downloads/algoux/Kessoku-the-Broadcaster/total)
- 🐛 **问题追踪**: ![GitHub issues](https://img.shields.io/github/issues/algoux/Kessoku-the-Broadcaster)
- 🔄 **版本信息**: ![GitHub release](https://img.shields.io/github/v/release/algoux/Kessoku-the-Broadcaster)


🏆 **让每一场算竞直播都更简洁、高效。**

*© 2019-present algoUX. All Rights Reserved.*

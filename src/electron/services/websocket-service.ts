// WebSocket 服务 - 处理与服务器的信令通信
import { io, Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';

export class WebSocketService {
  private serviceURL: string;
  private socket!: Socket;
  private mainWindow!: BrowserWindow;
  private isConnected: boolean;
  private playerName!: string;
  private routerRtpCapabilities!: RtpCapabilities;

  constructor(serviceURL: string) {
    this.isConnected = false;
    this.serviceURL = serviceURL;
  }

  // 连接到服务器
  async connect(playerName: string): Promise<boolean> {
    this.playerName = playerName;

    return new Promise((resolve) => {
      if (this.socket && this.socket.connected) {
        resolve(true);
        return;
      }

      this.socket = io(this.serviceURL);

      this.socket.on('connect', () => {
        console.log('主进程连接信令服务器:', this.socket.id);

        // 获取路由器 RTP 能力
        this.socket.emit('getRouterRtpCapabilities', (rtpCapabilities: RtpCapabilities) => {
          this.routerRtpCapabilities = rtpCapabilities;

          // 注册为选手端
          this.socket.emit(
            'register',
            {
              role: 'player',
              name: this.playerName,
            },
            (response: any) => {
              if (response.success) {
                this.setupEventHandlers();
                resolve(true);
              } else {
                console.error('注册失败:', response.error);
                resolve(false);
              }
            },
          );
        });
      });

      this.socket.on('connect_error', (error: any) => {
        console.error('连接服务器失败:', error);
        this.isConnected = false;
        resolve(false);
      });

      this.socket.on('disconnect', () => {
        console.log('与服务器断开连接');
        this.isConnected = false;
        this.socket = null;
      });
    });
  }

  setMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  // 设置事件监听器
  private setupEventHandlers() {
    if (!this.socket) return;

    // 监听推流请求（支持 classIds）
    this.socket.on('startStreamingRequest', ({ requestedBy, classIds }: any) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('start-streaming-request', {
          requestedBy,
          classIds: classIds || [],
        });
      }
    });

    // 监听停止推流请求
    this.socket.on('stopStreamingRequest', ({ requestedBy }: any) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('stop-streaming-request', { requestedBy });
      }
    });

    // 监听连接状态变化
    this.socket.on('disconnect', (reason: string) => {
      this.isConnected = false;
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
    });
  }

  // 通知服务器推流已开始
  notifyStreamingStarted(producerId: string, kind: string, rtpParameters: RtpCapabilities) {
    if (this.socket && this.isConnected) {
      this.socket.emit('produce', {
        producerId,
        kind,
        rtpParameters,
      });
    }
  }

  // 通知服务器推流已停止
  notifyStreamingStopped(producerId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('producerClosed', { producerId });
    } else if (this.socket && !this.socket.connected) {
      this.reconnect();
      // 重连后再次尝试发送
      setTimeout(() => {
        if (this.socket.connected) {
          this.socket.emit('producerClosed', { producerId });
        }
      }, 1000);
    }
  }

  // 获取连接状态
  getConnectionStatus() {
    return {
      connected: this.socket.connected,
      socketId: this.socket.id,
    };
  }

  // 获取路由器 RTP 能力
  getRouterRtpCapabilities(): RtpCapabilities {
    return this.routerRtpCapabilities;
  }

  // 创建推流传输通道
  async createProducerTransport(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      this.socket.emit('createProducerTransport', (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  // 连接传输通道
  async connectProducerTransport(transportId: string, dtlsParameters: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      this.socket.emit(
        'connectProducerTransport',
        { transportId, dtlsParameters },
        (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        },
      );
    });
  }

  // 创建推流生产者
  async createProducer(kind: string, rtpParameters: any): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      this.socket.emit('produce', { kind, rtpParameters }, (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve({ id: response.id });
        }
      });
    });
  }

  // 上报设备状态到服务器
  reportDeviceState(devices: any[], isReady: boolean): void {
    console.log('🔵 [WebSocket服务] reportDeviceState 被调用:', {
      devices,
      isReady,
      deviceCount: devices?.length,
      connected: this.socket?.connected,
      socketId: this.socket?.id,
    });

    if (!this.socket || !this.socket.connected) {
      console.warn('⚠️ [WebSocket服务] WebSocket 未连接，无法上报设备状态');
      return;
    }

    this.socket.emit('reportDeviceState', {
      devices,
      isReady,
      playerName: this.playerName,
    });

    console.log('✅ [WebSocket服务] 设备状态已发送到服务器:', {
      devices: devices.map((d) => `${d.type}:${d.classId}`),
      isReady,
      playerName: this.playerName,
    });
  }

  // 断开连接
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('主动断开 WebSocket 连接');
    }
  }

  // 重新连接
  private async reconnect() {
    if (this.playerName) {
      await this.connect(this.playerName);
    }
  }
}

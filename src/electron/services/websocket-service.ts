// WebSocket 服务 - 处理与服务器的信令通信
import { io, Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { ipcWebContentsSend } from '../utils';

export class WebSocketService {
  private serviceURL: string;
  private socket!: Socket;
  private mainWindow!: BrowserWindow;
  private isConnected: boolean;
  private playerName!: string;
  private routerRtpCapabilities!: RtpCapabilities;
  private connectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly HEARTBEAT_INTERVAL = 5000; // 5秒心跳
  private readonly RECONNECT_INTERVAL = 3000; // 3秒重连间隔
  private lastHeartbeatResponse: number = Date.now();
  private readonly HEARTBEAT_TIMEOUT = 10000; // 10秒心跳超时
  private lastDeviceState: any[] = []; // 记录最后上报的设备状态
  private lastReadyState: boolean = false; // 记录最后的 ready 状态

  constructor(serviceURL: string) {
    this.isConnected = false;
    this.serviceURL = serviceURL;
  }

  // 连接到服务器
  async connect(playerName: string): Promise<boolean> {
    this.playerName = playerName;
    this.connectionState = 'connecting';

    return new Promise((resolve) => {
      if (this.socket && this.socket.connected) {
        this.connectionState = 'connected';
        resolve(true);
        return;
      }

      this.socket = io(this.serviceURL, {
        reconnection: false, // 禁用自动重连，我们手动控制
      });

      // 统一的连接处理
      this.setupConnectionHandlers();

      this.socket.once('connect', () => {
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
                this.isConnected = true;
                this.connectionState = 'connected';
                this.setupEventHandlers();
                this.startHeartbeat();
                this.stopReconnecting();
                resolve(true);
              } else {
                console.error('注册失败:', response.error);
                this.connectionState = 'disconnected';
                resolve(false);
              }
            },
          );
        });
      });

      this.socket.once('connect_error', (error: any) => {
        console.error('连接服务器失败:', error);
        this.isConnected = false;
        this.connectionState = 'disconnected';
        this.startReconnecting();
        resolve(false);
      });

      // 监听心跳响应
      this.socket.on('pong', () => {
        this.lastHeartbeatResponse = Date.now();
      });
    });
  }

  // 统一的连接处理器 - 处理 disconnect 和状态同步
  private setupConnectionHandlers() {
    if (!this.socket) return;

    // 移除旧的连接处理器，避免重复
    this.socket.off('disconnect');
    this.socket.off('connect');

    // 监听断开连接
    this.socket.on('disconnect', (reason: string) => {
      console.log('与服务器断开连接:', reason);
      this.isConnected = false;
      this.stopHeartbeat();

      // 如果不在重连循环中，启动重连
      if (!this.reconnectTimer) {
        this.connectionState = 'disconnected';
        this.startReconnecting();
      } else {
        // 已在重连循环中，保持 connecting 状态
        this.connectionState = 'connecting';
      }
    });

    // 监听连接成功（用于重连后的状态同步）
    this.socket.on('connect', () => {
      console.log('Socket 连接成功:', this.socket.id);
      // 注意：这里不设置 isConnected，等注册成功后再设置
    });
  }

  setMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('startStreamingRequest', ({ requestedBy, classIds }: any) => {
      if (this.mainWindow) {
        ipcWebContentsSend('start-streaming-request', this.mainWindow.webContents, {
          requestedBy,
          classIds: classIds || [],
        });
      }
    });

    this.socket.on('stopStreamingRequest', ({ requestedBy }: any) => {
      if (this.mainWindow) {
        ipcWebContentsSend('stop-streaming-request', this.mainWindow.webContents, { requestedBy });
      }
    });

    // 监听回看请求
    this.socket.on('replayRequest', ({ requestedBy, classId, seconds }: any) => {
      console.log(`收到导播端回看请求: classId=${classId}, seconds=${seconds}`);
      if (this.mainWindow) {
        ipcWebContentsSend('replay-request', this.mainWindow.webContents, {
          requestedBy,
          classId,
          seconds,
        });
      }
    });

    // 监听停止回看请求
    this.socket.on('stopReplayRequest', ({ classId }: any) => {
      console.log(`收到导播端停止回看请求: classId=${classId}`);
      if (this.mainWindow) {
        ipcWebContentsSend('stop-replay-request', this.mainWindow.webContents, { classId });
      }
    });

    // 注意：disconnect 和 connect 事件由重连逻辑统一管理，这里不再重复监听
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
    }
  }

  // 获取连接状态
  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionState;
  }

  // 启动心跳检测
  private startHeartbeat() {
    this.stopHeartbeat();

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

  // 停止心跳检测
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  // 开始重连
  private startReconnecting() {
    if (this.reconnectTimer) {
      return; // 已经在重连中
    }

    console.log('开始自动重连...');
    this.connectionState = 'connecting';

    const attemptReconnect = async () => {
      // 如果已经连接成功，停止重连
      if (this.connectionState === 'connected' && this.socket?.connected) {
        this.stopReconnecting();
        return;
      }

      console.log('尝试重新连接到服务器...');

      try {
        // 清理旧连接
        if (this.socket) {
          // 只移除业务事件监听器，保留 pong 监听
          this.socket.off('startStreamingRequest');
          this.socket.off('stopStreamingRequest');
          this.socket.off('replayRequest');
          this.socket.off('stopReplayRequest');
          this.socket.disconnect();
        }

        // 创建新连接
        this.socket = io(this.serviceURL, {
          reconnection: false,
        });

        // 设置统一的连接处理器
        this.setupConnectionHandlers();

        // 监听心跳响应
        this.socket.on('pong', () => {
          this.lastHeartbeatResponse = Date.now();
        });

        // 等待连接成功
        this.socket.once('connect', () => {
          console.log('重连成功，正在注册...');

          // 获取 RTP 能力并注册
          this.socket.emit('getRouterRtpCapabilities', (rtpCapabilities: RtpCapabilities) => {
            this.routerRtpCapabilities = rtpCapabilities;

            this.socket.emit(
              'register',
              {
                role: 'player',
                name: this.playerName,
              },
              (response: any) => {
                if (response.success) {
                  console.log('重连并注册成功');
                  this.isConnected = true;
                  this.connectionState = 'connected';
                  this.setupEventHandlers();
                  this.startHeartbeat();
                  this.stopReconnecting();

                  // 重连成功后，立即上报最后的设备状态
                  if (this.lastDeviceState.length > 0 || this.lastReadyState) {
                    console.log('重连后恢复设备状态:', {
                      devices: this.lastDeviceState.length,
                      isReady: this.lastReadyState,
                    });
                    this.reportDeviceState(this.lastDeviceState, this.lastReadyState);
                  }
                } else {
                  console.error('重连注册失败:', response.error);
                  // 注册失败，断开这个连接，等待下次重连
                  if (this.socket) {
                    this.socket.disconnect();
                  }
                }
              },
            );
          });
        });

        // 监听连接错误
        this.socket.once('connect_error', (error: any) => {
          console.error('重连失败:', error.message || error);
          this.connectionState = 'connecting'; // 保持 connecting 状态继续重连
        });
      } catch (error) {
        console.error('重连异常:', error);
      }
    };

    // 立即尝试一次
    attemptReconnect();

    // 然后定期重试
    this.reconnectTimer = setInterval(attemptReconnect, this.RECONNECT_INTERVAL);
  }

  // 停止重连
  private stopReconnecting() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = undefined;
      console.log('停止自动重连');
    }
  }

  // 断开连接
  disconnect() {
    this.stopHeartbeat();
    this.stopReconnecting();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.connectionState = 'disconnected';
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
    // 保存最后的状态，用于重连后恢复
    this.lastDeviceState = devices;
    this.lastReadyState = isReady;

    if (!this.socket || !this.socket.connected) {
      console.warn('WebSocket 未连接，无法上报设备状态（已保存状态，等待重连后上报）');
      return;
    }

    console.log('上报设备状态:', { devices: devices.length, isReady });
    this.socket.emit('reportDeviceState', {
      devices,
      isReady,
      playerName: this.playerName,
    });
  }
}

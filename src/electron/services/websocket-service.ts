import { io, Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';
import { ipcWebContentsSend } from '../utils';
import type {
  Resp,
  ContestInfo,
  TrackInfo,
  RequestStartBroadcast,
  ProduceParams,
  ProduceResponse,
  CompleteConnectTransportParams,
  ConfirmReadyResponse,
} from '../typings/data';

/**
 * WebSocket 服务 - 处理选手端与 Broadcaster Server 的通信
 */
export class WebSocketService {
  private serviceURL: string;
  private socket!: Socket;
  private mainWindow!: BrowserWindow;
  private connectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private servicePath: string | undefined = undefined;
  private clientId: string;

  // 鉴权信息
  private alias!: string;
  private userId!: string;
  private token!: string;

  // 状态缓存
  private lastTracks: TrackInfo[] = [];
  private isReady: boolean = false;

  constructor(serviceURL: string, servicePath?: string, clientId?: string) {
    this.serviceURL = serviceURL;
    this.servicePath = servicePath;
    this.clientId = clientId;
  }

  setMainWindow(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * 连接到服务器
   */
  async connect(alias: string, userId: string, token: string): Promise<boolean> {
    this.alias = alias;
    this.userId = userId;
    this.token = token;
    this.connectionState = 'connecting';

    return new Promise((resolve) => {
      if (this.socket?.connected) {
        this.connectionState = 'connected';
        resolve(true);
        return;
      }

      // 如果之前的 socket 存在，先清理
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      }

      const url = `${this.serviceURL}${this.serviceURL.endsWith('/') ? '' : '/'}broadcaster`;
      // 创建 socket 连接，使用 auth 进行握手鉴权
      this.socket = io(url, {
        reconnection: true, // 启用自动重连
        reconnectionAttempts: Infinity, // 无限重连尝试
        reconnectionDelay: 1000, // 初始重连延迟 1 秒
        reconnectionDelayMax: 5000, // 最大重连延迟 5 秒
        timeout: 10000, // 连接超时 10 秒
        path: this.servicePath,
        auth: {
          id: `b-${this.clientId}`,
          broadcasterToken: this.token,
        },
        extraHeaders: {
          'X-UCA': this.alias,
          'X-User-Id': this.userId,
        },
      });

      // 连接成功
      this.socket.once('connect', () => {
        console.log('连接服务器成功:', this.socket.id);
        this.connectionState = 'connected';

        this.socket.off('connect_error');
        // 设置事件处理器
        this.setupEventHandlers();

        resolve(true);
      });

      // 首次连接失败
      this.socket.once('connect_error', (error: any) => {
        console.log('连接错误:', error);
        // 是否是来自服务器的逻辑错误
        if (error.data && error.data.code) {
          console.error('认证失败，停止重连:', error.data);
          this.socket.disconnect();
        }

        this.connectionState = 'disconnected';
        resolve(false);
      });
    });
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers() {
    this.socket.on('disconnect', (reason: string) => {
      console.log('断开连接:', reason);
      ipcWebContentsSend('cleanup-media-resources', this.mainWindow.webContents, {});
      ipcWebContentsSend(
        'connection-state-changed',
        this.mainWindow.webContents,
        this.connectionState,
      );
    });

    this.socket.on('connect', () => {
      console.log('重新连接成功');
      this.connectionState = 'connected';

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        ipcWebContentsSend(
          'connection-state-changed',
          this.mainWindow.webContents,
          this.connectionState,
        );
      }

      if (this.isReady && this.lastTracks.length > 0) {
        console.log('重连后恢复就绪状态');
        this.confirmReady(this.lastTracks);
      }
    });

    this.socket.on('connect_error', (error: any) => {
      console.log('重连错误:', error.message);

      // 是否是来自服务器的逻辑错误
      if (error.data && error.data.code === -5) {
        console.error('认证失败，停止重连:', error.data);
        this.connectionState = 'disconnected';
        this.socket.disconnect();

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          ipcWebContentsSend(
            'connection-state-changed',
            this.mainWindow.webContents,
            this.connectionState,
          );
        }
      } else {
        this.connectionState = 'connecting';
        ipcWebContentsSend(
          'connection-state-changed',
          this.mainWindow.webContents,
          this.connectionState,
        );
      }
    });

    this.socket.on('requestStartBroadcast', (data: RequestStartBroadcast) => {
      console.log('收到推流请求:', data);
      ipcWebContentsSend('start-streaming-request', this.mainWindow.webContents, {
        classIds: data.trackIds,
      });
    });

    this.socket.on('requestStopBroadcast', () => {
      console.log('收到停止推流请求');
      ipcWebContentsSend('stop-streaming-request', this.mainWindow.webContents, {});
    });

    // 回看推流请求
    this.socket.on('replayRequest', ({ trackId, startTime, endTime }: any) => {
      console.log('收到回看请求:', trackId, startTime, endTime);
      ipcWebContentsSend('replay-request', this.mainWindow.webContents, {
        classId: trackId, // trackId 映射为 classId
        startTime,
        endTime,
      });
    });

    // 停止回看推流请求
    this.socket.on('stopReplayRequest', ({ trackId }: any) => {
      console.log('收到停止回看请求:', trackId);
      ipcWebContentsSend('stop-replay-request', this.mainWindow.webContents, { classId: trackId });
    });
  }

  /**
   * 获取比赛信息
   */
  getContestInfo(): Promise<Resp<ContestInfo>> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({
          success: false,
          msg: '未连接到服务器',
        });
        return;
      }

      this.socket.emit('getContestInfo', (resp: Resp<ContestInfo>) => {
        resolve(resp);
      });
    });
  }

  /**
   * 确认就绪
   */
  confirmReady(tracks: TrackInfo[]): Promise<Resp<ConfirmReadyResponse>> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({
          success: false,
          msg: '未连接到服务器',
        });
        return;
      }

      this.socket.emit('confirmReady', { tracks }, (resp: Resp<ConfirmReadyResponse>) => {
        if (resp.success) {
          this.isReady = true;
          this.lastTracks = tracks;
          console.log('就绪确认成功', resp.data);
        }
        resolve(resp);
      });
    });
  }

  /**
   * 取消就绪
   */
  cancelReady(): Promise<Resp> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({
          success: false,
          msg: '未连接到服务器',
        });
        return;
      }

      this.socket.emit('cancelReady', (resp: Resp) => {
        if (resp.success) {
          this.isReady = false;
          this.lastTracks = [];
          console.log('取消就绪成功');
        }
        resolve(resp);
      });
    });
  }

  /**
   * 完成连接 Transport
   */
  completeConnectTransport(params: CompleteConnectTransportParams): Promise<Resp> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({
          success: false,
          msg: '未连接到服务器',
        });
        return;
      }

      console.log('completeConnectTransport params:', params);
      this.socket.emit('completeConnectTransport', params, (resp: Resp) => {
        console.log('completeConnectTransport resp:', resp);
        resolve(resp);
      });
    });
  }

  /**
   * 推流
   */
  produce(params: ProduceParams): Promise<Resp<ProduceResponse>> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({
          success: false,
          msg: '未连接到服务器',
        });
        return;
      }

      console.log('produce params:', params);
      this.socket.emit('produce', params, (resp: Resp<ProduceResponse>) => {
        console.log('produce resp:', resp);
        resolve(resp);
      });
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this.connectionState = 'disconnected';
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionState;
  }
}

import { io, Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { ipcWebContentsSend } from '../utils';
import type {
  Resp,
  ContestInfo,
  TrackInfo,
  RequestStartBroadcast,
  RequestStopBroadcast,
  ProduceParams,
  ProduceResponse,
  CompleteConnectTransportParams,
  ConfirmReadyResponse,
  ReplayRequest,
  StopReplayRequest,
  RequestCreateClip,
  RequestCreateClipAck,
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
  private stopBroadcastCallbacks: Map<
    string,
    {
      callback: () => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  // 精彩回放切片请求处理器
  private createClipHandler?: (data: RequestCreateClip) => RequestCreateClipAck;

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

    // 校验并规范化服务地址，避免非法 URL（如缺少 // 的 http:host）导致 socket.io 解析出 undefined 主机名
    let parsedURL: URL;
    try {
      parsedURL = new URL(this.serviceURL);
    } catch {
      this.connectionState = 'disconnected';
      console.error('服务地址非法，请检查设置中的服务地址（需形如 http://host:port）:', this.serviceURL);
      return false;
    }
    if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
      this.connectionState = 'disconnected';
      console.error('服务地址协议非法，仅支持 http/https:', this.serviceURL);
      return false;
    }
    // origin 会把 http:127.0.0.1:3001 规范化为 http://127.0.0.1:3001
    this.serviceURL = parsedURL.origin;

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
      this.socket.once('connect_error', (error: Error & { data?: Resp }) => {
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
      this.connectionState = reason === 'io client disconnect' ? 'disconnected' : 'connecting';
      ipcWebContentsSend('cleanupMediaResources', this.mainWindow.webContents, {});
      ipcWebContentsSend(
        'connectionStateChanged',
        this.mainWindow.webContents,
        this.connectionState,
      );
    });

    this.socket.on('connect', () => {
      console.log('重新连接成功');
      this.connectionState = 'connected';

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        ipcWebContentsSend(
          'connectionStateChanged',
          this.mainWindow.webContents,
          this.connectionState,
        );
      }

      if (this.isReady && this.lastTracks.length > 0) {
        console.log('重连后恢复就绪状态');
        this.confirmReady(this.lastTracks)
          .then((resp) => {
            if (resp.success && resp.data && this.mainWindow && !this.mainWindow.isDestroyed()) {
              ipcWebContentsSend('transportReady', this.mainWindow.webContents, {
                transport: resp.data.transport,
                routerRtpCapabilities: resp.data.routerRtpCapabilities,
              });
            }
          })
          .catch((error) => {
            console.error('重连后恢复就绪状态失败:', error);
          });
      }
    });

    this.socket.on('connect_error', (error: Error & { data?: Resp }) => {
      console.log('重连错误:', error.message);

      // 是否是来自服务器的逻辑错误
      if (error.data && error.data.code === -5) {
        console.error('认证失败，停止重连:', error.data);
        this.connectionState = 'disconnected';
        this.socket.disconnect();

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          ipcWebContentsSend(
            'connectionStateChanged',
            this.mainWindow.webContents,
            this.connectionState,
          );
        }
      } else {
        this.connectionState = 'connecting';
        ipcWebContentsSend(
          'connectionStateChanged',
          this.mainWindow.webContents,
          this.connectionState,
        );
      }
    });

    this.socket.on('requestStartBroadcast', (data: RequestStartBroadcast) => {
      console.log('收到推流请求:', data);
      ipcWebContentsSend('startStreamingRequest', this.mainWindow.webContents, {
        classIds: data.trackIds,
      });
    });

    this.socket.on(
      'requestStopBroadcast',
      (data: RequestStopBroadcast = { trackIds: [] }, callback?: () => void) => {
        console.log('收到停止推流请求:', data);
        const requestId = callback ? randomUUID() : undefined;

        if (requestId && callback) {
          const timeout = setTimeout(() => {
            console.warn('等待停止推流回执超时，执行兜底 ACK:', requestId);
            this.completeStopBroadcast(requestId);
          }, 5000);
          this.stopBroadcastCallbacks.set(requestId, { callback, timeout });
        }

        ipcWebContentsSend('stopStreamingRequest', this.mainWindow.webContents, {
          classIds: data.trackIds || [],
          requestId,
        });
      },
    );

    // 回看推流请求
    this.socket.on('replayRequest', ({ trackId, startTime, endTime }: ReplayRequest) => {
      console.log('收到回看请求:', trackId, startTime, endTime);
      ipcWebContentsSend('replayRequest', this.mainWindow.webContents, {
        classId: trackId, // trackId 映射为 classId
        startTime,
        endTime,
      });
    });

    // 精彩回放切片请求
    this.socket.on(
      'requestCreateClip',
      (data: RequestCreateClip, callback?: (ack: RequestCreateClipAck) => void) => {
        console.log(
          '收到切片请求:',
          data.taskId,
          data.items.map((item) => item.trackId),
        );
        const ack = this.createClipHandler
          ? this.createClipHandler(data)
          : { accepted: false, errorCode: 'client_not_ready', errorMessage: '切片服务未初始化' };
        callback?.(ack);
      },
    );

    // 停止回看推流请求
    this.socket.on('stopReplayRequest', ({ trackId }: StopReplayRequest) => {
      console.log('收到停止回看请求:', trackId);
      ipcWebContentsSend('stopReplayRequest', this.mainWindow.webContents, { classId: trackId });
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
   * 设置精彩回放切片请求处理器
   */
  setCreateClipHandler(handler: (data: RequestCreateClip) => RequestCreateClipAck) {
    this.createClipHandler = handler;
  }

  /**
   * 测量服务端时间与本地时间的偏差（服务端时间 = 本地时间 + 偏差）
   */
  async getServerTimeOffset(): Promise<number> {
    const sentAt = Date.now();
    const resp = await this.getContestInfo();
    const receivedAt = Date.now();
    if (resp.success === false || !resp.data) {
      throw new Error((resp.success === false && resp.msg) || '获取服务端时间失败');
    }
    return resp.data.serverTimestamp - Math.round((sentAt + receivedAt) / 2);
  }

  /**
   * 获取 Hub HTTP 接口地址与选手身份
   */
  getHttpContext() {
    return {
      baseURL: this.serviceURL.replace(/\/+$/, ''),
      alias: this.alias,
      userId: this.userId,
    };
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

  completeStopBroadcast(requestId?: string) {
    if (!requestId) return;

    const pending = this.stopBroadcastCallbacks.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    pending.callback();
    this.stopBroadcastCallbacks.delete(requestId);
  }

  /**
   * 断开连接
   */
  disconnect() {
    for (const requestId of this.stopBroadcastCallbacks.keys()) {
      this.completeStopBroadcast(requestId);
    }
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

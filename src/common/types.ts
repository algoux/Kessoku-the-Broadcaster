// 连接认证
export interface AuthCredentials {
  competitionId: string;
  userId: string;
  token: string;
}

// 视频流配置
export interface StreamConfig {
  id: string;  // 'screen_capture', 'camera_1' 等
  type: 'screen' | 'camera';
  label: string;
  sourceId?: string;    // 屏幕/窗口 ID
  deviceId?: string;    // 摄像头设备 ID
  resolution: {
    width: number;
    height: number;
  };
  bitrate: number;
  enabled: boolean;
}

// 设备信息
export interface MediaDevice {
  id: string;
  name: string;
  type: 'screen' | 'window' | 'camera' | 'microphone';
  thumbnail?: string;  // 预览缩略图
}

// Socket 消息类型
export enum MessageType {
  READY = 'ready',
  STOP_READY = 'stop_ready',
  START_STREAM = 'start_stream',
  STOP_STREAM = 'stop_stream',
  WEBRTC_SIGNAL = 'webrtc_signal',
  WEBRTC_ANSWER = 'webrtc_answer',
}

// 服务器指令
export interface ServerCommand {
  type: MessageType;
  streamId?: string;
  signal?: any;
  data?: any;
}

// 连接状态
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  READY = 'ready',
  ERROR = 'error',
}
export interface DeviceSettings {
  width?: number;
  height?: number;
  frameRate?: number;
  maxFrameRate?: number; // 设备支持的最大帧率
  aspectRatio?: number;
  facingMode?: string;
  sampleRate?: number;
  channelCount?: number;
  formatSetting?: string;
}

export type DeviceType = 'screen' | 'camera' | 'microphone';

type ClassIdPattern<T extends DeviceType> = T extends 'screen'
  ? `screen_${string}`
  : T extends 'camera'
    ? `camera_${string}`
    : T extends 'microphone'
      ? `microphone_${string}`
      : never;

export interface DeviceCapabilities {
  width?: { min?: number; max?: number };
  height?: { min?: number; max?: number };
  frameRate?: { min?: number; max?: number };
  aspectRatio?: { min?: number; max?: number };
  sampleRate?: { min?: number; max?: number };
  channelCount?: { min?: number; max?: number };
}

export interface Device<T extends DeviceType = DeviceType> {
  id: string;
  name: string;
  type: T;
  classId: ClassIdPattern<T>;
  enabled: boolean;
  isDefault?: boolean;
  stream?: MediaStream;
  settings?: DeviceSettings;
  capabilities?: DeviceCapabilities;
  formatSetting?: string;
}

export interface ConfigForm {
  width: number;
  height: number;
  frameRate: number;
  sampleRate?: number;
  channelCount?: number;
}

// 设备信息上报接口（发送给服务器）
export interface DeviceInfo {
  classId: string;
  type: DeviceType;
  name: string;
  enabled: boolean;
  settings?: DeviceSettings;
}

export interface PlayerDeviceState {
  playerName: string;
  socketId: string;
  devices: DeviceInfo[];
  isReady: boolean;
}

export interface CanAddState {
  screen: number;
  camera: number;
  microphone: number;
}

export enum ConnectState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
}
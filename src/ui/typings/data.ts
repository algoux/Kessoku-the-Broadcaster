import { SimulcastConfig } from 'common/config.interface';
import { DeviceManager } from '@/services/device-manager';

export interface DeviceSettings {
  width?: number;
  height?: number;
  frameRate?: number;
  maxFrameRate?: number; // 设备支持的最大帧率
  aspectRatio?: number;
  facingMode?: string;
  sampleRate?: number;
  channelCount?: number;
  channelMode?: 'mono' | 'stereo'; // 麦克风通道模式：单声道或立体声
  formatSetting?: string;
  simulcastConfigs?: SimulcastConfig[]; // Simulcast 编码配置
}

export type DeviceType = 'screen' | 'camera' | 'microphone';

export type ClassIdPattern<T extends DeviceType> = T extends 'screen'
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
  isDefault?: boolean;
  stream?: MediaStream;
  settings?: DeviceSettings;
  capabilities?: DeviceCapabilities;
  formatSetting?: string;
}

// 设备信息上报接口（发送给服务器）
export interface DeviceInfo {
  classId: string;
  type: DeviceType;
  name: string;
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

export interface DeviceAddingRes {
  success: boolean;
  code: number;
  device?: Device;
}

export interface ConfigSaveRes {
  updateIndex: number;
  updateDevice: Device;
}

/**
 * 设备源信息类型
 */
export type DeviceSourceInfo =
  | { id: string; name: string } // Screen
  | MediaDeviceInfo; // Camera or Microphone

/**
 * 设备类型配置
 */
export interface DeviceTypeConfig {
  availableDevicesKey: 'availableScreens' | 'availableCameras' | 'availableMicrophones';
  getDeviceId: (info: DeviceSourceInfo) => string;
  getDeviceName: (info: DeviceSourceInfo) => string;
  findDeviceInfo: (manager: DeviceManager, id: string) => DeviceSourceInfo | undefined;
}

/**
 * 设备类型配置映射 - 统一不同设备类型的操作
 */
export const DEVICE_TYPE_CONFIG: Record<DeviceType, DeviceTypeConfig> = {
  screen: {
    availableDevicesKey: 'availableScreens',
    getDeviceId: (info) => (info as { id: string }).id,
    getDeviceName: (info) => (info as { name: string }).name,
    findDeviceInfo: (manager, id) => manager.availableScreens.find((s) => s.id === id),
  },
  camera: {
    availableDevicesKey: 'availableCameras',
    getDeviceId: (info) => (info as MediaDeviceInfo).deviceId,
    getDeviceName: (info) => (info as MediaDeviceInfo).label,
    findDeviceInfo: (manager, id) => manager.availableCameras.find((c) => c.deviceId === id),
  },
  microphone: {
    availableDevicesKey: 'availableMicrophones',
    getDeviceId: (info) => (info as MediaDeviceInfo).deviceId,
    getDeviceName: (info) => (info as MediaDeviceInfo).label || '默认麦克风',
    findDeviceInfo: (manager, id) => manager.availableMicrophones.find((m) => m.deviceId === id),
  },
};

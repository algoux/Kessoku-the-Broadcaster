// 导入 Broadcaster 类型定义
import type { SimulcastConfig } from './types/broadcaster.types';

export type { SimulcastConfig };

export interface VideoConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  simulcastConfigs: SimulcastConfig[];
}

export interface AudioConfig {
  id: string;
  name: string;
  sampleRate: number;
  channelCount: number;
}

export interface AppConfigInterface {
  version: string;
  servicePath: string | undefined;
  appConfig: {
    autoOpenOnLogin?: boolean; // 开机自启动
    autoReady?: boolean; // 启动时自动准备
    videoCachePath?: string; // 视频缓存路径
  };
  userConfig: {
    broadcasterToken?: string; // Broadcaster 推流 token
    userId?: string;
    userName?: string;
    organizationName?: string; // 组织名称（山东理工大学）
    placeName?: string; // 场地名称（A20）
  };
  competitionConfig: {
    competitionId?: number; // 赛事 ID
    competitionName?: string; // 赛事名称
    alias?: string; // 赛事别名（用于连接 Broadcaster Server）
  };
  devicesConfig: {
    screens?: Array<VideoConfig>;
    cameras?: Array<VideoConfig>;
    microphones?: Array<AudioConfig>;
  };
}

export interface UpdateVideoConfigDTO {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  simulcastConfigs: SimulcastConfig[];
}

export interface UpdateAudioConfigDTO {
  id: string;
  name: string;
  sampleRate: number;
  channelCount: number;
}

export interface UpdateAppConfigDTO {
  autoOpenOnLogin?: boolean; // 开机自启动
  autoReady?: boolean; // 启动时自动准备
  videoCachePath: string; // 视频缓存路径
}

export interface UpdateUserConfigDTO {
  broadcasterToken?: string;
  userId?: string;
  userName?: string;
  organizationName?: string;
  placeName?: string;
}

export interface UpdateCompetitionConfigDTO {
  competitionId?: number;
  competitionName?: string;
  alias?: string;
}

export interface UpdateGlobalConfigDTO {
  version?: string;
  servicePath?: string;
}

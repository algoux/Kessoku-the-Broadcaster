/**
 * 配置文件类型
 */

export interface SimulcastConfig {
  rid: string; // 通道标识符（original, low, medium, high 等）
  scaleResolutionDownBy: number; // 分辨率缩放比率
  maxBitRate: number; // 最大码率 (Kbps)
  maxFramerate?: number; // 最大帧率（动态注入，不保存到配置文件）
}

export interface GetPlatformInfoDTO {
  platform: NodeJS.Platform;
  arch: string;
}

export interface VideoConfig {
  id: string;
  classId: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  simulcastConfigs: SimulcastConfig[];
}

export interface AudioConfig {
  id: string;
  classId: string;
  name: string;
  sampleRate: number;
  channelCount: number;
  channelMode?: 'mono' | 'stereo'; // 通道模式：单声道或立体声
}

export interface AppConfigInterface {
  version: string;
  clientId: string;
  serviceURL: string | undefined;
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
  classId: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  simulcastConfigs: SimulcastConfig[];
}

export interface UpdateAudioConfigDTO {
  id: string;
  classId: string;
  name: string;
  sampleRate: number;
  channelCount: number;
  channelMode?: 'mono' | 'stereo'; // 通道模式：单声道或立体声
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
  serviceURL?: string;
  servicePath?: string;
}

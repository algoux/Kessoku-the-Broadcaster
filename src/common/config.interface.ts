export interface VideoConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
}

export interface AudioConfig {
  id: string;
  name: string;
  sampleRate: number;
  channelCount: number;
}

export interface AppConfigInterface {
  version: string;
  appConfig: {
    autoOpenOnLogin?: boolean; // 开机自启动
    autoReady?: boolean; // 启动时自动准备
    videoCachePath?: string; // 视频缓存路径
  };
  userConfig: {
    rlToken?: string; // rl 推流 token
    userId?: string;
    userName?: string; 
    organizationName?: string; // 组织名称（山东理工大学）
    placeName?: string; // 场地名称（A20）
  };
  competitionConfig: {
    competitionId?: number; // 赛事 ID
    competitionName?: string;
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
  rlToken?: string;
  userId?: string;
  userName?: string;
  organizationName?: string;
  placeName?: string;
}

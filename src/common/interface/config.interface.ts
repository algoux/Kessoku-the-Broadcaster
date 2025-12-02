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
    autoStartStreaming?: boolean; // 启动时自动开始推流
    autoHiddenOnStart?: boolean; // 启动时自动隐藏主窗口
    videoCachePath: string; // 视频缓存路径
  };
  userConfig: {
    rlToken?: string;
    userId?: string;
    competitionId?: string;
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
  autoOpenOnLogin: boolean;
  autoStartStreaming: boolean;
  autoHiddenOnStart: boolean;
  videoCachePath: string;
}

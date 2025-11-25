declare global {
  type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageUsage: number;
  };

  type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
  };

  type UnsubscribeFunction = () => void;

  // IPC 事件负载映射
  type EventPayloadMapping = {
    // 基础事件
    statistics: Statistics;
    getStaticData: StaticData;
    getSources: Electron.DesktopCapturerSource[];
    saveVideo: string | null;
    hasReady: void;
    setWindowTitle: string;
    loginSuccess: void;

    // WebSocket 相关事件
    login: { success: boolean; error?: string };
    'get-connection-status': { connected: boolean; socketId: string | null };
    'get-router-rtp-capabilities': any;
    'create-producer-transport': any;
    'connect-producer-transport': void;
    'create-producer': { id: string };
    'streaming-started': { producerId: string; kind: string; rtpParameters?: any };
    'streaming-stopped': { producerId: string };
    'report-device-state': { success: boolean };

    // 监听事件
    'start-streaming-request': { requestedBy: string; classIds: string[] };
    'stop-streaming-request': { requestedBy: string };
    'replay-request': { requestedBy: string; classId: string; seconds: number };
    'stop-replay-request': { classId: string };

    // 回看相关事件
    'handle-replay-request': { success: boolean; filePath?: string; error?: string };
    'replay-video-ready': { classId: string; filePath: string; seconds: number };

    // 视频录制相关
    'start-continuous-recording': { success: boolean; error?: string };
    'stop-continuous-recording': { success: boolean };
    'get-recording-blob': void;
    'cut-video': { success: boolean; filePath?: string; error?: string };
    'read-video-file': ArrayBuffer;
  };

  // 扩展 Window 接口
  interface Window {
    electron: {
      getSources: () => Promise<Electron.DesktopCapturerSource[]>;
      saveVideo: (arrayBuffer: ArrayBuffer) => Promise<string | null>;
      subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
      getStaticData: () => Promise<StaticData>;
      setWindowTitle: (title: string) => void;
      loginSuccess: () => void;
      hasReady: () => void;
      // WebSocket 相关方法
      login: (playerName: string) => Promise<{ success: boolean; error?: string }>;
      getConnectionStatus: () => Promise<{ connected: boolean; socketId: string | null }>;
      getRouterRtpCapabilities: () => Promise<any>;
      createProducerTransport: () => Promise<any>;
      connectProducerTransport: (transportId: string, dtlsParameters: any) => Promise<void>;
      createProducer: (kind: string, rtpParameters: any) => Promise<{ id: string }>;
      notifyStreamingStarted: (producerId: string, kind: string, rtpParameters?: any) => void;
      notifyStreamingStopped: (producerId: string) => void;
      // 设备状态上报
      reportDeviceState: (devices: any[], isReady: boolean) => Promise<{ success: boolean }>;
      // IPC 监听器方法
      onStreamingRequest: (
        callback: (data: { requestedBy: string; classIds: string[] }) => void,
      ) => void;
      onStopStreamingRequest: (callback: (data: { requestedBy: string }) => void) => void;
      onReplayRequest: (
        callback: (data: { requestedBy: string; classId: string; seconds: number }) => void,
      ) => void;
      onReplayVideoReady: (
        callback: (data: { classId: string; filePath: string; seconds: number }) => void,
      ) => void;
      onStopReplayRequest: (callback: (data: { classId: string }) => void) => void;
      removeAllListeners: (channel: string) => void;
      // 视频录制相关
      startContinuousRecording: (classId: string) => Promise<{ success: boolean; error?: string }>;
      stopContinuousRecording: (classId: string) => Promise<{ success: boolean }>;
      sendRecordingBlob: (classId: string, blob: Blob) => Promise<void>;
      cutVideo: (
        classId: string,
        seconds: number,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      readVideoFile: (filePath: string) => Promise<ArrayBuffer>;
      handleReplayRequest: (
        classId: string,
        seconds: number,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    };
  }
}

export {};

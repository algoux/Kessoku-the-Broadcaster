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

  type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    getSources: Electron.DesktopCapturerSource[];
    saveVideo: string | null;
    hasReady: void;
  };

  type UnsubscribeFunction = () => void;

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
      // 新的 WebSocket 相关方法
      login: (playerName: string) => Promise<{ success: boolean; error?: string }>;
      getConnectionStatus: () => Promise<{ connected: boolean; socketId: string | null }>;
      getRouterRtpCapabilities: () => Promise<any>;
      createProducerTransport: () => Promise<any>;
      connectProducerTransport: (transportId: string, dtlsParameters: any) => Promise<void>;
      createProducer: (kind: string, rtpParameters: any) => Promise<{ id: string }>;
      notifyStreamingStarted: (producerId: string, kind: string, rtpParameters?: any) => void;
      notifyStreamingStopped: (producerId: string) => void;
      // 设备状态上报
      reportDeviceState: (devices: any[], isReady: boolean) => Promise<void>;
      // IPC 监听器方法
      onStreamingRequest: (
        callback: (data: { requestedBy: string; classIds: string[] }) => void,
      ) => void;
      onStopStreamingRequest: (callback: (data: { requestedBy: string }) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export {};

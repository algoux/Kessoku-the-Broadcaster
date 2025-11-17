// Global type definitions inside global augmentation
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
    };
  }
}

export {};

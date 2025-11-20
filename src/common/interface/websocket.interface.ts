import { Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';

export interface IWebSocketConnectionStatus {
  connected: boolean;
  socketId: string;
}

// export interface IWebSocketInterface {
//   socket: Socket | null;
//   mainWindow: BrowserWindow | null;
//   isConnected: boolean;
//   playerName: string;
//   routerRtpCapabilities: any;
//   connect(playerName: string): Promise<boolean>;
//   setMainWindow(mainWindow: BrowserWindow): void;
//   setupEventHandlers(): void;
//   notifyStreamingStopped(producerId: string): void;
//   getConnectionStatus(): IWebSocketConnectionStatus;
//   getRouterRtpCapabilities(): any;
//   createProducerTransport(): Promise<any>;
//   connectProducerTransport(transportId: string, dtlsParameters: any): Promise<void>;
//   createProducer(kind: string, rtpParameters: any): Promise<{ id: string }>;
//   disconnect(): void;
//   reconnect(): void;
// }

export abstract class WebSocketBase {
  private socket: Socket | null;
  private mainWindow: BrowserWindow | null;
  private isConnected: boolean;
  private playerName: string;
  private routerRtpCapabilities: any;

  abstract connect(playerName: string): Promise<boolean>;
  abstract setMainWindow(mainWindow: BrowserWindow): void;
  abstract setupEventHandlers(): void;
  abstract notifyStreamingStopped(producerId: string): void;
  abstract getConnectionStatus(): IWebSocketConnectionStatus;
  abstract getRouterRtpCapabilities(): any;
  abstract createProducerTransport(): Promise<any>;
  abstract connectProducerTransport(transportId: string, dtlsParameters: any): Promise<void>;
  abstract createProducer(kind: string, rtpParameters: any): Promise<{ id: string }>;
  abstract disconnect(): void;
  abstract reconnect(): void;
}

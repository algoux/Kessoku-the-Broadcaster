export interface ChunkInfo {
    blob: Blob;
    type: string;
    timestamp: number;
    index: number;
    size: number;
}

export interface RecordingOptions {
    timeSlice?: number;
    mimeType?: string;
    onDataAvailable?: (blob: Blob, type: string, index: number) => void;
    onError?: (error: Error) => void;
}

export interface RecordingStatus {
    isRecording: boolean;
    chunkCount: number;
    totalSize: number;
}

export interface MediaRecorderConstructor {
    new (stream: MediaStream, options?:any): IMediaRecorder;
}

export interface IMediaRecorder {
    start(timeSlice?: number): void;
    stop(): void;
    ondataavailable: ((event: BlobEvent) => void);
    onerror: ((event: ErrorEvent) => void);
    state: string;
    mimeType: string;
}
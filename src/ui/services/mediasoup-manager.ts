import * as mediasoupClient from "mediasoup-client";


export class MediaSoupManager {
    private device: mediasoupClient.Device | null = null;

    initialize() {
        this.device = new mediasoupClient.Device();
        console.log('Mediasoup Device initialized:', this.device);
    }
}
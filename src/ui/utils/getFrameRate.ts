/**
 * 检测显示器实际刷新率（整数版）
 * @param {number} sampleCount - 采样帧数，默认 60
 * @returns {Promise<number>} 整数 Hz
 */
export function getScreenActualRefreshRate(sampleCount = 60) {
  return new Promise(resolve => {
    let count = 0;
    
    let last = performance.now();
    const samples = [];

    function loop() {
      const now = performance.now();
      samples.push(now - last);
      last = now;

      count++;
      if (count < sampleCount) {
        requestAnimationFrame(loop);
      } else {
        // 第一帧不准，去掉
        samples.shift();

        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const rate = 1000 / avg;
        resolve(Math.round(rate));
      }
    }

    requestAnimationFrame(loop);
  });
}

/**
 * 计算摄像头视频实际帧率（基于 requestVideoFrameCallback）
 * @param {HTMLVideoElement} video - 播放摄像头流的 video 元素
 * @param {number} sampleCount - 采样帧数（越高越准）
 * @returns {Promise<number>} 实际帧率（整数）
 */
export function getCameraActualFPS(video: HTMLVideoElement, sampleCount: number = 120) {
  return new Promise(resolve => {
    const times = [];
    let last = performance.now();
    let count = 0;

    function onFrame(now, metadata) {
      const delta = now - last;
      last = now;
      times.push(delta);

      count++;
      if (count < sampleCount) {
        video.requestVideoFrameCallback(onFrame);
      } else {
        // 去除第一帧
        times.shift();
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const fps = 1000 / avg;
        resolve(Math.round(fps));
      }
    }

    video.requestVideoFrameCallback(onFrame);
  });
}
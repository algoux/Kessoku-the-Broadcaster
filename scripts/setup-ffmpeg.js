const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const ReleaseVersion = 'b6.1.1';

function parsePlatform(platform) {
  if (platform === 'win32') {
    return 'win';
  } else if (platform === 'darwin') {
    return 'mac';
  } else if (platform === 'linux') {
    return 'linux';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

function parseArch(arch) {
  if (arch === 'x64') {
    return 'x64';
  } else if (arch === 'arm64') {
    return 'arm64';
  } else {
    throw new Error(`Unsupported architecture: ${arch}`);
  }
}

function getOutputPath(platform, arch) {
  const platformName = parsePlatform(platform);
  const archName = parseArch(arch);
  const dirName = `${platformName}-${archName}`;
  const baseDir = path.join(__dirname, '..', 'resources', 'ffmpeg', dirName);

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const extension = platformName === 'win' ? '.exe' : '';
  return {
    ffmpegPath: path.join(baseDir, `ffmpeg${extension}`),
    ffprobePath: path.join(baseDir, `ffprobe${extension}`),
    baseDir,
  };
}

function getDownloadUrl(platform, arch) {
  if (platform === 'win32' && arch === 'arm64') {
    const ffmpegPath = 'https://cdn.shaly.sdutacm.cn/atrior/ffmpeg-assets/win-arm64/ffmpeg.exe';
    const ffprobePath = 'https://cdn.shaly.sdutacm.cn/atrior/ffmpeg-assets/win-arm64/ffprobe.exe';
    return { ffmpegPath, ffprobePath };
  }
  const ffmpegPath = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ReleaseVersion}/ffmpeg-${platform}-${arch}`;
  const ffprobePath = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ReleaseVersion}/ffprobe-${platform}-${arch}`;
  return { ffmpegPath, ffprobePath };
}

async function downloadFile(url, outputPath) {
  console.log(`下载: ${url}`);

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();

          // 给文件添加执行权限（Unix 系统）
          if (process.platform !== 'win32') {
            fs.chmodSync(outputPath, 0o755);
          }

          console.log(`完成: ${path.basename(outputPath)}`);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(outputPath, () => {});
          reject(err);
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

async function main() {
  const platform = os.platform();
  const arch = os.arch();

  console.log(`平台: ${platform}, 架构: ${arch}, GitHub Release 版本: ${ReleaseVersion}`);

  const {
    ffmpegPath: ffmpegOutput,
    ffprobePath: ffprobeOutput,
    baseDir,
  } = getOutputPath(platform, arch);
  const { ffmpegPath: ffmpegUrl, ffprobePath: ffprobeUrl } = getDownloadUrl(platform, arch);

  try {
    await downloadFile(ffmpegUrl, ffmpegOutput);

    await downloadFile(ffprobeUrl, ffprobeOutput);

    console.log('所有 ffmpeg 相关二进制文件下载完成');
  } catch (error) {
    console.error('下载失败:', error.message);
    process.exit(1);
  }
}

main();

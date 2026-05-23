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

function binaryExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.statSync(filePath);
  return stat.isFile() && stat.size > 0 && isBinaryComplete(filePath);
}

function rangeFits(fileSize, offset, size) {
  return offset >= 0 && size >= 0 && offset + size <= fileSize;
}

function checkLinkeditData(fileSize, buffer, commandOffset) {
  const dataOffset = buffer.readUInt32LE(commandOffset + 8);
  const dataSize = buffer.readUInt32LE(commandOffset + 12);
  return rangeFits(fileSize, dataOffset, dataSize);
}

function isDarwinMachOComplete(filePath) {
  const stat = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);

  if (buffer.length < 32 || buffer.readUInt32LE(0) !== 0xfeedfacf) {
    return false;
  }

  const commandCount = buffer.readUInt32LE(16);
  const commandBytes = buffer.readUInt32LE(20);
  let commandOffset = 32;

  if (!rangeFits(buffer.length, commandOffset, commandBytes)) {
    return false;
  }

  for (let index = 0; index < commandCount; index++) {
    if (!rangeFits(buffer.length, commandOffset, 8)) {
      return false;
    }

    const command = buffer.readUInt32LE(commandOffset);
    const commandSize = buffer.readUInt32LE(commandOffset + 4);

    if (commandSize < 8 || !rangeFits(buffer.length, commandOffset, commandSize)) {
      return false;
    }

    switch (command) {
      case 0x19: {
        const fileOffset = Number(buffer.readBigUInt64LE(commandOffset + 40));
        const fileSize = Number(buffer.readBigUInt64LE(commandOffset + 48));
        if (fileSize > 0 && !rangeFits(stat.size, fileOffset, fileSize)) {
          return false;
        }
        break;
      }
      case 0x2: {
        const symbolOffset = buffer.readUInt32LE(commandOffset + 8);
        const symbolCount = buffer.readUInt32LE(commandOffset + 12);
        const stringOffset = buffer.readUInt32LE(commandOffset + 16);
        const stringSize = buffer.readUInt32LE(commandOffset + 20);
        if (
          !rangeFits(stat.size, symbolOffset, symbolCount * 16) ||
          !rangeFits(stat.size, stringOffset, stringSize)
        ) {
          return false;
        }
        break;
      }
      case 0x1d:
      case 0x26:
      case 0x29:
      case 0x80000033:
      case 0x80000034:
        if (!checkLinkeditData(stat.size, buffer, commandOffset)) {
          return false;
        }
        break;
      default:
        break;
    }

    commandOffset += commandSize;
  }

  return true;
}

function isBinaryComplete(filePath) {
  if (os.platform() !== 'darwin') {
    return true;
  }

  try {
    return isDarwinMachOComplete(filePath);
  } catch (_) {
    return false;
  }
}

async function downloadFile(url, outputPath) {
  console.log(`下载: ${url}`);

  return new Promise((resolve, reject) => {
    const tempOutputPath = `${outputPath}.download`;

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

        const fileStream = fs.createWriteStream(tempOutputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();

          // 给文件添加执行权限（Unix 系统）
          if (process.platform !== 'win32') {
            fs.chmodSync(tempOutputPath, 0o755);
          }

          fs.renameSync(tempOutputPath, outputPath);
          console.log(`完成: ${path.basename(outputPath)}`);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(tempOutputPath, () => {});
          reject(err);
        });
      })
      .on('error', (err) => {
        fs.unlink(tempOutputPath, () => {});
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
    if (binaryExists(ffmpegOutput) && binaryExists(ffprobeOutput)) {
      console.log(`检测到 ${baseDir} 中已存在 ffmpeg 和 ffprobe，跳过下载`);
      return;
    }

    if (binaryExists(ffmpegOutput)) {
      console.log(`跳过: ${path.basename(ffmpegOutput)} 已存在`);
    } else {
      if (fs.existsSync(ffmpegOutput)) {
        console.log(`检测到无效文件，重新下载: ${path.basename(ffmpegOutput)}`);
        fs.unlinkSync(ffmpegOutput);
      }
      await downloadFile(ffmpegUrl, ffmpegOutput);
    }

    if (binaryExists(ffprobeOutput)) {
      console.log(`跳过: ${path.basename(ffprobeOutput)} 已存在`);
    } else {
      if (fs.existsSync(ffprobeOutput)) {
        console.log(`检测到无效文件，重新下载: ${path.basename(ffprobeOutput)}`);
        fs.unlinkSync(ffprobeOutput);
      }
      await downloadFile(ffprobeUrl, ffprobeOutput);
    }

    console.log('所有 ffmpeg 相关二进制文件下载完成');
  } catch (error) {
    console.error('下载失败:', error.message);
    process.exit(1);
  }
}

main();

import path from 'path';
import fs from 'fs';
import unzipper from 'unzipper';

const MAC_FFMPEG_ARM_URL = 'https://evermeet.cx/ffmpeg/ffmpeg-121955-g413346bd06.zip';
const MAC_FFPROBE_ARM_URL = 'https://evermeet.cx/ffmpeg/ffprobe-121955-g413346bd06.zip';

function getDownloadUrl(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      ffmpeg: MAC_FFMPEG_ARM_URL,
      ffprobe: MAC_FFPROBE_ARM_URL,
    };
  }
}

function getOutputPath(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') {
    return path.join(__dirname, '../resources/ffmpeg/mac-arm64');
  }
}

async function downloadAndExtract(url, outputPath) {

}

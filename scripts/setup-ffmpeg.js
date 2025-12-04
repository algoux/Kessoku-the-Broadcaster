const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const fetch = require('node-fetch');

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
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download from ${url}: ${res.statusText}`);
  }

  await new Promise((resolve, reject) => {
    res.body
      .pipe(unzipper.Extract({ path: outputPath }))
      .on('close', resolve)
      .on('error', reject);
  });
}

async function main() {
  const platform = process.platform;
  const arch = process.arch;

  const url = getDownloadUrl(platform, arch);
  const outputPath = getOutputPath(platform, arch);

  if (!url || !outputPath) {
    console.log(`No prebuilt binaries available for ${platform} ${arch}. Skipping download.`);
    return;
  }
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  console.log(`Downloading ffmpeg from ${url.ffmpeg}...`);
  await downloadAndExtract(url.ffmpeg, outputPath);
  console.log(`Downloading ffprobe from ${url.ffprobe}...`);
  await downloadAndExtract(url.ffprobe, outputPath);

  console.log(`ffmpeg and ffprobe have been set up at ${outputPath}`);
}

main().catch((err) => {
  console.error('Error during setup:', err);
  process.exit(1);
});

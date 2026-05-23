const fs = require('fs').promises;
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');

const args = process.argv.slice(2);
const releaseVersion = args[0];
const artifactsDir = args[1] || 'dist';
const baseDir = path.join(__dirname, '..', artifactsDir);

const CDN_DOMAIN = process.env.COS_CDN_DOMAIN || 'https://cdn.algoux.cn/';
const REMOTE_RELEASE_DIR = ensureTrailingSlash(
  process.env.COS_BASE_PATH || 'Kessoku-the-Broadcaster/release/',
);
const REMOTE_PATH = `${REMOTE_RELEASE_DIR}${releaseVersion}/`;
const VERSION_INDEX_KEY = `${REMOTE_RELEASE_DIR}version.json`;

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function toCdnUrl(remotePath) {
  return `${CDN_DOMAIN.replace(/\/$/, '')}/${remotePath.replace(/^\/+/, '')}`;
}

async function listFiles(dir, maxDepth = Infinity, filter, _depth = 0) {
  if (_depth > 0 && _depth > maxDepth) {
    return [];
  }
  let files = await fs.readdir(dir, { withFileTypes: true });
  let fileNames = [];

  for (let file of files) {
    let fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      fileNames = fileNames.concat(await listFiles(fullPath, maxDepth, filter, _depth + 1));
    } else {
      fileNames.push(path.relative(baseDir, fullPath));
    }
  }

  return fileNames.filter(filter || Boolean).filter(Boolean);
}

function getDownloadMetadata(file) {
  const normalizedFile = file.replace(/\\/g, '/');
  const [artifactName = ''] = normalizedFile.split('/');
  const fileName = path.basename(normalizedFile);
  const searchText = `${artifactName} ${fileName}`.toLowerCase();
  const ext = path.extname(fileName);

  let platform = 'unknown';
  if (searchText.includes('macos') || searchText.includes('-mac-')) {
    platform = 'macos';
  } else if (searchText.includes('windows') || searchText.includes('-win-')) {
    platform = 'windows';
  } else if (searchText.includes('linux')) {
    platform = 'linux';
  }

  let arch = 'unknown';
  if (searchText.includes('arm64') || searchText.includes('aarch64')) {
    arch = 'arm64';
  } else if (
    searchText.includes('x64') ||
    searchText.includes('x86_64') ||
    searchText.includes('amd64')
  ) {
    arch = 'x64';
  }

  let format = ext.replace(/^\./, '').toLowerCase();
  if (fileName.endsWith('.AppImage')) {
    format = 'appImage';
  }

  return {
    platform,
    arch,
    format,
    fileName,
  };
}

function buildVersionIndex(releaseVersion, uploadedFiles) {
  const downloads = {};
  const files = uploadedFiles.map(({ file, remotePath }) => {
    const metadata = getDownloadMetadata(file);
    const url = toCdnUrl(remotePath);

    downloads[metadata.platform] ||= {};
    downloads[metadata.platform][metadata.arch] ||= {};
    downloads[metadata.platform][metadata.arch][metadata.format] = url;

    return {
      ...metadata,
      path: file.replace(/\\/g, '/'),
      url,
    };
  });

  return {
    version: releaseVersion,
    latestVersion: releaseVersion,
    updatedAt: new Date().toISOString(),
    downloads,
    files,
  };
}

async function uploadVersionIndex(cos, versionIndex) {
  const body = JSON.stringify(versionIndex, null, 2);
  console.log(`Uploading version index -> ${VERSION_INDEX_KEY}`);
  await cos.putObject({
    Bucket: process.env.COS_BUCKET,
    Region: process.env.COS_REGION,
    Key: VERSION_INDEX_KEY,
    Body: Buffer.from(body),
    ContentType: 'application/json; charset=utf-8',
  });
  console.log(`Uploaded version index. CDN url: ${toCdnUrl(VERSION_INDEX_KEY)}`);
}

async function main() {
  if (
    !process.env.COS_SECRET_ID ||
    !process.env.COS_SECRET_KEY ||
    !process.env.COS_BUCKET ||
    !process.env.COS_REGION
  ) {
    throw new Error('COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION must be set');
  }
  if (!releaseVersion) {
    throw new Error('Usage: node upload-artifacts-to-cos.js <releaseVersion>');
  }
  console.log(`Uploading artifacts for ${releaseVersion}`);
  const cos = new COS({
    Domain: process.env.COS_DOMAIN,
    SecretId: process.env.COS_SECRET_ID,
    SecretKey: process.env.COS_SECRET_KEY,
  });
  console.log(`Base directory: ${baseDir}`);
  console.log('Directory contents:');
  const dirContents = await fs.readdir(baseDir, { withFileTypes: true });
  for (const item of dirContents) {
    console.log(`  ${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`);
  }
  const files = await listFiles(
    baseDir,
    1,
    (file) =>
      file.endsWith('.dmg') ||
      file.endsWith('.exe') ||
      file.endsWith('.zip') ||
      file.endsWith('.deb') ||
      file.endsWith('.AppImage'),
  );
  console.log(`Found ${files.length} files to upload:`, files);
  if (files.length === 0) {
    throw new Error(`No release artifacts found in ${baseDir}`);
  }

  const uploadedFiles = [];
  for (const file of files) {
    const remotePath = `${REMOTE_PATH}${file}`;
    console.log(`Uploading ${file} -> ${remotePath}`);
    await cos.uploadFile({
      Bucket: process.env.COS_BUCKET,
      Region: process.env.COS_REGION,
      Key: remotePath,
      FilePath: path.join(baseDir, file),
    });
    uploadedFiles.push({ file, remotePath });
    console.log(`Uploaded. CDN url: ${toCdnUrl(remotePath)}`);
  }

  const versionIndex = buildVersionIndex(releaseVersion, uploadedFiles);
  await uploadVersionIndex(cos, versionIndex);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

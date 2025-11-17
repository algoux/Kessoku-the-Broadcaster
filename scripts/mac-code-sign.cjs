const { execSync } = require('child_process');
const path = require('path');

/**
 * electron-builder afterPack hook
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  try {
    const scriptPath = path.join(__dirname, 'mac-code-sign.sh');
    execSync(`"${scriptPath}" "${context.appOutDir}"`, {
      encoding: 'utf8',
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Mac code signing failed:', error.message);
    throw error;
  }
};

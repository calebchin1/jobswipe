const { withInfoPlist } = require('expo/config-plugins');
module.exports = (config) =>
  withInfoPlist(config, (mod) => {
    // The generic WebRTC plugin adds camera permission; round one deliberately removes it.
    delete mod.modResults.NSCameraUsageDescription;
    return mod;
  });

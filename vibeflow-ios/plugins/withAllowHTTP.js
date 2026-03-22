/**
 * Expo Config Plugin: Allow HTTP + Disable Network Inspector
 *
 * 1. Sets NSAllowsArbitraryLoads = true and NSAllowsLocalNetworking = true.
 *    Required because the iOS app connects to HTTP servers (local dev, frp tunnel).
 *
 * 2. Disables EX_DEV_CLIENT_NETWORK_INSPECTOR.
 *    Expo's network inspector registers a URLProtocol interceptor that proxies
 *    ALL HTTP/HTTPS requests through a debug layer. This causes fetch() and
 *    WebSocket connections to public IPs (e.g., via frp tunnel on non-standard
 *    ports) to fail silently, while Safari on the same device works fine.
 */
const { withInfoPlist, withPodfileProperties } = require('expo/config-plugins');

function withAllowHTTP(config) {
  // ATS overrides
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    };
    return mod;
  });

  // Disable Expo dev client network inspector
  config = withPodfileProperties(config, (mod) => {
    mod.modResults['EX_DEV_CLIENT_NETWORK_INSPECTOR'] = 'false';
    return mod;
  });

  return config;
}

module.exports = withAllowHTTP;

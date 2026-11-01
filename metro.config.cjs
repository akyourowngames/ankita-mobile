const { getDefaultConfig } = require('expo/metro-config');
const { createProviderProxy } = require('./server/provider-proxy.cjs');
const config = getDefaultConfig(__dirname);
const original = config.server.enhanceMiddleware;
const proxy = createProviderProxy();
config.server.enhanceMiddleware = (middleware, server) => {
  const fallback = original ? original(middleware, server) : middleware;
  return (req, res, next) => proxy(req, res, () => fallback(req, res, next));
};
module.exports = config;

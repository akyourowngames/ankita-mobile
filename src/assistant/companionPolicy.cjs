const config = require('../constants/companion.json');
const URL_ERROR = 'Use an HTTPS companion address. HTTP is allowed only on this computer.';
function companionURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(URL_ERROR); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !loopback) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error(URL_ERROR);
  return new URL(config.rootPath, url).href;
}
const RUN_ROUTE = /^\/runs\/[a-f\d-]+(?:\/approvals\/[a-f\d-]+)?$/;
const PAIR_ROUTE = /^\/pair\/[a-f\d-]+$/;
function companionTarget(value, method) {
  const url = new URL(value), root = companionURL(url.origin), path = url.pathname.slice(config.rootPath.length);
  if (!url.href.startsWith(root) || url.search && !/^\?after=\d+$/.test(url.search) || url.hash || url.username || url.password || !(['GET', 'POST', 'DELETE'].includes(method))) throw new Error(URL_ERROR);
  if (!(path === '/capabilities' && method === 'GET'
    || path === '/runs' && method === 'POST'
    || path === '/pair' && method === 'POST'
    || path === '/pair/revoke' && method === 'POST'
    || PAIR_ROUTE.test(path) && method === 'GET'
    || RUN_ROUTE.test(path) && (path.includes('/approvals/') ? method === 'POST' : ['GET', 'DELETE'].includes(method)))) throw new Error(URL_ERROR);
  return url;
}
module.exports = { companionURL, companionTarget, URL_ERROR };

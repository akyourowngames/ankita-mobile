const config = require('../constants/work.json');
const ERROR = 'Use an HTTPS worker address. HTTP is allowed only on this computer.';
function workerURL(value) {
  let url; try { url = new URL(value); } catch { throw new Error(ERROR); }
  if (!['https:', 'http:'].includes(url.protocol) || url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.hash || url.search || !['', '/'].includes(url.pathname)) throw new Error(ERROR);
  return new URL(config.rootPath, url).href;
}
function workerTarget(value, method) {
  const url = new URL(value), root = workerURL(url.origin), route = url.pathname.slice(config.rootPath.length);
  if (!url.href.startsWith(`${root}/`) || url.search || url.hash || url.username || url.password) throw new Error(ERROR);
  const allowed = route === '/capabilities' && method === 'GET' || route === '/jobs' && ['GET', 'POST'].includes(method) || /^\/jobs\/[\w-]{1,120}$/.test(route) && ['GET', 'DELETE'].includes(method) || /^\/jobs\/[\w-]{1,120}\/(resume|cancel)$/.test(route) && method === 'POST' || /^\/devices\/[\w-]{1,120}$/.test(route) && ['POST', 'DELETE'].includes(method);
  if (!allowed) throw new Error('Unsupported worker operation.');
  return url;
}
module.exports = { workerURL, workerTarget };

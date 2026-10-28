// ==UserScript==
// @name         Slack: keep threads unread
// @namespace    https://nadia.moe/
// @version      0.12
// @description  Stops the Threads view from marking threads as read when navigating. Ctrl+Alt+R toggles it.
// @match        https://*.slack.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  const MARK_PATH = '/api/subscriptions.thread.mark';
  const HARMLESS_PATH = '/api/api.test';
  const MARKER = '_userscript_mark';
  const TAG = '[keep-unread]';
  const DEBUG = false;
  let allowRead = false;

  const summarize = (body) =>
    Object.fromEntries(['channel', 'thread_ts', 'ts', 'read'].map((name) => [name, body.get(name)]));

  const shouldBlock = (url, body) => {
    if (DEBUG) console.log(TAG, 'xhr seen:', url.split('?')[0]);
    if (!url.includes(MARK_PATH)) return false;
    if (!(body instanceof FormData)) {
      console.log(TAG, `xhr: let through, body is ${body?.constructor?.name}`);
      return false;
    }
    const fields = summarize(body);
    if (body.has(MARKER)) {
      body.delete(MARKER);
      console.log(TAG, 'xhr: let through, marked', fields);
      return false;
    }
    if (allowRead || fields.read !== '1') {
      console.log(TAG, `xhr: let through, ${allowRead ? 'blocking is off' : 'not read=1'}`, fields);
      return false;
    }
    console.log(TAG, 'xhr: blocked', fields);
    return true;
  };

  console.log(TAG, `loaded at ${Math.round(performance.now())}ms, ${document.readyState}`);

  // The page's CSP blocks script injection, so patch through Firefox's sandbox bridge instead.
  if (typeof exportFunction !== 'function') {
    console.log(TAG, 'exportFunction is missing, cannot patch the page');
    return;
  }
  const page = window.wrappedJSObject ?? unsafeWindow;
  const xhrPrototype = page.XMLHttpRequest.prototype;
  const urls = new WeakMap();

  const originalOpen = xhrPrototype.open;
  xhrPrototype.open = exportFunction(function (method, url, ...rest) {
    urls.set(this, String(url));
    return originalOpen.call(this, method, url, ...rest);
  }, page);

  // A blocked request is pointed at a harmless endpoint, so Slack gets a real {"ok":true} back.
  const originalSend = xhrPrototype.send;
  xhrPrototype.send = exportFunction(function (body) {
    if (shouldBlock(urls.get(this) ?? '', body)) {
      originalOpen.call(this, 'POST', HARMLESS_PATH);
      return originalSend.call(this);
    }
    return originalSend.call(this, body);
  }, page);

  console.log(TAG, 'patched:', {
    open: xhrPrototype.open !== originalOpen,
    send: xhrPrototype.send !== originalSend,
    sandboxed: unsafeWindow !== window,
    unsafeWindowIsWrapped: unsafeWindow === window.wrappedJSObject,
    topFrame: window === window.top,
    frame: location.origin + location.pathname,
  });

  const toast = (text) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      'position:fixed;bottom:16px;left:16px;z-index:99999;padding:8px 12px;' +
      'border-radius:6px;background:#222;color:#fff;font:14px sans-serif';
    document.body.append(el);
    setTimeout(() => el.remove(), 2000);
  };

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'r') {
      allowRead = !allowRead;
      console.log(TAG, `toggle: marking read ${allowRead ? 'allowed' : 'blocked'}`);
      toast(allowRead ? 'Threads: marking read allowed' : 'Threads: marking read blocked');
    }
  });
})();

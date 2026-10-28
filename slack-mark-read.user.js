// ==UserScript==
// @name         Slack: r marks top unread group as read
// @namespace    https://nadia.moe/
// @version      0.2
// @updateURL    https://raw.githubusercontent.com/nadiamoe/slack-userscripts/main/slack-mark-read.user.js
// @downloadURL  https://raw.githubusercontent.com/nadiamoe/slack-userscripts/main/slack-mark-read.user.js
// @match        https://app.slack.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

window.addEventListener('keydown', (e) => {
  if (e.key !== 'r' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (e.target.isContentEditable || e.target.closest('input, textarea, select')) return;

  const button = document.querySelector(
    '[data-qa="all_unreads_header_mark_read"], [data-mark-thread-read]',
  );
  if (!button) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  button.click();
}, true);

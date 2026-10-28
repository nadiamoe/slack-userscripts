// ==UserScript==
// @name         Slack: r marks top unread group as read
// @match        https://app.slack.com/*
// @grant        none
// ==/UserScript==

document.addEventListener('keydown', (e) => {
  if (e.key !== 'r' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  if (e.target.isContentEditable || e.target.closest('input, textarea, select')) return;

  document.querySelector('[data-qa="all_unreads_header_mark_read"]')?.click();
}, true);

// ==UserScript==
// @name         Slack: mark thread as read
// @namespace    https://nadia.moe/
// @version      0.4
// @description  Adds a Mark as Read button to each thread in the Threads view.
// @match        https://*.slack.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  const MARK_URL = '/api/subscriptions.thread.mark';
  const MARKER = '_userscript_mark';
  const HEADING_ID = /^threads_view_heading-([A-Z0-9]+)-([\d.]+)$/;
  const BUTTON_ATTR = 'data-mark-thread-read';
  const LABEL = 'Mark as Read';
  const markedRead = new Map();

  const getToken = () => {
    const { teams } = JSON.parse(localStorage.localConfig_v2);
    const teamId = location.pathname.match(/\/client\/([A-Z0-9]+)/)?.[1];
    const team = teams[teamId] ?? (Object.keys(teams).length === 1 && Object.values(teams)[0]);
    if (!team?.token) throw new Error('no token for this team');
    return team.token;
  };

  const getLastReplyTs = (channel, threadTs) => {
    if (!document.getElementById(`threads_view_footer-${channel}-${threadTs}`)) return null;
    const prefix = `threads_view_${channel}-${threadTs}-`;
    return [...document.querySelectorAll(`[id^="${prefix}"]`)]
      .map((el) => el.id.slice(prefix.length))
      .sort()
      .at(-1);
  };

  const markRead = async (channel, threadTs, ts) => {
    const body = new FormData();
    const fields = {
      token: getToken(),
      channel,
      thread_ts: threadTs,
      ts,
      read: '1',
      _x_reason: 'marking-thread',
      _x_mode: 'online',
      _x_app_name: 'client',
      _x_sonic: 'true',
      [MARKER]: '1',
    };
    for (const [name, value] of Object.entries(fields)) {
      body.append(name, value);
    }
    const url = new URL(MARK_URL, location.origin);
    const response = await fetch(url, { method: 'POST', body, credentials: 'same-origin' });
    if (!(await response.json()).ok) throw new Error('slack said no');
  };

  const showStatus = (button, text) => {
    button.textContent = text;
    setTimeout(() => (button.textContent = LABEL), 2000);
  };

  const syncButtons = () =>
    document.querySelectorAll('[data-qa="threads_view_header"]').forEach(syncButton);

  const createButton = (channel, threadTs) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'c-button c-button--outline c-button--small';
    button.style.float = 'right';
    button.setAttribute(BUTTON_ATTR, '');
    button.textContent = LABEL;
    button.addEventListener('click', async () => {
      const ts = getLastReplyTs(channel, threadTs);
      if (!ts) return showStatus(button, 'Scroll to the end first');
      button.disabled = true;
      try {
        await markRead(channel, threadTs, ts);
        showStatus(button, 'Done');
        setTimeout(() => {
          markedRead.set(`${channel}-${threadTs}`, ts);
          syncButtons();
        }, 2000);
      } catch (error) {
        console.error('mark thread read failed:', error.message);
        showStatus(button, 'Failed');
      } finally {
        button.disabled = false;
      }
    });
    return button;
  };

  // Slack puts a "New" divider inside every thread that has unread replies.
  const getNewDividerTs = (channel, threadTs) => {
    const prefix = `threads_view_divider-${channel}-${threadTs}-`;
    return document.querySelector(`[id^="${prefix}"]`)?.id.slice(prefix.length);
  };

  const syncButton = (header) => {
    const heading = header.closest('[id^="threads_view_heading-"]');
    const [, channel, threadTs] = heading?.id.match(HEADING_ID) ?? [];
    if (!channel) return;

    const dividerTs = getNewDividerTs(channel, threadTs);
    const markedTs = markedRead.get(`${channel}-${threadTs}`);
    const unread = dividerTs && (!markedTs || dividerTs > markedTs);
    const button = header.querySelector(`[${BUTTON_ATTR}]`);
    if (!unread) button?.remove();
    else if (!button) header.prepend(createButton(channel, threadTs));
  };

  new MutationObserver(syncButtons).observe(document.body, { childList: true, subtree: true });
})();

// ==UserScript==
// @name         Slack: mark thread as read
// @namespace    https://nadia.moe/
// @version      0.5
// @description  Adds a Mark as Read button to each thread in the Threads view.
// @updateURL    https://raw.githubusercontent.com/nadiamoe/slack-userscripts/main/slack-mark-thread-read.user.js
// @downloadURL  https://raw.githubusercontent.com/nadiamoe/slack-userscripts/main/slack-mark-thread-read.user.js
// @match        https://*.slack.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  const MARK_URL = '/api/subscriptions.thread.mark';
  const HISTORY_URL = '/api/conversations.history';
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

  const callApi = async (path, fields) => {
    const body = new FormData();
    const common = { token: getToken(), _x_mode: 'online', _x_app_name: 'client', _x_sonic: 'true' };
    for (const [name, value] of Object.entries({ ...common, ...fields })) {
      body.append(name, value);
    }
    const url = new URL(path, location.origin);
    const response = await fetch(url, { method: 'POST', body, credentials: 'same-origin' });
    const json = await response.json();
    if (!json.ok) throw new Error(`slack said ${json.error}`);
    return json;
  };

  const getLastReplyTs = async (channel, threadTs) => {
    const { messages } = await callApi(HISTORY_URL, {
      channel,
      latest: threadTs,
      inclusive: 'true',
      limit: '1',
    });
    const lastReplyTs = messages[0]?.latest_reply;
    if (!lastReplyTs) throw new Error('no latest_reply on the thread parent');
    return lastReplyTs;
  };

  const markRead = (channel, threadTs, ts) =>
    callApi(MARK_URL, {
      channel,
      thread_ts: threadTs,
      ts,
      read: '1',
      _x_reason: 'marking-thread',
      [MARKER]: '1',
    });

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
      button.disabled = true;
      try {
        const ts = await getLastReplyTs(channel, threadTs);
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

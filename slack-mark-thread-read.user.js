// ==UserScript==
// @name         Slack: mark thread as read
// @namespace    https://nadia.moe/
// @version      0.6
// @description  Adds a Mark as Read button to each thread in the Threads view.
// @updateURL    https://raw.githubusercontent.com/nadiamoe/slack-userscripts/main/slack-mark-thread-read.user.js
// @downloadURL  https://raw.githubusercontent.com/nadiamoe/slack-userscripts/main/slack-mark-thread-read.user.js
// @match        https://*.slack.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  const MARK_URL = '/api/subscriptions.thread.mark';
  const REPLIES_URL = '/api/conversations.replies';
  const MARKER = '_userscript_mark';
  const HEADING_ID = /^threads_view_heading-([A-Z0-9]+)-([\d.]+)$/;
  const BUTTON_ATTR = 'data-mark-thread-read';
  const LABEL = 'Mark as Read';
  const UNKNOWN_LABEL = '❔ Mark as read';
  const STALE_MS = 15000;
  const threadStates = new Map();

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

  const fetchThreadState = async (channel, threadTs) => {
    const { messages } = await callApi(REPLIES_URL, {
      channel,
      ts: threadTs,
      inclusive: 'true',
      limit: '1',
    });
    const { latest_reply: latestReply, last_read: lastRead } = messages[0] ?? {};
    if (!latestReply) throw new Error('no latest_reply on the thread parent');
    return { latestReply, lastRead };
  };

  const setThreadState = (channel, threadTs, promise) =>
    threadStates.set(`${channel}-${threadTs}`, { promise, fetchedAt: Date.now() });

  const getThreadState = (channel, threadTs) => {
    const cached = threadStates.get(`${channel}-${threadTs}`);
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) return cached.promise;
    const promise = fetchThreadState(channel, threadTs);
    promise.catch((error) => console.error('thread state lookup failed:', error.message));
    setThreadState(channel, threadTs, promise);
    return promise;
  };

  const isUnread = ({ latestReply, lastRead }) => !lastRead || latestReply > lastRead;

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
    setTimeout(() => (button.textContent = button.dataset.label), 2000);
  };

  const syncButtons = () =>
    document.querySelectorAll('[data-qa="threads_view_header"]').forEach(syncButton);

  const createButton = (channel, threadTs, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'c-button c-button--outline c-button--small';
    button.style.float = 'right';
    button.setAttribute(BUTTON_ATTR, '');
    button.dataset.label = label;
    button.textContent = label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const { latestReply } = await fetchThreadState(channel, threadTs);
        await markRead(channel, threadTs, latestReply);
        setThreadState(channel, threadTs, Promise.resolve({ latestReply, lastRead: latestReply }));
        showStatus(button, 'Done');
        setTimeout(syncButtons, 2000);
      } catch (error) {
        console.error('mark thread read failed:', error.message);
        showStatus(button, 'Failed');
      } finally {
        button.disabled = false;
      }
    });
    return button;
  };

  const getButtonLabel = async (channel, threadTs) => {
    try {
      return isUnread(await getThreadState(channel, threadTs)) ? LABEL : null;
    } catch {
      return UNKNOWN_LABEL;
    }
  };

  const syncButton = async (header) => {
    const heading = header.closest('[id^="threads_view_heading-"]');
    const [, channel, threadTs] = heading?.id.match(HEADING_ID) ?? [];
    if (!channel) return;

    const label = await getButtonLabel(channel, threadTs);
    const button = header.querySelector(`[${BUTTON_ATTR}]`);
    if (!label) button?.remove();
    else if (!button) header.prepend(createButton(channel, threadTs, label));
    else if (button.dataset.label !== label) {
      if (button.textContent === button.dataset.label) button.textContent = label;
      button.dataset.label = label;
    }
  };

  new MutationObserver(syncButtons).observe(document.body, { childList: true, subtree: true });
})();

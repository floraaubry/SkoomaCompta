/* chat.js — shop-wide chat panel: toggle, history load, live push, unread badge. */

let chatOpen = false;
let chatUnread = 0;

function initChat() {
  document.getElementById('btn-chat-toggle').addEventListener('click', toggleChatPanel);
  document.getElementById('form-chat').addEventListener('submit', handleChatSubmit);
  ke.on('chat_message', handleIncomingChatMessage);
}

function toggleChatPanel() {
  if (chatOpen) closeChatPanel();
  else openChatPanel();
}

function openChatPanel() {
  chatOpen = true;
  document.getElementById('chat-panel').classList.add('open');
  chatUnread = 0;
  updateChatBadge();
  loadChatHistory();
}

function closeChatPanel() {
  chatOpen = false;
  document.getElementById('chat-panel').classList.remove('open');
}

function resetChatState() {
  chatOpen = false;
  chatUnread = 0;
  document.getElementById('chat-panel').classList.remove('open');
  document.getElementById('chat-messages').innerHTML = '';
  updateChatBadge();
}

async function loadChatHistory() {
  let messages;
  try {
    messages = await ke.request('list_chat_messages');
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  messages.forEach((m) => appendChatMessage(m, false));
  scrollChatToBottom();
}

function handleIncomingChatMessage(msg) {
  const message = msg.message;
  if (chatOpen) {
    appendChatMessage(message, true);
    scrollChatToBottom();
  } else {
    chatUnread += 1;
    updateChatBadge();
  }
}

function formatChatTimestamp(timestamp) {
  // Server sends "YYYY-MM-DD HH:MM" in UTC (see logic.now_iso()).
  const [datePart, timePart] = (timestamp || '').split(' ');
  if (!datePart || !timePart) return timestamp || '';
  if (datePart === new Date().toISOString().slice(0, 10)) return timePart;
  const [, month, day] = datePart.split('-');
  return `${day}/${month}`;
}

function appendChatMessage(message, animate) {
  const container = document.getElementById('chat-messages');
  const isOwn = !!(state.user && message.userId === state.user.id);
  const row = document.createElement('div');
  row.className = `chat-message${isOwn ? ' own' : ''}${animate ? ' chat-message-in' : ''}`;
  row.innerHTML = `
    <div class="chat-message-meta">${escapeHtml(message.userName)} &middot; ${escapeHtml(formatChatTimestamp(message.timestamp))}</div>
    <div class="chat-message-text"></div>`;
  row.querySelector('.chat-message-text').textContent = message.text;
  container.appendChild(row);
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function updateChatBadge() {
  const badge = document.getElementById('chat-unread-badge');
  badge.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
  badge.classList.toggle('hidden', chatOpen || chatUnread === 0);
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await ke.request('send_chat_message', { text });
  } catch (err) {
    toast(err.message, 'error');
  }
}

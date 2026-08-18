(() => {
  const list = document.querySelector('#personalNotificationList');
  const modal = document.querySelector('#personalNotificationModal');
  const form = document.querySelector('#personalNotificationForm');
  if (!list || !modal || !form) return;

  const account = sessionStorage.getItem('omniplayStaffCode') || 'guest';
  const storageKey = `omniplay-personal-notifications:${account}`;
  const timers = new Map();
  let items = readItems();

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const formatDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  };
  const toLocalInputValue = (value) => {
    const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  function readItems() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }
  const saveItems = () => localStorage.setItem(storageKey, JSON.stringify(items));

  function render() {
    const active = items.filter((item) => !item.completed);
    const completed = items.filter((item) => item.completed);
    const ordered = [...active, ...completed];
    const count = document.querySelector('#personalNotificationCount');
    if (count) {
      count.textContent = String(active.length);
      count.hidden = active.length === 0;
    }
    list.innerHTML = ordered.length ? ordered.map((item) => `
      <article class="personal-note color-${escapeHtml(item.color || 'yellow')} ${item.completed ? 'is-completed' : ''}" data-id="${escapeHtml(item.id)}">
        <div class="personal-note-topline">
          <span class="personal-note-kind">${item.type === 'alarm' ? '⏰ 鬧鐘' : '📝 便利貼'}</span>
          ${item.type === 'alarm' && item.remindAt ? `<time datetime="${escapeHtml(item.remindAt)}">${escapeHtml(formatDateTime(item.remindAt))}</time>` : ''}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.content ? `<p>${escapeHtml(item.content).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="personal-note-actions">
          <button type="button" data-action="toggle">${item.completed ? '↩ 恢復' : '✓ 完成'}</button>
          <button type="button" data-action="edit">✏️ 編輯</button>
          <button type="button" data-action="delete">🗑 刪除</button>
        </div>
      </article>
    `).join('') : '<p class="personal-notification-empty">目前沒有個人通知，按「新增」建立第一張便利貼。</p>';
    scheduleAlarms();
  }

  function openForm(item = null) {
    form.reset();
    document.querySelector('#personalNotificationId').value = item?.id || '';
    document.querySelector('#personalNotificationType').value = item?.type || 'note';
    document.querySelector('#personalNotificationTitleInput').value = item?.title || '';
    document.querySelector('#personalNotificationContent').value = item?.content || '';
    document.querySelector('#personalNotificationTime').value = toLocalInputValue(item?.remindAt);
    const color = form.querySelector(`[name="personalNotificationColor"][value="${item?.color || 'yellow'}"]`);
    if (color) color.checked = true;
    document.querySelector('#personalNotificationDialogTitle').textContent = item ? '編輯個人化通知' : '新增個人化通知';
    document.querySelector('#personalNotificationFormError').textContent = '';
    updateTypeFields();
    modal.hidden = false;
    requestAnimationFrame(() => document.querySelector('#personalNotificationTitleInput').focus());
  }
  const closeForm = () => { modal.hidden = true; };
  function updateTypeFields() {
    const alarm = document.querySelector('#personalNotificationType').value === 'alarm';
    document.querySelector('#personalNotificationTimeField').hidden = !alarm;
    document.querySelector('#personalNotificationTime').required = alarm;
  }

  function scheduleAlarms() {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    items.filter((item) => item.type === 'alarm' && !item.completed && item.remindAt && !item.firedAt).forEach((item) => {
      const delay = new Date(item.remindAt).getTime() - Date.now();
      if (delay < -86400000) return;
      const timer = window.setTimeout(() => fireAlarm(item.id), Math.max(0, Math.min(delay, 2147483647)));
      timers.set(item.id, timer);
    });
  }
  async function fireAlarm(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.completed || item.firedAt) return;
    item.firedAt = new Date().toISOString();
    saveItems();
    render();
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      oscillator.connect(gain); gain.connect(context.destination);
      gain.gain.setValueAtTime(.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + 1.2);
      oscillator.start(); oscillator.stop(context.currentTime + 1.2);
    } catch (_) {}
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`⏰ ${item.title}`, { body: item.content || '提醒時間到了', icon: 'assets/icon-192.png', tag: `personal-${item.id}` });
    }
    window.alert(`⏰ 個人提醒\n\n${item.title}${item.content ? `\n${item.content}` : ''}`);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.querySelector('#personalNotificationId').value;
    const type = document.querySelector('#personalNotificationType').value;
    const title = document.querySelector('#personalNotificationTitleInput').value.trim();
    const timeValue = document.querySelector('#personalNotificationTime').value;
    const error = document.querySelector('#personalNotificationFormError');
    if (!title) { error.textContent = '請輸入標題。'; return; }
    if (type === 'alarm' && (!timeValue || new Date(timeValue).getTime() <= Date.now())) {
      error.textContent = '鬧鐘時間必須晚於現在。'; return;
    }
    if (type === 'alarm' && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    const old = items.find((item) => item.id === id);
    const record = {
      id: id || (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      type,
      title,
      content: document.querySelector('#personalNotificationContent').value.trim(),
      remindAt: type === 'alarm' ? new Date(timeValue).toISOString() : '',
      color: form.querySelector('[name="personalNotificationColor"]:checked')?.value || 'yellow',
      completed: old?.completed || false,
      createdAt: old?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      firedAt: old?.remindAt === (type === 'alarm' ? new Date(timeValue).toISOString() : '') ? old?.firedAt || '' : ''
    };
    items = id ? items.map((item) => item.id === id ? record : item) : [record, ...items];
    saveItems(); render(); closeForm();
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    const card = button?.closest('[data-id]');
    if (!button || !card) return;
    const item = items.find((entry) => entry.id === card.dataset.id);
    if (!item) return;
    if (button.dataset.action === 'edit') return openForm(item);
    if (button.dataset.action === 'toggle') item.completed = !item.completed;
    if (button.dataset.action === 'delete') {
      if (!window.confirm(`確定刪除「${item.title}」？`)) return;
      items = items.filter((entry) => entry.id !== item.id);
    }
    saveItems(); render();
  });
  document.querySelector('#personalNotificationAdd').addEventListener('click', () => openForm());
  document.querySelector('#personalNotificationOpen').addEventListener('click', () => openForm());
  document.querySelector('#personalNotificationClose').addEventListener('click', closeForm);
  document.querySelector('#personalNotificationCancel').addEventListener('click', closeForm);
  document.querySelector('#personalNotificationType').addEventListener('change', updateTypeFields);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeForm(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeForm(); });
  render();
})();

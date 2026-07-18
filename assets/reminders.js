(() => {
  if (window.__csrRemindersLoaded) return;
  window.__csrRemindersLoaded = true;
  const textValue = (value) => String(value ?? '').trim() || '—';
  const dateValue = (value) => {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    if (!date || Number.isNaN(date.getTime())) return textValue(String(value || '').slice(0, 10));
    return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  };
  const detailText = (r, type) => {
    const shift = type === 'report' ? r.reporter : r.shift;
    const customer = type === 'report' ? r.field_1783792645702_pi66u : r.customer;
    const department = r.processing_department || r.department || (type === 'report' ? r.category : '');
    const description = r.issue || r.description || (type === 'report' ? (r.note || r.subject) : r.item) || '';
    return [`日期：${dateValue(r.date)}`, `班別：${textValue(shift)}`, `客戶：${textValue(customer)}`, `狀態：${textValue(r.status)}`, `編號：${textValue(r.serial)}`, `處理部門：${textValue(department)}`, `描述：${textValue(description)}`].join('\n');
  };
  const MODULES = {
    log: { title: '日誌提醒', path: 'work/log.html', text: (r) => detailText(r, 'log') },
    handover: { title: '交接提醒', path: 'work/handover.html', text: (r) => r.item || r.note || r.serial || '交接事項' },
    report: { title: '提報提醒', path: 'work/report.html', text: (r) => detailText(r, 'report') }
  };
  const ROOT = '/OMNIPLAY-CSR-Support/';
  const state = { timers: new Map(), ringing: null, audio: null };
  const db = window.omniplayDb;
  const moduleName = () => document.body.dataset.reminderModule || '';
  const toDate = (value) => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const firedKey = (module, id, at) => `csr-reminder-fired:${module}:${id}:${at.getTime()}`;
  const hasFired = (module, id, at) => localStorage.getItem(firedKey(module, id, at)) === '1';
  const markFired = (module, id, at) => localStorage.setItem(firedKey(module, id, at), '1');

  const placeReminderButton = () => {
    const button = document.querySelector('#enableReminderButton');
    const topbar = document.querySelector('.topbar');
    if (!button || !topbar) return;
    let actions = topbar.querySelector('.topbar-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'topbar-actions';
      topbar.appendChild(actions);
    }
    let controls = actions.querySelector(':scope > .topbar-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'topbar-controls';
      actions.prepend(controls);
    }
    const userPill = topbar.querySelector('.user-pill');
    if (userPill && userPill.parentElement !== actions) actions.appendChild(userPill);
    const designButton = [...topbar.querySelectorAll('#designTableButton, #designMeetingTableButton')]
      .find((item) => !item.hidden && getComputedStyle(item).display !== 'none');
    if (designButton && designButton.parentElement !== controls) controls.prepend(designButton);
    if (button.parentElement !== controls) controls.appendChild(button);
    if (designButton && designButton.nextElementSibling !== button) designButton.after(button);
    if (!designButton && controls.firstElementChild !== button) controls.prepend(button);
  };

  const ensureUi = () => {
    if (!document.querySelector('#csrReminderPositionStyles')) {
      const style = document.createElement('style');
      style.id = 'csrReminderPositionStyles';
      style.textContent = '.topbar-controls{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.topbar-controls .reminder-enable-button{white-space:nowrap}';
      document.head.appendChild(style);
    }
    if (!document.querySelector('#enableReminderButton')) {
      const button = document.createElement('button');
      button.id = 'enableReminderButton'; button.className = 'secondary reminder-enable-button'; button.type = 'button';
      button.textContent = ('Notification' in window && Notification.permission === 'granted') ? '🔔 提醒已啟用' : '🔕 啟用提醒';
      const actions = document.querySelector('.topbar-actions');
      if (actions) actions.prepend(button); else document.querySelector('.topbar .user-pill')?.before(button);
      button.addEventListener('click', enableNotifications);
    }
    placeReminderButton();
    if (!document.querySelector('#reminderAlarmModal')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="reminder-alarm" id="reminderAlarmModal" hidden><div class="reminder-alarm-card" role="alertdialog" aria-modal="true"><div class="reminder-alarm-icon">⏰</div><h2 id="reminderAlarmTitle">提醒時間到了</h2><p id="reminderAlarmText"></p><div class="reminder-alarm-actions"><button class="secondary" id="reminderSnoozeButton" type="button">稍後 5 分鐘</button><button class="primary" id="reminderStopButton" type="button">停止鈴聲</button></div></div></div>`);
      document.querySelector('#reminderStopButton').addEventListener('click', stopAlarm);
      document.querySelector('#reminderSnoozeButton').addEventListener('click', snoozeAlarm);
    }
  };
  const beep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      state.audio ||= new AudioContext();
      const oscillator = state.audio.createOscillator(); const gain = state.audio.createGain();
      oscillator.frequency.value = 880; oscillator.connect(gain); gain.connect(state.audio.destination);
      gain.gain.setValueAtTime(0.001, state.audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.22, state.audio.currentTime + 0.03); gain.gain.exponentialRampToValueAtTime(0.001, state.audio.currentTime + 0.7);
      oscillator.start(); oscillator.stop(state.audio.currentTime + 0.72);
    } catch (error) { console.warn('無法播放提醒音', error); }
  };
  function stopAlarm() {
    if (state.ringing?.interval) clearInterval(state.ringing.interval);
    state.ringing = null; const modal = document.querySelector('#reminderAlarmModal'); if (modal) modal.hidden = true;
  }
  function snoozeAlarm() {
    const current = state.ringing; stopAlarm();
    if (current) window.setTimeout(() => trigger(current.module, current.id, current.record, new Date()), 5 * 60 * 1000);
  }
  const trigger = async (module, id, record, at) => {
    if (state.ringing) stopAlarm();
    const config = MODULES[module]; const text = config.text(record); markFired(module, id, at); ensureUi();
    document.querySelector('#reminderAlarmTitle').textContent = config.title; document.querySelector('#reminderAlarmText').textContent = text; document.querySelector('#reminderAlarmModal').hidden = false;
    beep(); state.ringing = { module, id, record, interval: window.setInterval(beep, 1400) };
    if ('Notification' in window && Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker?.ready;
      registration?.showNotification(config.title, { body: text, icon: `${ROOT}assets/icon-192.png`, badge: `${ROOT}assets/icon-192.png`, tag: `csr-${module}-${id}`, requireInteraction: true, data: { url: `${ROOT}${config.path}?record=${encodeURIComponent(id)}` } });
    }
  };
  const schedule = (module, id, record) => {
    const at = toDate(record.reminder_at); const enabled = record.reminder_enabled !== false && record.reminder_enabled !== 'false';
    if (!enabled || !at || hasFired(module, id, at)) return;
    const key = `${module}:${id}`; clearTimeout(state.timers.get(key)); const delay = at.getTime() - Date.now();
    if (delay <= 0) { if (delay > -86400000) trigger(module, id, record, at); return; }
    state.timers.set(key, window.setTimeout(() => trigger(module, id, record, at), Math.min(delay, 2147483647)));
  };
  const watch = () => {
    if (!db) return;
    Object.keys(MODULES).forEach((module) => db.collection(module).onSnapshot((snapshot) => snapshot.docs.forEach((doc) => schedule(module, doc.id, doc.data()))));
  };
  async function enableNotifications() {
    if (!('Notification' in window)) return alert('此瀏覽器不支援通知');
    const permission = await Notification.requestPermission();
    document.querySelector('#enableReminderButton').textContent = permission === 'granted' ? '🔔 提醒已啟用' : '🔕 通知未允許';
    if (permission !== 'granted') return alert('請在瀏覽器網站設定中允許通知');
    try { const AudioContext = window.AudioContext || window.webkitAudioContext; state.audio ||= new AudioContext(); await state.audio.resume(); } catch (_) {}
    await registerPushToken();
  }
  const registerPushToken = async () => {
    if (!window.firebase?.messaging || !db) return;
    try {
      const config = await db.collection('settings').doc('reminders').get(); const vapidKey = config.data()?.vapidPublicKey;
      if (!vapidKey) return;
      const registration = await navigator.serviceWorker.ready;
      const token = await firebase.messaging().getToken({ vapidKey, serviceWorkerRegistration: registration });
      if (token) await db.collection('notification_tokens').doc(token).set({ token, module: moduleName(), updatedAt: firebase.firestore.FieldValue.serverTimestamp(), userAgent: navigator.userAgent }, { merge: true });
    } catch (error) { console.warn('背景推播尚未完成設定', error); }
  };
  const init = () => {
    ensureUi();
    const topbar = document.querySelector('.topbar');
    if (topbar) new MutationObserver(placeReminderButton).observe(topbar, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    window.addEventListener('permissionsready', placeReminderButton);
    window.setTimeout(placeReminderButton, 0);
    watch();
    if ('Notification' in window && Notification.permission === 'granted') registerPushToken();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

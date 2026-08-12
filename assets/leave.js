const leaveDb = window.omniplayDb;
const leaveStaffCollection = leaveDb?.collection('staff');
const leaveCollection = leaveDb?.collection('leave');

const monthLabel = document.querySelector('#leaveMonthLabel');
const prevMonthButton = document.querySelector('#prevLeaveMonth');
const nextMonthButton = document.querySelector('#nextLeaveMonth');
const todayMonthButton = document.querySelector('#todayLeaveMonth');
const leaveTable = document.querySelector('#leaveTable');
const leaveTableHead = document.querySelector('#leaveTableHead');
const leaveTableBody = document.querySelector('#leaveTableBody');
const leaveStatus = document.querySelector('#leaveStatus');
const leaveLegend = document.querySelector('#leaveLegend');
const globalQuotaInput = document.querySelector('#globalLeaveQuota');
const phoneDutySummary = document.querySelector('#phoneDutySummary');
const flexibleLeaveSummary = document.querySelector('#flexibleLeaveSummary');
const specialModeButtons = document.querySelectorAll('.special-mode-button');

const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
const taiwanHolidays = {
  2026: {
    '02-14': '農曆春節',
    '02-15': '農曆春節',
    '02-16': '農曆春節',
    '02-17': '農曆春節',
    '02-18': '農曆春節',
    '02-19': '農曆春節',
    '02-20': '農曆春節',
    '02-21': '農曆春節',
    '02-22': '農曆春節',
    '02-27': '228 和平紀念日',
    '02-28': '228 和平紀念日',
    '03-01': '228 和平紀念日',
    '04-03': '兒童節＋清明節',
    '04-04': '兒童節＋清明節',
    '04-05': '兒童節＋清明節',
    '04-06': '兒童節＋清明節',
    '05-01': '勞動節',
    '05-02': '勞動節',
    '05-03': '勞動節',
    '06-19': '端午節',
    '06-20': '端午節',
    '06-21': '端午節',
    '09-25': '中秋＋教師節',
    '09-26': '中秋＋教師節',
    '09-27': '中秋＋教師節',
    '09-28': '中秋＋教師節',
    '10-09': '國慶日',
    '10-10': '國慶日',
    '10-11': '國慶日',
    '10-24': '光復節',
    '10-25': '光復節',
    '10-26': '光復節',
    '12-25': '行憲紀念日',
    '12-26': '行憲紀念日',
    '12-27': '行憲紀念日'
  }
};

let currentMonth = new Date();
currentMonth.setDate(1);
let staffList = [];
let leaveData = { records: {}, quotas: {}, shifts: {}, quota: 8 };
let externalLeaveData = {};
let externalMaxDays = null;
let externalLeaveLoadToken = 0;
let shiftLoadToken = 0;
let unsubscribeStaff = null;
let unsubscribeLeave = null;
let activeSpecialMode = null;
let saveTimer = null;
const storedLeavePermission = () => window.getPagePermission?.('leave') || { view: false, edit: false, delete: false, design: false };
let canEditLeave = Boolean(window.isOmniplayAdmin?.());

const pad = (value) => String(value).padStart(2, '0');
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const dayKey = (day) => String(day);
const dateKey = (date, day) => `${monthKey(date)}-${pad(day)}`;
const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const setStatus = (message, type = 'info') => {
  if (!leaveStatus) return;
  leaveStatus.textContent = message;
  leaveStatus.dataset.type = type;
  leaveStatus.hidden = !message || type !== 'error';
};

const normalizeStaff = (doc) => ({ id: doc.id, ...doc.data() });
const leaveStaffNames = ['余中魁', '宋佳臻', '鄭晴心', '郭澄希', '熊茗雅'];
const leaveStaffAliases = {
  '余中魁': '余中魁', '中魁': '余中魁',
  '宋佳臻': '宋佳臻', '佳臻': '宋佳臻',
  '鄭晴心': '鄭晴心', '晴心': '鄭晴心',
  '郭澄希': '郭澄希', '澄希': '郭澄希',
  '熊茗雅': '熊茗雅', '茗雅': '熊茗雅'
};
const canonicalLeaveStaffName = (name = '') => leaveStaffAliases[String(name).trim()] || String(name).trim();
const fixedStaffOrderMap = leaveStaffNames.reduce((map, name, index) => ({ ...map, [name]: index + 1 }), {});
const activeStaff = (staff) => (staff.status || '啟用') === '啟用';
const isSystemAdminStaff = (staff) => ['id', 'code', 'name'].some((field) => String(staff[field] || '').trim().toUpperCase() === 'OMNIPLAY');
const visibleLeaveStaff = (staff) => activeStaff(staff) &&
  !isSystemAdminStaff(staff) &&
  staff.leaveVisible !== false &&
  leaveStaffNames.includes(canonicalLeaveStaffName(staff.name));
const fixedLeaveStaffList = (items = []) => leaveStaffNames.map((name) => {
  const matched = items.find((staff) => canonicalLeaveStaffName(staff.name) === name);
  return matched
    ? { ...matched, name }
    : { id: `external_leave_${name}`, name, status: '啟用', leaveVisible: true, externalOnly: true };
});
const getStaffSortOrder = (staff) => Number(fixedStaffOrderMap[canonicalLeaveStaffName(staff.name)] ?? staff.sortOrder ?? 999);
const externalPersonFor = (name) => {
  const canonicalName = canonicalLeaveStaffName(name);
  const matchedName = Object.keys(externalLeaveData || {}).find((candidate) => canonicalLeaveStaffName(candidate) === canonicalName);
  return matchedName ? externalLeaveData[matchedName] : null;
};
const normalizeExternalDayRecord = (record = {}) => {
  const rawLabel = String(record.label || record.mark || record.symbol || '').trim();
  const specials = new Set(Array.isArray(record.specials) ? record.specials : []);
  if (rawLabel === '★' || rawLabel === '☆' || ['star', 'event', 'company_activity'].includes(rawLabel.toLowerCase())) specials.add('event');
  return {
    ...record,
    label: ['★', '☆'].includes(rawLabel) ? '' : rawLabel,
    specials: [...specials]
  };
};
const normalizeExternalPerson = (person = {}) => ({
  ...person,
  days: Object.fromEntries(Object.entries(person.days || {}).map(([day, record]) => [day, normalizeExternalDayRecord(record)]))
});
const normalizeShift = (value) => value === '晚班' ? '晚' : value === '早班' ? '早' : value;
const shiftDocId = (staffId, date = currentMonth) => `${staffId}_${monthKey(date)}`;
const previousMonthOf = (date) => new Date(date.getFullYear(), date.getMonth() - 1, 1);
const getStaffShift = (staff) => normalizeShift(externalPersonFor(staff.name)?.shift || leaveData.shifts?.[staff.id] || '早');
const sortStaffForLeave = (items) => [...items].sort((a, b) => {
  const shiftCompare = (getStaffShift(a) === '晚' ? 1 : 0) - (getStaffShift(b) === '晚' ? 1 : 0);
  if (shiftCompare) return shiftCompare;
  const orderCompare = getStaffSortOrder(a) - getStaffSortOrder(b);
  if (orderCompare) return orderCompare;
  return String(a.name || a.code || '').localeCompare(String(b.name || b.code || ''), 'zh-Hant');
});

const getHolidayName = (day) => {
  const key = `${pad(currentMonth.getMonth() + 1)}-${pad(day)}`;
  return taiwanHolidays[currentMonth.getFullYear()]?.[key] || '';
};

const fixedPhoneAssignments = {
  '2026-08': {
    '宋佳臻': [4, 6, 12, 17, 29],
    '熊茗雅': [5, 13, 16, 18, 22, 23]
  }
};
const externalRecordFor = (name, day) => externalPersonFor(name)?.days?.[dayKey(day)] || {};
const isWorkingRecord = (record) => !record?.type && !record?.label && (!Array.isArray(record?.specials) || record.specials.length === 0);
const isWorkingForFlexible = (record) => {
  if (isWorkingRecord(record)) return true;
  if (Array.isArray(record?.specials) && record.specials.length) return false;
  const match = String(record?.label || '').trim().match(/(\d+(?:\.\d+)?)\s*(?:小時|H|HR)?$/i);
  const hours = Number(match?.[1]);
  return Number.isFinite(hours) && hours > 0 && hours < 8;
};
const phoneDutyPartners = {
  '宋佳臻': '熊茗雅',
  '熊茗雅': '宋佳臻',
  '鄭晴心': '郭澄希',
  '郭澄希': '鄭晴心'
};
const canPairForPhone = (name, day) => {
  name = canonicalLeaveStaffName(name);
  const partner = phoneDutyPartners[name];
  return Boolean(partner) &&
    isWorkingRecord(externalRecordFor(name, day)) &&
    isWorkingRecord(externalRecordFor(partner, day));
};
const hasExternalPhoneDuty = (name, day) => {
  name = canonicalLeaveStaffName(name);
  const targetMonth = monthKey(currentMonth);
  const fixedDays = fixedPhoneAssignments[targetMonth]?.[name];
  if (Array.isArray(fixedDays)) {
    return fixedDays.includes(day) && canPairForPhone(name, day);
  }
  if (!['鄭晴心', '郭澄希'].includes(name)) return false;
  const eligibleDays = Array.from({ length: daysInMonth(currentMonth) }, (_, index) => index + 1).filter((candidateDay) =>
    isWorkingRecord(externalRecordFor('鄭晴心', candidateDay)) &&
    isWorkingRecord(externalRecordFor('郭澄希', candidateDay))
  );
  const dutyIndex = eligibleDays.indexOf(day);
  return dutyIndex >= 0 && (dutyIndex % 2 === 0 ? name === '鄭晴心' : name === '郭澄希');
};
const savedRecordFor = (name, day) => {
  const canonicalName = canonicalLeaveStaffName(name);
  const staff = staffList.find((item) => canonicalLeaveStaffName(item.name) === canonicalName);
  return staff ? leaveData.records?.[`${staff.id}_${dayKey(day)}`] || {} : {};
};
const hasPhoneDuty = (name, day) => {
  name = canonicalLeaveStaffName(name);
  const override = savedRecordFor(name, day).phoneOverride;
  if (typeof override === 'boolean') return override && Boolean(phoneDutyPartners[name]);
  return canPairForPhone(name, day) && hasExternalPhoneDuty(name, day);
};

const summaryDaysFor = (staff, mode) => Array.from({ length: daysInMonth(currentMonth) }, (_, index) => index + 1).filter((day) => {
  if (mode === 'phone') return hasPhoneDuty(staff.name, day);
  const partner = phoneDutyPartners[canonicalLeaveStaffName(staff.name)];
  if (!partner || !isWorkingForFlexible(externalRecordFor(staff.name, day))) return false;
  if (!hasPhoneDuty(partner, day)) return false;
  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
  return !(getStaffShift(staff) === '早' && date.getDay() === 3);
});
const renderSummaryGroup = (shift, mode) => {
  const rows = staffList
    .filter((staff) => getStaffShift(staff) === shift && canonicalLeaveStaffName(staff.name) !== '余中魁')
    .map((staff) => {
      const days = summaryDaysFor(staff, mode);
      return `<li><strong>${escapeHtml(canonicalLeaveStaffName(staff.name))}：</strong>${days.length ? days.join('、') : '—'}</li>`;
    }).join('');
  return `<div class="leave-summary-shift"><strong>${shift === '早' ? '早班' : '晚班'}：</strong><ul>${rows}</ul></div>`;
};
const renderMonthlySummaries = () => {
  if (phoneDutySummary) phoneDutySummary.innerHTML = renderSummaryGroup('早', 'phone') + renderSummaryGroup('晚', 'phone');
  if (flexibleLeaveSummary) flexibleLeaveSummary.innerHTML = renderSummaryGroup('早', 'flexible') + renderSummaryGroup('晚', 'flexible');
};

const getRecord = (staffId, day) => {
  const staff = staffList.find((item) => item.id === staffId);
  const externalPerson = staff ? externalPersonFor(staff.name) : null;
  if (externalPerson) {
    const externalRecord = externalPerson.days?.[dayKey(day)] || {};
    const specials = Array.isArray(externalRecord.specials) ? [...externalRecord.specials] : [];
    if (hasPhoneDuty(staff.name, day) && !specials.includes('phone')) specials.push('phone');
    return {
      ...externalRecord,
      type: externalRecord.type || '',
      specials
    };
  }
  const record = leaveData.records?.[`${staffId}_${dayKey(day)}`] || {};
  return { ...record, type: record.type || '', specials: record.specials || [] };
};
const getGlobalQuota = () => externalMaxDays !== null ? externalMaxDays : Number(leaveData.quota ?? 8);
const getQuota = () => getGlobalQuota();
const editableAttribute = () => canEditLeave ? '' : ' disabled';
const getShift = (staff) => getStaffShift(staff);
const leaveCount = (staffId) => Array.from({ length: daysInMonth(currentMonth) }, (_, index) => getRecord(staffId, index + 1)).filter((record) => ['leave', 'required'].includes(record?.type) && !record?.label).length;

const loadExternalLeave = async () => {
  const token = ++externalLeaveLoadToken;
  const targetMonth = monthKey(currentMonth);
  // 2026-08-12 假表資料源切換(中魁拍板):優先走公司後端代理 /api/ext/leave(上游=尚堉假表
  // 61.216.37.15:8080,輸出合約與舊 worker 逐格一致);失敗時 fallback 舊 Cloudflare worker,
  // 讓 GitHub Pages 部署與後端故障時行為不變。
  const apiBase = (window.CSR_API_BASE || '').replace(/\/+$/, '');
  const sources = [
    `${apiBase}/api/ext/leave?month=${encodeURIComponent(targetMonth)}&t=${Date.now()}`,
    `https://omniplay-leave-sync.omniplaycsr168168.workers.dev/?month=${encodeURIComponent(targetMonth)}&t=${Date.now()}`
  ];
  try {
    let payload = null;
    let lastError = null;
    for (const url of sources) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json();
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!payload) throw lastError || new Error('假表來源皆無回應');
    if (token !== externalLeaveLoadToken || payload.month !== targetMonth) return;
    externalLeaveData = Object.fromEntries(Object.entries(payload.people || {})
      .filter(([name]) => leaveStaffNames.includes(canonicalLeaveStaffName(name)))
      .map(([name, person]) => [name, normalizeExternalPerson(person)])
    );
    const maxDays = Number(payload.maxDays);
    externalMaxDays = Number.isFinite(maxDays) && maxDays >= 0 ? maxDays : null;
    staffList = sortStaffForLeave(staffList);
    render();
  } catch (error) {
    if (token !== externalLeaveLoadToken) return;
    externalLeaveData = {};
    externalMaxDays = null;
    console.error('同步外部假表失敗：', error);
    setStatus('外部假表暫時無法同步，現在顯示 OMNIPLAY 原有資料。', 'error');
    render();
  }
};

const queueSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveMonthData, 280);
};

const saveMonthData = async () => {
  if (!leaveCollection) return setStatus('Firebase 尚未完成初始化，無法儲存休假表。', 'error');
  try {
    await leaveCollection.doc(monthKey(currentMonth)).set({
      month: monthKey(currentMonth),
      records: leaveData.records || {},
      quota: getGlobalQuota(),
      quotas: leaveData.quotas || {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setStatus('已自動儲存休假表。', 'success');
  } catch (error) {
    console.error('儲存休假表失敗：', error);
    setStatus('儲存休假表失敗，請稍後再試。', 'error');
  }
};

const renderHeader = () => {
  const totalDays = daysInMonth(currentMonth);
  const dayHeaders = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const weekend = [0, 6].includes(date.getDay());
    const holiday = getHolidayName(day);
    return `<th class="day-col ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''}" title="${escapeHtml(holiday)}"><span>${day}</span><small>${weekdayNames[date.getDay()]}${holiday ? `<br>${escapeHtml(holiday)}` : ''}</small></th>`;
  }).join('');
  leaveTableHead.innerHTML = `<tr><th class="sticky-col name-col">姓名 / 班別</th>${dayHeaders}</tr>`;
};

const renderBody = () => {
  const totalDays = daysInMonth(currentMonth);
  const rows = staffList.map((staff) => {
    const used = leaveCount(staff.id);
    const quota = getQuota();
    const overQuota = used > quota;
    const cells = Array.from({ length: totalDays }, (_, index) => renderDayCell(staff, index + 1)).join('');
    return `<tr data-staff-id="${staff.id}" class="${overQuota ? 'is-over-quota' : ''}">
      <th class="sticky-col name-col" scope="row">
        <span>${escapeHtml(canonicalLeaveStaffName(staff.name) || staff.code || '未命名')} / ${escapeHtml(getShift(staff))}</span>
        <small class="quota-count ${overQuota ? 'is-warning' : ''}">已休 ${used}</small>
      </th>${cells}</tr>`;
  }).join('');

  leaveTableBody.innerHTML = rows;
};

const renderDayCell = (staff, day) => {
  const record = getRecord(staff.id, day);
  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
  const weekend = [0, 6].includes(date.getDay());
  const holiday = getHolidayName(day);
  const marker = record.label ? '' : record.type === 'required' ? '<span class="leave-marker is-required">▲</span>' : record.type === 'leave' ? '<span class="leave-marker">▲</span>' : '';
  const leaveLabel = record.label ? `<span class="external-leave-label">${escapeHtml(record.label)}</span>` : '';
  const specials = (record.specials || []).map((item) => item === 'phone' ? '📱' : '🎰').join('');
  return `<td class="leave-day ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''}" data-staff-id="${staff.id}" data-day="${day}" title="${escapeHtml(holiday)}">
    <button type="button" class="leave-cell-button" data-action="toggle-leave" aria-label="${escapeHtml(canonicalLeaveStaffName(staff.name))} ${day} 號休假狀態"${editableAttribute()}>${marker}${leaveLabel}<span class="special-icons">${specials}</span></button>
  </td>`;
};

const render = () => {
  monthLabel.textContent = `${currentMonth.getFullYear()} 年 ${currentMonth.getMonth() + 1} 月`;
  if (globalQuotaInput) {
    globalQuotaInput.value = getGlobalQuota();
    globalQuotaInput.disabled = externalMaxDays !== null || !canEditLeave;
  }
  renderHeader();
  renderBody();
  renderMonthlySummaries();
};

const loadMonthlyShifts = async () => {
  if (!leaveCollection) return;
  const token = ++shiftLoadToken;
  const targetMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const previousMonth = previousMonthOf(targetMonth);

  try {
    const previousMonthDoc = await leaveCollection.doc(monthKey(previousMonth)).get();
    const previousLegacyShifts = previousMonthDoc.exists ? previousMonthDoc.data()?.shifts || {} : {};
    const shiftEntries = await Promise.all(staffList.map(async (staff) => {
      const [currentDoc, previousDoc] = await Promise.all([
        leaveCollection.doc(shiftDocId(staff.id, targetMonth)).get(),
        leaveCollection.doc(shiftDocId(staff.id, previousMonth)).get()
      ]);
      const currentShift = currentDoc.exists ? currentDoc.data()?.shift : undefined;
      const previousShift = previousDoc.exists ? previousDoc.data()?.shift : undefined;
      const legacyCurrentShift = leaveData.shifts?.[staff.id];
      const legacyPreviousShift = previousLegacyShifts?.[staff.id];
      const fallbackShift = previousShift || legacyPreviousShift || staff.shift || '早';
      return [staff.id, normalizeShift(currentShift || legacyCurrentShift || fallbackShift) || '早'];
    }));

    if (token !== shiftLoadToken) return;
    leaveData.shifts = Object.fromEntries(shiftEntries);
    staffList = sortStaffForLeave(staffList);
    render();
    setStatus('', 'success');
  } catch (error) {
    if (token !== shiftLoadToken) return;
    console.error('讀取班別設定失敗：', error);
    setStatus('讀取班別設定失敗，請稍後再試。', 'error');
  }
};

const subscribeMonth = () => {
  unsubscribeLeave?.();
  if (!leaveCollection) return;
  setStatus('載入休假表資料中...', 'info');
  externalLeaveData = {};
  externalMaxDays = null;
  loadExternalLeave();
  unsubscribeLeave = leaveCollection.doc(monthKey(currentMonth)).onSnapshot((doc) => {
    leaveData = doc.exists ? { records: {}, quotas: {}, shifts: {}, quota: 8, ...doc.data() } : { records: {}, quotas: {}, shifts: {}, quota: 8 };
    staffList = sortStaffForLeave(staffList);
    render();
    loadMonthlyShifts();
  }, (error) => {
    console.error('讀取休假表失敗：', error);
    setStatus('讀取休假表失敗，請稍後再試。', 'error');
  });
};

const changeMonth = (offset) => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  setSpecialMode(null);
  subscribeMonth();
};

const toggleLeave = (staffId, day) => {
  const key = `${staffId}_${dayKey(day)}`;
  leaveData.records ||= {};
  const record = getRecord(staffId, day);
  const currentType = record.type || '';
  const nextType = currentType === '' ? 'leave' : currentType === 'leave' ? 'required' : '';
  leaveData.records[key] = { ...record, type: nextType };
  if (!nextType && !(record.specials || []).length) delete leaveData.records[key];
  const staff = staffList.find((item) => item.id === staffId);
  if (leaveCount(staffId) > getQuota()) alert(`${staff?.name || '此人員'} 已超過當月可休天數！`);
  render();
  queueSave();
};

const setSpecialMode = (mode) => {
  activeSpecialMode = activeSpecialMode === mode ? null : mode;
  if (!mode) activeSpecialMode = null;
  specialModeButtons.forEach((button) => {
    const isActive = button.dataset.special === activeSpecialMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  leaveTable?.classList.toggle('is-special-mode', Boolean(activeSpecialMode));
};

const toggleSpecial = (staffId, day, specialType) => {
  const numericDay = Number(day);
  const key = `${staffId}_${dayKey(day)}`;
  leaveData.records ||= {};
  const staff = staffList.find((item) => item.id === staffId);
  if (specialType === 'phone' && staff && externalPersonFor(staff.name)) {
    const currentlyAssigned = hasPhoneDuty(staff.name, numericDay);
    const canonicalName = canonicalLeaveStaffName(staff.name);
    if (!currentlyAssigned && !phoneDutyPartners[canonicalName]) {
      alert('此人員不在 📱 值公務機的配對名單中。');
      return;
    }
    const savedRecord = leaveData.records[key] || {};
    leaveData.records[key] = { ...savedRecord, phoneOverride: !currentlyAssigned };
    if (!currentlyAssigned) {
      const partnerName = phoneDutyPartners[canonicalName];
      const partnerStaff = staffList.find((item) => canonicalLeaveStaffName(item.name) === partnerName);
      if (partnerStaff) {
        const partnerKey = `${partnerStaff.id}_${dayKey(day)}`;
        const partnerRecord = leaveData.records[partnerKey] || {};
        leaveData.records[partnerKey] = { ...partnerRecord, phoneOverride: false };
      }
    }
    render();
    queueSave();
    return;
  }
  const record = getRecord(staffId, day);
  const specials = new Set(record.specials || []);
  specials.has(specialType) ? specials.delete(specialType) : specials.add(specialType);
  const nextSpecials = [...specials];
  leaveData.records[key] = { ...record, specials: nextSpecials };
  if (!record.type && !nextSpecials.length) delete leaveData.records[key];
  render();
  queueSave();
};

leaveTableBody?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const cell = button.closest('.leave-day');
  if (!cell) return;
  if (!canEditLeave) return;
  if (activeSpecialMode) {
    toggleSpecial(cell.dataset.staffId, cell.dataset.day, activeSpecialMode);
    return;
  }
  if (button.dataset.action === 'toggle-leave') toggleLeave(cell.dataset.staffId, cell.dataset.day);
});

const handleQuotaInput = (event) => {
  const target = event.target;
  if (!canEditLeave || target.dataset.action !== 'quota') return;
  updateGlobalQuota(target.value);
};

globalQuotaInput?.addEventListener('input', handleQuotaInput);

leaveTableBody?.addEventListener('change', (event) => {
  const target = event.target;
  const row = target.closest('tr[data-staff-id]');
  if (!row) return;
  if (!canEditLeave) return;
  if (target.dataset.action === 'shift') {
    leaveData.shifts ||= {};
    leaveData.shifts[row.dataset.staffId] = target.value;
    leaveCollection?.doc(shiftDocId(row.dataset.staffId)).set({
      staffId: row.dataset.staffId,
      month: monthKey(currentMonth),
      shift: target.value,
      type: 'staffShift',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch((error) => {
      console.error('更新班別失敗：', error);
      setStatus('更新班別失敗，請稍後再試。', 'error');
    });
  }
  staffList = sortStaffForLeave(staffList);
  render();
  queueSave();
});


prevMonthButton?.addEventListener('click', () => changeMonth(-1));
nextMonthButton?.addEventListener('click', () => changeMonth(1));
todayMonthButton?.addEventListener('click', () => { currentMonth = new Date(); currentMonth.setDate(1); setSpecialMode(null); subscribeMonth(); });
specialModeButtons.forEach((button) => {
  button.disabled = !canEditLeave;
  button.addEventListener('click', () => { if (canEditLeave) setSpecialMode(button.dataset.special); });
});

const updateGlobalQuota = (value) => {
  if (!canEditLeave) return;
  leaveData.quota = Number(value || 0);
  const exceededStaff = staffList.find((staff) => leaveCount(staff.id) > getQuota());
  if (exceededStaff) alert('已休天數超過當月全員可休天數！');
  render();
  queueSave();
};

if (!leaveDb) {
  setStatus('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。', 'error');
} else {
  unsubscribeStaff = leaveStaffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
    staffList = sortStaffForLeave(fixedLeaveStaffList(snapshot.docs.map(normalizeStaff).filter(visibleLeaveStaff)));
    render();
    loadMonthlyShifts();
  }, (error) => {
    console.error('讀取人員資料失敗：', error);
    setStatus('讀取人員資料失敗，請稍後再試。', 'error');
  });
  subscribeMonth();
}

window.addEventListener('beforeunload', () => {
  unsubscribeStaff?.();
  unsubscribeLeave?.();
});

const syncLeavePermission = async () => {
  if (window.permissionReady) await window.permissionReady;
  canEditLeave = Boolean(window.isOmniplayAdmin?.() || storedLeavePermission().edit === true);
  specialModeButtons.forEach((button) => { button.disabled = !canEditLeave; });
  if (!canEditLeave) setSpecialMode(null);
  render();
};
syncLeavePermission();

window.setInterval(loadExternalLeave, 60 * 1000);
window.addEventListener('focus', loadExternalLeave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadExternalLeave();
});

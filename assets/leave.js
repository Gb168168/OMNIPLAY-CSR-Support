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
const leaveSourceStatus = document.querySelector('#leaveSourceStatus');
const leaveSyncTime = document.querySelector('#leaveSyncTime');
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
// 2026-10-05 中魁:公司休假系統「本月公告」標「補薪」的日期(例:10/10 國慶日 補薪、10/25 光復節 補薪),
// 由後端鏡射 /api/ext/leave 的 payMakeupDays 提供。null=無法確認(還沒載入 / 讀不到 / 沒給)→ 彈性早退暫停;
// Set=確定(空的=確定這個月沒有)。⛔ 不可把「不知道」當成「沒有」。
let externalPayMakeupDays = null;
// 這個月的假表讀取狀態:loading=還在讀(不秀「無法確認」);success / error=讀完了(補薪日還是 null 就秀警告)。
let externalLeaveLoadState = 'loading';
let externalMaxDays = null;
let externalLeaveLoadToken = 0;
let shiftLoadToken = 0;
let unsubscribeStaff = null;
let unsubscribeLeave = null;
let activeSpecialMode = null;
let saveTimer = null;
let leaveSavePending = false;   // 2026-10-07 FRIDAY C1:有排隊中的整份存檔
let leaveSaveInFlight = 0;      // 2026-10-07 FRIDAY C1:正在送出的存檔數
let leaveMonthLoaded = false;    // 2026-10-07 FRIDAY B1:目前月份的資料載入了沒(還沒載入前的點擊不存,避免舊月份資料寫進新月份)
let pendingSaveMonth = '';       // 2026-10-07 FRIDAY B1:排隊存檔當下的月份(第二道保險)
let leaveSnapshotMissed = false; // 2026-10-07 FRIDAY P1-1:存檔期間跳過了一份伺服器資料 → 存完要主動重抓
let lastSuccessfulLeaveSyncAt = null;
let nextLeaveSyncAt = Date.now() + 5 * 60 * 1000;
const LEAVE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const storedLeavePermission = () => window.getPagePermission?.('leave') || { view: false, edit: false, delete: false, design: false };
let canEditLeave = Boolean(window.isOmniplayAdmin?.());

const pad = (value) => String(value).padStart(2, '0');
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const dayKey = (day) => String(day);
const dateKey = (date, day) => `${monthKey(date)}-${pad(day)}`;
const isTodayDay = (day) => {
  const today = new Date();
  return currentMonth.getFullYear() === today.getFullYear() &&
    currentMonth.getMonth() === today.getMonth() &&
    Number(day) === today.getDate();
};
const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
// 2026-10-06 GPT release gate:補薪日只要有任何一天不是「該月真的存在的日期」(非整數、<1、超過當月天數,
// 例 4/31、2/30),就整月當「無法確認」(null)→ 彈性早退暫停並顯示警告(fail-closed)。
// 不可默默丟掉那一天:那通常代表公告打錯字,真正該擋的那天反而沒被擋。
// 回傳 Set(確定;空的=確定沒有)或 null(無法確認)。monthKeyText = 'YYYY-MM'。
const parsePayMakeupDays = (raw, monthKeyText) => {
  if (!Array.isArray(raw)) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKeyText || ''));
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null; // GPT 第 2 輪 P1:2026-13、2026-00 不是月份
  const lastDay = new Date(Number(match[1]), Number(match[2]), 0).getDate();
  const days = raw.map((value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value));
  if (!days.every((day) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= lastDay)) return null;
  return new Set(days);
};
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const setStatus = (message, type = 'info') => {
  if (!leaveStatus) return;
  leaveStatus.textContent = message;
  leaveStatus.dataset.type = type;
  leaveStatus.hidden = !message || type !== 'error';
};

const formatLeaveSyncTime = (value) => new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false
}).format(value);
const formatLeaveSyncCountdown = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
let leaveSyncFailed = false;
const renderLeaveSyncCountdown = () => {
  if (!leaveSyncTime) return;
  const label = leaveSyncTime.querySelector('span');
  const value = leaveSyncTime.querySelector('strong');
  const remaining = Math.max(0, nextLeaveSyncAt - Date.now());
  leaveSyncTime.classList.toggle('is-error', leaveSyncFailed);
  if (label) label.textContent = leaveSyncFailed ? '同步失敗｜每 5 分鐘自動重試' : '每 5 分鐘自動更新';
  if (value) value.textContent = `${leaveSyncFailed ? '下次重試' : '下次更新'} ${formatLeaveSyncCountdown(remaining)}`;
  leaveSyncTime.title = lastSuccessfulLeaveSyncAt
    ? `最後成功同步：${formatLeaveSyncTime(lastSuccessfulLeaveSyncAt)}`
    : '尚未成功同步';
};
const setLeaveSyncTime = (date, failed = false) => {
  if (!failed && date) lastSuccessfulLeaveSyncAt = date;
  leaveSyncFailed = failed;
  nextLeaveSyncAt = Date.now() + LEAVE_SYNC_INTERVAL_MS;
  renderLeaveSyncCountdown();
};

const normalizeStaff = (doc) => ({ id: doc.id, ...doc.data() });
// ⛔ 死規則(2026-08-13 中魁):休假表僅顯示客服四人;排班資料唯一來源=/api/ext/leave 鏡射(見 AGENTS.md 規則 9)。
const leaveStaffNames = ['宋佳臻', '鄭晴心', '郭澄希', '熊茗雅'];
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
// 休假表固定顯示五人，不等待已移除或無權限的人員管理資料。
staffList = fixedLeaveStaffList();
const getStaffSortOrder = (staff) => Number(fixedStaffOrderMap[canonicalLeaveStaffName(staff.name)] ?? staff.sortOrder ?? 999);
const externalPersonFor = (name) => {
  const canonicalName = canonicalLeaveStaffName(name);
  const matchedName = Object.keys(externalLeaveData || {}).find((candidate) => canonicalLeaveStaffName(candidate) === canonicalName);
  return matchedName ? externalLeaveData[matchedName] : null;
};
const normalizeExternalDayRecord = (record = {}) => {
  const baseRecord = record && typeof record === 'object' && !Array.isArray(record) ? record : { value: record };
  const rawValues = [...new Set([
    baseRecord.label,
    baseRecord.mark,
    baseRecord.symbol,
    baseRecord.value,
    baseRecord.text,
    baseRecord.display,
    baseRecord.displayValue,
    baseRecord.raw,
    baseRecord.rawValue,
    baseRecord.leaveLabel,
    baseRecord.leaveType,
    baseRecord.leave_type,
    baseRecord.note,
    baseRecord.remark,
    baseRecord.status,
    baseRecord.type
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
  const externalSymbol = rawValues.map((value) => value.match(/[★☆⭐]/)?.[0] || '').find(Boolean) || '';
  const isCompanyEvent = Boolean(externalSymbol) || rawValues.some((value) => /^(?:star|event|company[_ -]?activity)$/i.test(value) || /(公司活動|部門旅遊)/.test(value));
  const mappedType = rawValues.some((value) => /^(?:required|required_leave|must_leave|必休)$/i.test(value))
    ? 'required'
    : rawValues.some((value) => /^(?:leave|休假)$/i.test(value))
      ? 'leave'
      : '';
  const specials = new Set((Array.isArray(baseRecord.specials) ? baseRecord.specials : [])
    .map((item) => /^(?:star|event|company[_ -]?activity)$/i.test(String(item || '').trim()) ? 'event' : item));
  if (isCompanyEvent) specials.add('event');
  const rawLabel = rawValues.find((value) =>
    !/[★☆⭐]/.test(value) &&
    !/^(?:star|event|company[_ -]?activity|leave|required|required_leave|must_leave|休假|必休)$/i.test(value)
  ) || '';
  return {
    ...baseRecord,
    type: isCompanyEvent ? '' : (mappedType || baseRecord.type || ''),
    // Preserve the source's detailed leave value instead of collapsing it to a triangle.
    label: isCompanyEvent ? '' : rawLabel,
    externalSymbol: isCompanyEvent ? (externalSymbol || '★') : '',
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
const phoneDutyPairs = [
  { key: 'early', members: ['宋佳臻', '熊茗雅'] },
  { key: 'late', members: ['鄭晴心', '郭澄希'] }
];
const phoneOverrideKey = (pair, day) => `${pair.key}_${dayKey(day)}`;
const phonePairForName = (name) => phoneDutyPairs.find((pair) => pair.members.includes(canonicalLeaveStaffName(name)));
const isPhoneDutyDayEligible = (pair, day) =>
  pair.members.every((name) => isWorkingRecord(externalRecordFor(name, day)));
const buildPhoneDutyPlan = () => {
  const plan = new Map(phoneDutyPairs.flatMap((pair) => pair.members.map((name) => [name, new Set()])));
  phoneDutyPairs.forEach((pair) => {
    const counts = Object.fromEntries(pair.members.map((name) => [name, 0]));
    for (let day = 1; day <= daysInMonth(currentMonth); day += 1) {
      const key = phoneOverrideKey(pair, day);
      const hasOverride = Object.prototype.hasOwnProperty.call(leaveData.phoneOverrides || {}, key);
      const override = hasOverride ? leaveData.phoneOverrides[key] : undefined;
      if (override === '') continue;
      // 公司活動、休假、必休或其他非正常上班狀態時，連既有手動指派也必須失效。
      if (!isPhoneDutyDayEligible(pair, day)) continue;
      if (pair.members.includes(override)) {
        plan.get(override).add(day);
        counts[override] += 1;
        continue;
      }
      const selected = [...pair.members].sort((a, b) => counts[a] - counts[b] || pair.members.indexOf(a) - pair.members.indexOf(b))[0];
      plan.get(selected).add(day);
      counts[selected] += 1;
    }
  });
  return plan;
};
const hasPhoneDuty = (name, day) =>
  buildPhoneDutyPlan().get(canonicalLeaveStaffName(name))?.has(Number(day)) === true;

// 2026-10-05 中魁拍板:公告標示「補薪」的日期=補薪日,早晚班全員不得彈性早退。
// 來源=後端鏡射 /api/ext/leave 的 payMakeupDays(公司休假系統「本月公告」):
//   [日期…]=確定有、[]=確定沒有、null 或沒有這個欄位=無法確認 → 該月彈性早退整個暫停(寧可不給,不可錯給)。
// ⛔ 不要再從請假格子找「補薪」字樣:實測全年格子都沒有這兩字(10/05 移除)。
const payMakeupUnknown = () => externalPayMakeupDays === null;
const isPayMakeupDay = (day) => externalPayMakeupDays !== null && externalPayMakeupDays.has(Number(day));
// 彈性早退的禁止規則(誰都一樣):星期三早班、補薪日、補薪日無法確認
const flexibleBanned = (staff, day) => {
  // 星期三僅早班不可彈性早退;晚班不受星期三限制。(中魁 2026-10-05 確認維持)
  const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
  if (getStaffShift(staff) === '早' && date.getDay() === 3) return true;
  // 公告標示「補薪」的日期:早晚班皆不得彈性早退;補薪日無法確認時整月暫停。
  if (payMakeupUnknown()) return true;
  return isPayMakeupDay(day);
};
// 原本的規則:自己上班 + 搭檔值公務機 + 沒有被禁止
const baseFlexibleDay = (staff, day) => {
  const partner = phoneDutyPartners[canonicalLeaveStaffName(staff.name)];
  if (!partner || !isWorkingForFlexible(externalRecordFor(staff.name, day))) return false;
  if (!hasPhoneDuty(partner, day)) return false;
  return !flexibleBanned(staff, day);
};
// 2026-10-06 中魁:彈性早退「讓」—— 值機不變,只把某天的彈性早退讓給同組另一人(例:郭澄希 26 號讓給鄭晴心)
//   存在 leaveData.flexibleOverrides[組別_日期] = 接收的人;只有「那天原本屬於對方」而且「接收的人當天能早退」才生效,
//   否則照原規則(對方日後請假等,讓的設定自動失效,不會變成兩個人都沒有或都有)
const staffByName = (name) => staffList.find((item) => canonicalLeaveStaffName(item.name) === name);
const canReceiveFlexible = (staff, day) => Boolean(staff) && isWorkingForFlexible(externalRecordFor(staff.name, day)) && !flexibleBanned(staff, day);
const effectiveFlexibleYield = (name, day) => {
  const pair = phonePairForName(name);
  if (!pair) return null;
  const target = (leaveData.flexibleOverrides || {})[phoneOverrideKey(pair, day)];
  if (!pair.members.includes(target)) return null;
  const giver = pair.members.find((member) => member !== target);
  const giverStaff = staffByName(giver);
  if (!giverStaff || !baseFlexibleDay(giverStaff, day) || !canReceiveFlexible(staffByName(target), day)) return null;
  return { giver, target };
};
const summaryDaysFor = (staff, mode) => Array.from({ length: daysInMonth(currentMonth) }, (_, index) => index + 1).filter((day) => {
  if (mode === 'phone') return hasPhoneDuty(staff.name, day);
  const yieldInfo = effectiveFlexibleYield(canonicalLeaveStaffName(staff.name), day);
  if (yieldInfo) return yieldInfo.target === canonicalLeaveStaffName(staff.name);
  return baseFlexibleDay(staff, day);
});
const renderSummaryGroup = (shift, mode) => {
  const rows = staffList
    .filter((staff) => getStaffShift(staff) === shift && canonicalLeaveStaffName(staff.name) !== '余中魁')
    .map((staff) => {
      const days = summaryDaysFor(staff, mode);
      // 2026-10-06 中魁:值公務機在人員後方加「共 N 次」
      //   N = 自己一個人上班的天數(自己整天上班、搭檔沒有整天上班 → 公務機自己顧)+ 兩人都上班且排到自己值機的天數(days)
      //   整天上班 = isWorkingRecord(跟值機排班的資格判斷同一套)
      //   10 月核對(中魁確認):宋佳臻 12+2=14、熊茗雅 11+6=17、鄭晴心 13+4=17、郭澄希 10+4=14
      let total = '';
      if (mode === 'phone') {
        const me = canonicalLeaveStaffName(staff.name);
        const partner = phonePairForName(me)?.members.find((name) => name !== me);
        const soloDays = partner ? Array.from({ length: daysInMonth(currentMonth) }, (_, index) => index + 1)
          .filter((day) => isWorkingRecord(externalRecordFor(me, day)) && !isWorkingRecord(externalRecordFor(partner, day))).length : 0;
        // (2026-10-06 中魁:只要卡片上的一行說明,不要滑鼠移上去看明細 → 拿掉 title 提示)
        total = `<span class="leave-summary-total">（共 ${soloDays + days.length} 次）</span>`;
      }
      // 2026-10-06 中魁:彈性早退被「讓」到的日期標「(讓)」
      const shown = mode === 'flexible'
        ? days.map((day) => (effectiveFlexibleYield(canonicalLeaveStaffName(staff.name), day)?.target === canonicalLeaveStaffName(staff.name) ? `${day}(讓)` : day))
        : days;
      return `<li><strong>${escapeHtml(canonicalLeaveStaffName(staff.name))}：</strong>${shown.length ? shown.join('、') : '—'}${total}</li>`;
    }).join('');
  return `<div class="leave-summary-shift"><strong>${shift === '早' ? '早班' : '晚班'}：</strong><ul>${rows}</ul></div>`;
};
const renderMonthlySummaries = () => {
  if (phoneDutySummary) phoneDutySummary.innerHTML = renderSummaryGroup('早', 'phone') + renderSummaryGroup('晚', 'phone');
  if (flexibleLeaveSummary) flexibleLeaveSummary.innerHTML = renderSummaryGroup('早', 'flexible') + renderSummaryGroup('晚', 'flexible');
  // 2026-10-05 中魁:補薪日秀在「彈性早退」卡片標題下(沒有補薪日就不顯示)
  const payMakeupNote = document.getElementById('payMakeupNote');
  if (payMakeupNote) {
    const month = currentMonth.getMonth() + 1;
    const days = Array.from({ length: daysInMonth(currentMonth) }, (_, index) => index + 1).filter((day) => isPayMakeupDay(day));
    // 讀完了(成功或失敗)但補薪日無法確認 → 一定要秀警告;還在讀就先不秀。
    if (payMakeupUnknown() && externalLeaveLoadState !== 'loading') {
      payMakeupNote.textContent = '⚠️ 補薪日暫時無法確認，彈性早退先暫停顯示';
      payMakeupNote.hidden = false;
    } else {
      payMakeupNote.textContent = days.length ? `本月補薪日：${days.map((day) => `${month}/${day}`).join('、')}（早晚班皆不可彈性早退）` : '';
      payMakeupNote.hidden = !days.length;
    }
  }
};

const getRecord = (staffId, day) => {
  const staff = staffList.find((item) => item.id === staffId);
  const isCompanyLinkedStaff = Boolean(staff) &&
    leaveStaffNames.includes(canonicalLeaveStaffName(staff.name));

  // Company-linked staff use /api/ext/leave as the only source of truth.
  // Never fall back to Firebase records while switching months or after sync.
  if (isCompanyLinkedStaff) {
    const externalPerson = externalPersonFor(staff.name);
    const externalRecord = externalPerson?.days?.[dayKey(day)] || {};
    const specials = (Array.isArray(externalRecord.specials) ? externalRecord.specials : [])
      .filter((item) => item !== 'phone');
    if (externalPerson && hasPhoneDuty(staff.name, day)) specials.push('phone');
    return {
      ...externalRecord,
      type: externalRecord.type || '',
      label: String(externalRecord.label || '').trim(),
      externalSymbol: externalRecord.externalSymbol || '',
      specials
    };
  }

  const localRecord = leaveData.records?.[`${staffId}_${dayKey(day)}`] || {};
  return { ...localRecord, type: localRecord.type || '', specials: localRecord.specials || [] };
};
const getGlobalQuota = () => externalMaxDays;
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
  // ⛔ 死規則(2026-08-13 中魁):假表資料源只有兩個——①/api/ext/leave(公司排班鏡射=唯一真相)
  // ②舊 worker(僅故障備援)。禁止新增任何其他來源(Apps Script/Google Sheet/JSONP/寫死資料)、禁止調換順序。
  const sources = [
    { url: `${apiBase}/api/ext/leave?month=${encodeURIComponent(targetMonth)}&t=${Date.now()}` },
    { url: `https://omniplay-leave-sync.omniplaycsr168168.workers.dev/?month=${encodeURIComponent(targetMonth)}&t=${Date.now()}` }
  ];
  try {
    const validPayloads = [];
    let primaryPayload = null; // 主來源(後端鏡射)的回應;補薪日只認它
    let lastError = null;
    for (const source of sources) {
      try {
        const response = await fetch(source.url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const candidate = await response.json();
        if (candidate?.success === false) throw new Error(candidate.error || '同步來源回傳失敗');
        const payloadPeople = candidate?.people;
        const hasValidPeople = payloadPeople &&
          typeof payloadPeople === 'object' &&
          !Array.isArray(payloadPeople) &&
          Object.keys(payloadPeople).some((name) => leaveStaffNames.includes(canonicalLeaveStaffName(name)));
        if (candidate?.month !== targetMonth || !hasValidPeople) {
          throw new Error('同步來源不是指定月份的休假人員資料');
        }
        validPayloads.push(candidate);
        if (source === sources[0]) primaryPayload = candidate;
      } catch (error) {
        lastError = error;
      }
    }
    let payload = validPayloads[0] || null;
    if (validPayloads.length > 1) {
      const primary = validPayloads[0];
      const fallback = validPayloads[1];
      const mergedPeople = { ...(primary.people || {}) };

      // Both endpoints mirror the same company leave system. The primary proxy
      // can omit stars or detailed labels, so enrich each cell with the complete
      // fallback record instead of choosing one whole payload.
      Object.entries(fallback.people || {}).forEach(([fallbackName, fallbackPerson]) => {
        const primaryName = Object.keys(mergedPeople)
          .find((name) => canonicalLeaveStaffName(name) === canonicalLeaveStaffName(fallbackName));
        const targetName = primaryName || fallbackName;
        const primaryPerson = mergedPeople[targetName] || {};
        const mergedDays = { ...(primaryPerson.days || {}) };

        Object.entries(fallbackPerson?.days || {}).forEach(([day, fallbackRecord = {}]) => {
          const primaryRecord = mergedDays[day] || {};
          const specials = [...new Set([
            ...(Array.isArray(primaryRecord.specials) ? primaryRecord.specials : []),
            ...(Array.isArray(fallbackRecord.specials) ? fallbackRecord.specials : [])
          ])];
          const isCompanyEvent = specials.includes('event');
          mergedDays[day] = {
            ...fallbackRecord,
            ...primaryRecord,
            type: isCompanyEvent ? (fallbackRecord.type || '') : (primaryRecord.type || fallbackRecord.type || ''),
            label: primaryRecord.label || fallbackRecord.label || '',
            externalSymbol: primaryRecord.externalSymbol || fallbackRecord.externalSymbol || '',
            specials
          };
        });

        mergedPeople[targetName] = {
          ...fallbackPerson,
          ...primaryPerson,
          shift: primaryPerson.shift || fallbackPerson.shift || '',
          days: mergedDays
        };
      });

      const primaryMaxDays = Number(primary.maxDays);
      const fallbackMaxDays = Number(fallback.maxDays);
      payload = {
        ...fallback,
        ...primary,
        maxDays: Number.isFinite(primaryMaxDays) ? primaryMaxDays : fallbackMaxDays,
        people: mergedPeople
      };
    }
    if (!payload) throw lastError || new Error('假表來源皆無回應');
    if (token !== externalLeaveLoadToken || payload.month !== targetMonth) return;
    // 補薪日只認主來源(後端鏡射);備援沒有這項資訊,也不可跨來源合併 → 主來源沒給 = 無法確認(null)。
    // 2026-10-06:任何一天不存在(例 4/31)→ 整月無法確認,不再只濾 1~31(GPT release gate R3)
    externalPayMakeupDays = parsePayMakeupDays(primaryPayload?.payMakeupDays, targetMonth);
    externalLeaveLoadState = 'success';
    externalLeaveData = Object.fromEntries(Object.entries(payload.people || {})
      .filter(([name]) => leaveStaffNames.includes(canonicalLeaveStaffName(name)))
      .map(([name, person]) => [name, normalizeExternalPerson(person)])
    );
    const maxDays = Number(payload.maxDays);
    externalMaxDays = Number.isFinite(maxDays) && maxDays >= 0 ? maxDays : null;
    setLeaveSyncTime(new Date(), false);
    if (leaveSourceStatus) {
      leaveSourceStatus.textContent = externalMaxDays === null
        ? '已連動休假資料，但缺少可休天數'
        : '● 已連動公司休假系統';
    }
    staffList = sortStaffForLeave(staffList);
    render();
  } catch (error) {
    if (token !== externalLeaveLoadToken) return;
    externalLeaveData = {};
    externalPayMakeupDays = null;
    externalLeaveLoadState = 'error';
    externalMaxDays = null;
    console.error('同步外部假表失敗：', error);
    setLeaveSyncTime(lastSuccessfulLeaveSyncAt, true);
    if (leaveSourceStatus) leaveSourceStatus.textContent = '● 公司休假系統連動失敗';
    setStatus('公司休假系統暫時無法同步，未使用預設休假或可休天數。', 'error');
    render();
  }
};

const queueSave = () => {
  if (!leaveMonthLoaded) {
    setStatus('這個月份的資料還在載入,剛剛的修改沒有存,載入完成後請再點一次。', 'error');
    return;   // 新月份資料到了會整份換掉 leaveData,剛剛的本機修改自然消失
  }
  clearTimeout(saveTimer);
  pendingSaveMonth = monthKey(currentMonth);
  leaveSavePending = true;
  saveTimer = setTimeout(saveMonthData, 280);
};

// FRIDAY 10/06 C2:「讓」只更新 flexibleOverrides 這一個欄位,不整份覆蓋文件;
//   文件還不存在時 update 會失敗 → 改走原本的整份存檔。⚠️ 開著舊版頁面的人之後若整份存檔仍會洗掉「讓」→ 上線時請有編輯權的人 Ctrl+F5
// 2026-10-07 batch3(休假表改走後端):後端的部分更新不支援「刪除」標記 ⇒ 取消時寫 null(effectiveFlexibleYield 把非組員的值當沒設定)。
//   FRIDAY P1-2:用點路徑只寫「這一天」這一個鍵,不整個 flexibleOverrides 覆蓋(兩人 15 秒內各改不同天不會互蓋)。Firebase 與後端都支援點路徑。
const saveFlexibleOverride = async (key, value) => {
  if (!leaveCollection) return setStatus('Firebase 尚未完成初始化，無法儲存休假表。', 'error');
  if (!leaveMonthLoaded) return setStatus('這個月份的資料還在載入,剛剛的修改沒有存,載入完成後請再點一次。', 'error');
  const savingMonth = monthKey(currentMonth);
  leaveSaveInFlight += 1;
  try {
    await leaveCollection.doc(savingMonth).update({
      [`flexibleOverrides.${key}`]: value || null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (value) setStatus(`已把 ${key.split('_')[1]} 號的彈性早退讓給 ${value}。`, 'success');
  } catch (error) {
    console.warn('單一欄位儲存失敗,改用整份存檔:', error);
    // FRIDAY 複查建議 2:已經切到別的月份 → 不能用整份存檔補(會存成別的月份),明確告訴使用者沒存成功
    if (savingMonth !== monthKey(currentMonth)) setStatus(`${savingMonth} 的彈性早退讓渡沒有存成功,請回到那個月份再設定一次。`, 'error');
    else queueSave();
  } finally {
    leaveSaveInFlight -= 1;
    resyncIfMissed();
  }
};

const saveMonthData = async () => {
  leaveSavePending = false;
  if (!leaveCollection) return setStatus('Firebase 尚未完成初始化，無法儲存休假表。', 'error');
  const key = monthKey(currentMonth);
  // FRIDAY B1 第二道保險:排隊時的月份跟現在不同 → 不存(正常流程 flushPendingSave 已先送出,不會走到這)
  if (pendingSaveMonth && pendingSaveMonth !== key) {
    console.warn(`排隊存檔的月份 ${pendingSaveMonth} 跟目前 ${key} 不同,放棄這次存檔`);
    return;
  }
  leaveSaveInFlight += 1;
  try {
    // 存「當下的副本」:送出途中使用者再點,不會混進這一次
    await leaveCollection.doc(key).set({
      month: key,
      records: { ...(leaveData.records || {}) },
      quotas: { ...(leaveData.quotas || {}) },
      phoneOverrides: { ...(leaveData.phoneOverrides || {}) },
      flexibleOverrides: { ...(leaveData.flexibleOverrides || {}) }, // 2026-10-06 彈性早退「讓」
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    setStatus('已自動儲存休假表。', 'success');
  } catch (error) {
    console.error('儲存休假表失敗：', error);
    setStatus('儲存休假表失敗，請稍後再試。', 'error');
  } finally {
    leaveSaveInFlight -= 1;
    resyncIfMissed();
  }
};

// 2026-10-07 FRIDAY B1:切換月份前,把排隊中的存檔**用舊月份立刻送出**(否則 280ms 後會用新月份的 key 把舊月份資料寫進去)。
//   saveMonthData 在第一個 await 之前就同步取好 month key 與資料,所以要在改 currentMonth 之前呼叫
const flushPendingSave = () => {
  if (!leaveSavePending) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  saveMonthData();
};

// 2026-10-07 FRIDAY P1-1:輪詢在存檔期間被跳過的那份資料不會再送一次 → 存檔都結束後主動重抓目前月份
const applyLeaveDoc = (doc) => {
  leaveMonthLoaded = true;
  leaveData = doc.exists ? { records: {}, quotas: {}, shifts: {}, phoneOverrides: {}, flexibleOverrides: {}, ...doc.data() } : { records: {}, quotas: {}, shifts: {}, phoneOverrides: {}, flexibleOverrides: {} };
  staffList = sortStaffForLeave(staffList);
  render();
  loadMonthlyShifts();
};
const resyncIfMissed = () => {
  if (!leaveSnapshotMissed || leaveSavePending || leaveSaveInFlight > 0 || !leaveCollection) return;
  leaveSnapshotMissed = false;
  const key = monthKey(currentMonth);
  leaveCollection.doc(key).get().then((doc) => {
    if (key !== monthKey(currentMonth) || leaveSavePending || leaveSaveInFlight > 0) { leaveSnapshotMissed = true; return; }
    applyLeaveDoc(doc);
  }).catch((error) => {
    // FRIDAY 複查 P1-A:被跳過的那份資料輪詢不會再送一次 → 重抓失敗不能就此放棄(否則這個月永遠「載入中」、不能存),3 秒後再試
    console.warn('存檔後重抓休假表失敗,3 秒後重試:', error);
    leaveSnapshotMissed = true;
    setTimeout(resyncIfMissed, 3000);
  });
};

const renderHeader = () => {
  const totalDays = daysInMonth(currentMonth);
  const dayHeaders = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const weekend = [0, 6].includes(date.getDay());
    const holiday = getHolidayName(day);
    // 2026-10-05 中魁:補薪日秀在表頭(跟擋彈性早退同一個判斷)
    const payMakeup = isPayMakeupDay(day);
    const headerTitle = [holiday, payMakeup ? '補薪日(早晚班皆不可彈性早退)' : ''].filter(Boolean).join(' / ');
    return `<th class="day-col ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''} ${payMakeup ? 'is-pay-makeup' : ''} ${isTodayDay(day) ? 'is-today' : ''}" aria-current="${isTodayDay(day) ? 'date' : 'false'}" title="${escapeHtml(headerTitle)}"><span>${day}</span><small>${weekdayNames[date.getDay()]}${holiday ? `<br>${escapeHtml(holiday)}` : ''}${payMakeup ? '<br><b class="pay-makeup-tag">補薪</b>' : ''}</small></th>`;
  }).join('');
  // 2026-10-06 中魁:比照公司休假系統(尚堉假表),每人最後加「已排」欄
  leaveTableHead.innerHTML = `<tr><th class="sticky-col name-col">姓名 / 班別</th>${dayHeaders}<th class="leave-scheduled-col" title="當月休假 + 必休天數(不含調、補、公司活動)">已排</th></tr>`;
};

const renderBody = () => {
  const totalDays = daysInMonth(currentMonth);
  const rows = staffList.map((staff) => {
    const used = leaveCount(staff.id);
    const quota = getQuota();
    const overQuota = Number.isFinite(quota) && used > quota;
    const cells = Array.from({ length: totalDays }, (_, index) => renderDayCell(staff, index + 1)).join('');
    return `<tr data-staff-id="${staff.id}" class="${overQuota ? 'is-over-quota' : ''}">
      <th class="sticky-col name-col" scope="row">
        <span>${escapeHtml(canonicalLeaveStaffName(staff.name) || staff.code || '未命名')} / ${escapeHtml(getShift(staff))}</span>
      </th>${cells}<td class="leave-scheduled-col">${used}</td></tr>`;
    // ↑ 已排 = leaveCount:休假 + 必休、沒有額外標註(調 / 補(天)等不算)、公司活動不算;
    //   公司連動人員讀 /api/ext/leave(尚堉假表),10 月核對 4 人都是 10,與尚堉「已排」一致(中魁 10/06)
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
  const specials = (record.specials || []).map((item) => item === 'phone' ? '值機' : item === 'event' ? '公司活動' : '').join('、');
  return `<td class="leave-day ${weekend ? 'is-weekend' : ''} ${holiday ? 'is-holiday' : ''} ${isTodayDay(day) ? 'is-today' : ''}" data-staff-id="${staff.id}" data-day="${day}" title="${escapeHtml(holiday)}">
    <button type="button" class="leave-cell-button" data-action="toggle-leave" aria-label="${escapeHtml(canonicalLeaveStaffName(staff.name))} ${day} 號休假狀態"${editableAttribute()}>${marker}${leaveLabel}<span class="special-icons">${specials}</span></button>
  </td>`;
};

const render = () => {
  monthLabel.textContent = `${currentMonth.getFullYear()} 年 ${currentMonth.getMonth() + 1} 月`;
  if (globalQuotaInput) {
    globalQuotaInput.value = Number.isFinite(getGlobalQuota()) ? getGlobalQuota() : '';
    globalQuotaInput.disabled = true;
    globalQuotaInput.title = Number.isFinite(getGlobalQuota()) ? '可休天數由公司休假系統同步' : '公司休假系統未提供可休天數';
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
  leaveMonthLoaded = false;      // FRIDAY B1:新月份資料到之前不准存
  leaveSnapshotMissed = false;
  setStatus('載入休假表資料中...', 'info');
  externalLeaveData = {};
  externalPayMakeupDays = null;
  externalLeaveLoadState = 'loading';
  externalMaxDays = null;
  loadExternalLeave();
  unsubscribeLeave = leaveCollection.doc(monthKey(currentMonth)).onSnapshot((doc) => {
    // 2026-10-07 FRIDAY C1:改走後端後「即時更新」變成每 15 秒輪詢。自己還有排隊中 / 存檔中的修改時,
    //   先不要用伺服器版本整份換掉 leaveData(否則剛點的那一格會被蓋回去);存完後下一輪輪詢自然會拿到最新版
    if (leaveSavePending || leaveSaveInFlight > 0) { leaveSnapshotMissed = true; return; }
    leaveSnapshotMissed = false;
    applyLeaveDoc(doc);
  }, (error) => {
    console.error('讀取休假表失敗：', error);
    setStatus('讀取休假表失敗，請稍後再試。', 'error');
  });
};

const changeMonth = (offset) => {
  flushPendingSave();   // FRIDAY B1:一定要在改 currentMonth 之前
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  setSpecialMode(null);
  subscribeMonth();
};

const toggleLeave = (staffId, day) => {
  const staff = staffList.find((item) => item.id === staffId);
  if (staff && leaveStaffNames.includes(canonicalLeaveStaffName(staff.name))) return;
  const key = `${staffId}_${dayKey(day)}`;
  leaveData.records ||= {};
  const record = getRecord(staffId, day);
  const currentType = record.type || '';
  const nextType = currentType === '' ? 'leave' : currentType === 'leave' ? 'required' : '';
  leaveData.records[key] = { ...record, type: nextType };
  if (!nextType && !(record.specials || []).length) delete leaveData.records[key];
  if (Number.isFinite(getQuota()) && leaveCount(staffId) > getQuota()) alert(`${staff?.name || '此人員'} 已超過當月可休天數！`);
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
  if (specialType === 'flexible') {
    // 2026-10-06 中魁:彈性早退「讓」。點接收的人那天的格子 → 讓給他;再點一次(或點原本的人)→ 取消
    const pair = phonePairForName(staff?.name);
    if (!pair) return;
    leaveData.flexibleOverrides ||= {};
    const overrideKey = phoneOverrideKey(pair, numericDay);
    const clickedName = canonicalLeaveStaffName(staff.name);
    // FRIDAY 10/06:只有「當下生效中的讓」才當成取消;資料裡失效的舊設定(例如值機改過)直接覆寫成新設定
    const activeYield = effectiveFlexibleYield(clickedName, numericDay);
    if (activeYield) {
      delete leaveData.flexibleOverrides[overrideKey];
      setStatus(`已取消 ${numericDay} 號的彈性早退讓渡。`, 'success');
    } else {
      const giver = staffByName(pair.members.find((name) => name !== clickedName));
      if (!giver || !baseFlexibleDay(giver, numericDay)) {
        setStatus(`${numericDay} 號對方沒有彈性早退,沒有可以讓的。`, 'error');
        return;
      }
      if (!canReceiveFlexible(staff, numericDay)) {
        setStatus(`${numericDay} 號 ${clickedName} 不能彈性早退(沒上班 / 週三早班 / 補薪日)。`, 'error');
        return;
      }
      leaveData.flexibleOverrides[overrideKey] = clickedName;
    }
    render();
    saveFlexibleOverride(overrideKey, leaveData.flexibleOverrides[overrideKey]);
    return;
  }
  if (specialType === 'phone') {
    const pair = phonePairForName(staff?.name);
    if (!pair) return;
    leaveData.phoneOverrides ||= {};
    const overrideKey = phoneOverrideKey(pair, numericDay);
    const hasOverride = Object.prototype.hasOwnProperty.call(leaveData.phoneOverrides, overrideKey);
    const currentAssignee = pair.members.find((name) => hasPhoneDuty(name, numericDay)) || '';
    const clickedName = canonicalLeaveStaffName(staff.name);
    if (!hasOverride && currentAssignee === clickedName) leaveData.phoneOverrides[overrideKey] = '';
    else if (hasOverride && leaveData.phoneOverrides[overrideKey] === clickedName) delete leaveData.phoneOverrides[overrideKey];
    else leaveData.phoneOverrides[overrideKey] = clickedName;
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
todayMonthButton?.addEventListener('click', () => { flushPendingSave(); currentMonth = new Date(); currentMonth.setDate(1); setSpecialMode(null); subscribeMonth(); });
specialModeButtons.forEach((button) => {
  button.disabled = !canEditLeave;
  button.addEventListener('click', () => { if (canEditLeave) setSpecialMode(button.dataset.special); });
});

const updateGlobalQuota = (value) => {
  if (!canEditLeave || externalMaxDays !== null) return;
  leaveData.quota = Number(value || 0);
  const exceededStaff = Number.isFinite(getQuota()) && staffList.find((staff) => leaveCount(staff.id) > getQuota());
  if (exceededStaff) alert('已休天數超過當月全員可休天數！');
  render();
  queueSave();
};

if (!leaveDb) {
  setStatus('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。', 'error');
} else {
  if (leaveStaffCollection) {
    unsubscribeStaff = leaveStaffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
      staffList = sortStaffForLeave(fixedLeaveStaffList(snapshot.docs.map(normalizeStaff).filter(visibleLeaveStaff)));
      render();
      loadMonthlyShifts();
    }, (error) => {
      // 人員管理已移除或無讀取權限時，仍使用固定五人名單顯示休假表。
      console.warn('人員資料不可用，休假表改用固定五人名單。', error);
      staffList = sortStaffForLeave(fixedLeaveStaffList(staffList));
      render();
      loadMonthlyShifts();
    });
  }
  render();
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

window.setInterval(loadExternalLeave, LEAVE_SYNC_INTERVAL_MS);
window.setInterval(renderLeaveSyncCountdown, 1000);
renderLeaveSyncCountdown();
window.addEventListener('focus', loadExternalLeave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadExternalLeave();
});

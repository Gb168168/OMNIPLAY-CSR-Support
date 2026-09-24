(() => {
  const button = document.querySelector('#importMeetingButton');
  const input = document.querySelector('#importMeetingInput');
  if (!button || !input) return;

  const serialNumber = (value) => {
    const match = String(value || '').match(/(?:^|\D)(\d{5,6})$/);
    return match ? Number(match[1]) : null;
  };

  const checkImport = (data) => {
    if (data?.format !== 'csr-meeting-import-v1' || !Array.isArray(data.records) || !data.records.length) {
      throw new Error('請選擇本次產生的會議紀錄匯入資料 JSON。');
    }
    const serials = new Set();
    for (const record of data.records) {
      if (!/^\d{5}$/.test(record.sourceSerial || '') || serials.has(record.sourceSerial)
        || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')
        || (record.time && !/^\d{2}:\d{2}$/.test(record.time))
        || typeof record.tabName !== 'string' || !record.tabName
        || !Array.isArray(record.rows) || record.rows.length > 500
        || record.rows.some((row) => typeof row.content !== 'string' || typeof row.solution !== 'string')) {
        throw new Error(`匯入資料格式有誤：${record.sourceSerial || '未知編號'}`);
      }
      serials.add(record.sourceSerial);
    }
    return data.records;
  };

  const isEmptyGeneratedMeeting = (record) => record.weeklyScheduledFor
    && !record.chair && !record.recorder && !record.note
    && !record.files?.length
    && !record.tabs?.some((tab) => tab.rows?.length)
    && !record.techRows?.length && !record.csRows?.length;

  const planImport = (records) => {
    const usedIds = new Set();
    return records.map((source) => {
      const matches = meetingState.records.filter((item) => serialNumber(item.serial || item.number) === Number(source.sourceSerial));
      if (matches.length > 1) throw new Error(`編號 ${source.sourceSerial} 在系統已有多筆，請先處理重複編號。`);
      let existing = matches[0];
      if (!existing && source.time) {
        existing = meetingState.records.find((item) => !usedIds.has(item.id)
          && item.date === source.date && item.time === source.time && isEmptyGeneratedMeeting(item));
      }
      if (existing) usedIds.add(existing.id);
      return { source, existing, id: existing?.id || `ragic-meeting-${source.sourceSerial}` };
    });
  };

  const makeUpdate = ({ source, existing }) => {
    const rows = source.rows.map((row) => ({
      proposer: row.proposer || '', content: row.content, solution: row.solution,
      note: row.note || '', image: []
    }));
    const tabName = source.tabName.trim();
    const tabs = [{ name: tabName, rows }];
    const update = {
      serial: `MTG-${source.sourceSerial}`,
      tabs,
      techRows: tabName === '技術會議' ? rows : [],
      csRows: tabName === '客服會議' ? rows : [],
      updatedAt: new Date()
    };
    if (!source.masterMissing || !existing) {
      Object.assign(update, {
        date: source.date,
        time: source.time || '',
        chair: source.chair || '',
        recorder: source.recorder || '',
        location: source.location || '',
        morningAttendees: source.morningAttendees || [],
        eveningAttendees: source.eveningAttendees || []
      });
    }
    // The export has filenames only: existing uploaded attachments remain untouched.
    // The export has no meeting status, so retain an explicit existing status.
    if (!existing) update.createdAt = new Date();
    if (existing?.status === 'auto') update.status = '';
    return update;
  };

  const refreshPermission = () => {
    button.hidden = window.canUse?.('edit') === false || !meetingState.recordsReady;
  };
  document.addEventListener('meeting-records-ready', refreshPermission);
  if (window.permissionReady) Promise.resolve(window.permissionReady).then(refreshPermission);
  else refreshPermission();
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (window.canUse?.('edit') === false || !meetingCollection) return alert('您沒有匯入權限。');
    button.disabled = true;
    let completed = 0;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('匯入檔案不能超過 5 MB。');
      const records = checkImport(JSON.parse(await file.text()));
      const plan = planImport(records);
      const rows = records.reduce((sum, record) => sum + record.rows.length, 0);
      if (!confirm(`將匯入 ${records.length} 筆會議與 ${rows} 列討論內容。相同編號以匯入檔覆蓋文字欄位，既有附件保留。確定匯入？`)) return;
      for (const item of plan) {
        const ref = meetingCollection.doc(item.id);
        if (!item.existing && (await ref.get()).exists) {
          throw new Error(`編號 ${item.source.sourceSerial} 的匯入 ID 已被其他紀錄占用，請重新整理後再試。`);
        }
        await ref.set(makeUpdate(item), { merge: true });
        completed += 1;
        button.textContent = `匯入中 ${completed}/${plan.length}`;
      }
      alert(`匯入完成：${completed} 筆會議、${rows} 列討論內容。`);
    } catch (error) {
      console.error('會議紀錄匯入失敗：', error);
      alert(`已寫入 ${completed} 筆，匯入中斷：${error.message || '請稍後重試。'}。重新選擇相同檔案可續做，已寫入的編號不會重複建立。`);
    } finally {
      button.disabled = false;
      button.textContent = '匯入會議紀錄';
    }
  });
})();

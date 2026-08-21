(() => {
  'use strict';

  const STATE = {
    active: false,
    selectedKey: '',
    formParent: null,
    formNextSibling: null,
    currentRecordId: null,
    dragKey: '',
    resize: null
  };

  const injectStyles = () => {
    if (document.querySelector('#wysiwygFormDesignerStyles')) return;
    const style = document.createElement('style');
    style.id = 'wysiwygFormDesignerStyles';
    style.textContent = `
      #ragicDesignerModal.is-wysiwyg-form-designer .ragic-modal-card{width:min(1720px,calc(100vw - 24px));height:min(94vh,1000px);max-width:none;overflow:hidden}
      #ragicDesignerModal.is-wysiwyg-form-designer #layoutDesignerPanel{display:grid!important;grid-template-columns:minmax(0,1fr) 380px;min-height:0;height:calc(94vh - 154px);background:#f6f8fc}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-live-stage{min-width:0;overflow:auto;padding:22px 24px 80px;background:#eef2f7}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-live-stage-inner{width:max-content;min-width:100%;display:flex;justify-content:center}
      #ragicDesignerModal.is-wysiwyg-form-designer #ragicFormView{display:block!important;position:relative!important;width:min(1180px,100%);min-width:760px;margin:0!important;box-shadow:0 12px 34px rgba(15,23,42,.12);background:#fff}
      #ragicDesignerModal.is-wysiwyg-form-designer #ragicFormView>.ragic-actions{display:none!important}
      #ragicDesignerModal.is-wysiwyg-form-designer #ragicFormView .ragic-form-toolbar button{pointer-events:none;opacity:.45}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-inspector{min-width:0;border-left:1px solid #dbe3ef;background:#fff;overflow:auto;padding:14px}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-inspector-empty{padding:32px 18px;color:#718096;text-align:center;line-height:1.7}
      #ragicDesignerModal.is-wysiwyg-form-designer [data-wysiwyg-key]{position:relative;cursor:pointer;outline:1px dashed transparent;outline-offset:2px;transition:outline-color .12s,box-shadow .12s}
      #ragicDesignerModal.is-wysiwyg-form-designer [data-wysiwyg-key]:hover{outline-color:#7aa7ff}
      #ragicDesignerModal.is-wysiwyg-form-designer [data-wysiwyg-key].is-wysiwyg-selected{outline:2px solid #2563eb!important;box-shadow:0 0 0 4px rgba(37,99,235,.12)!important;z-index:5}
      #ragicDesignerModal.is-wysiwyg-form-designer [data-wysiwyg-key].is-wysiwyg-dragging{opacity:.55}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-field-grip{position:absolute;left:6px;top:6px;z-index:9;width:23px;height:23px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;box-shadow:0 2px 6px rgba(15,23,42,.12);display:flex;align-items:center;justify-content:center;color:#475569;font-size:14px;cursor:grab;user-select:none}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-resize-handle{position:absolute;right:-5px;bottom:-5px;width:12px;height:12px;border:2px solid #fff;border-radius:3px;background:#2563eb;z-index:10;cursor:nwse-resize}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-floating-toolbar{position:fixed;z-index:10050;display:flex;align-items:center;gap:4px;padding:5px;border:1px solid #d5deea;border-radius:9px;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.18)}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-floating-toolbar button{height:30px;min-width:30px;padding:0 8px;border:0;border-radius:6px;background:transparent;cursor:pointer;color:#334155}
      #ragicDesignerModal.is-wysiwyg-form-designer .wysiwyg-floating-toolbar button:hover{background:#eef4ff;color:#1d4ed8}
      @media(max-width:1050px){#ragicDesignerModal.is-wysiwyg-form-designer #layoutDesignerPanel{grid-template-columns:1fr}.wysiwyg-inspector{display:none}}
    `;
    document.head.appendChild(style);
  };

  const modal = () => document.querySelector('#ragicDesignerModal');
  const panel = () => document.querySelector('#layoutDesignerPanel');
  const designerBody = () => document.querySelector('#ragicDesignerModal .designer-body');
  const formView = () => document.querySelector('#ragicFormView');
  const fields = () => (typeof getFields === 'function' ? getFields() : []);
  const fieldByKeyLocal = (key) => fields().find((field) => field.key === key);

  const inferFieldKey = (element, used = new Set()) => {
    const explicit = element.dataset.fieldKey || element.dataset.field || element.getAttribute('name');
    if (explicit && fieldByKeyLocal(explicit)) return explicit;
    const label = element.querySelector('.ragic-view-label,.field-label,label')?.textContent?.trim();
    if (label) {
      const match = fields().find((field) => !used.has(field.key) && String(field.label || field.key).trim() === label);
      if (match) return match.key;
    }
    return '';
  };

  const currentPreviewRecord = () => {
    const id = STATE.currentRecordId || (typeof RAGIC_STATE !== 'undefined' ? RAGIC_STATE.currentId : '');
    const records = typeof RAGIC_STATE !== 'undefined' ? (RAGIC_STATE.records || []) : [];
    return records.find((record) => record.id === id) || records[0] || {};
  };

  const mutateLayout = (patcher) => {
    if (typeof RAGIC_STATE === 'undefined' || typeof readDesigner !== 'function' || typeof normalizeDesignerFormLayout !== 'function') return;
    const currentFields = readDesigner(designerBody() || document.createElement('div'));
    const layout = normalizeDesignerFormLayout(RAGIC_STATE.schema?.formLayout, currentFields);
    patcher(layout, currentFields);
    RAGIC_STATE.schema = {
      ...(RAGIC_STATE.schema || {}),
      fields: typeof normalizeFields === 'function' ? normalizeFields(currentFields) : currentFields,
      formLayout: normalizeDesignerFormLayout(layout, currentFields)
    };
    refreshFormalRenderer();
  };

  const refreshFormalRenderer = () => {
    if (!STATE.active || typeof renderForm !== 'function') return;
    renderForm(currentPreviewRecord(), { mode: 'view' });
    requestAnimationFrame(() => {
      const host = panel()?.querySelector('.wysiwyg-live-stage-inner');
      const live = formView();
      if (live && host && live.parentElement !== host) host.appendChild(live);
      decorateFormalFields();
      if (STATE.selectedKey) selectField(STATE.selectedKey, { openInspector: false });
    });
  };

  const positionToolbar = (target) => {
    const toolbar = document.querySelector('.wysiwyg-floating-toolbar');
    if (!toolbar || !target) return;
    const rect = target.getBoundingClientRect();
    const width = toolbar.offsetWidth || 190;
    toolbar.style.left = `${Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))}px`;
    const above = rect.top - (toolbar.offsetHeight || 42) - 8;
    toolbar.style.top = `${above >= 8 ? above : Math.min(window.innerHeight - 50, rect.bottom + 8)}px`;
  };

  const ensureToolbar = () => {
    let toolbar = document.querySelector('.wysiwyg-floating-toolbar');
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.className = 'wysiwyg-floating-toolbar';
    toolbar.hidden = true;
    toolbar.innerHTML = '<button type="button" data-wysiwyg-align="left" title="靠左">⇤</button><button type="button" data-wysiwyg-align="center" title="置中">↔</button><button type="button" data-wysiwyg-align="right" title="靠右">⇥</button><button type="button" data-wysiwyg-open-properties title="欄位屬性">⚙</button>';
    document.body.appendChild(toolbar);
    toolbar.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const align = event.target.closest('[data-wysiwyg-align]')?.dataset.wysiwygAlign;
      if (align && STATE.selectedKey) {
        const row = designerBody()?.querySelector(`.designer-field[data-field-key="${CSS.escape(STATE.selectedKey)}"],.designer-field[data-key="${CSS.escape(STATE.selectedKey)}"]`);
        const input = row?.querySelector('[data-role="list-horizontal-align"]');
        if (input) input.value = align;
        const value = document.querySelector(`#ragicDesignerModal [data-wysiwyg-key="${CSS.escape(STATE.selectedKey)}"] .ragic-view-value`);
        if (value) value.style.textAlign = align;
      }
      if (event.target.closest('[data-wysiwyg-open-properties]') && STATE.selectedKey) openProperties(STATE.selectedKey);
    });
    return toolbar;
  };

  const openProperties = (key) => {
    const inspector = panel()?.querySelector('.wysiwyg-inspector');
    if (!inspector) return;
    inspector.innerHTML = '<aside id="layoutFieldSettingsPanel" class="layout-field-settings" hidden></aside>';
    if (typeof openLayoutFieldSettings === 'function') {
      openLayoutFieldSettings(key);
      const settings = inspector.querySelector('#layoutFieldSettingsPanel');
      if (settings) settings.hidden = false;
    }
  };

  const selectField = (key, { openInspector = true } = {}) => {
    STATE.selectedKey = key || '';
    document.querySelectorAll('#ragicDesignerModal [data-wysiwyg-key]').forEach((el) => el.classList.toggle('is-wysiwyg-selected', el.dataset.wysiwygKey === key));
    const target = key ? document.querySelector(`#ragicDesignerModal [data-wysiwyg-key="${CSS.escape(key)}"]`) : null;
    const toolbar = ensureToolbar();
    toolbar.hidden = !target;
    if (target) positionToolbar(target);
    if (openInspector && key) openProperties(key);
  };

  const decorateFormalFields = () => {
    const live = formView();
    if (!live) return;
    const candidates = [...live.querySelectorAll('.ragic-view-field,.ragic-view-subtable,[data-field-key]')];
    const used = new Set();
    candidates.forEach((el) => {
      const key = inferFieldKey(el, used);
      if (!key || used.has(key)) return;
      used.add(key);
      el.dataset.wysiwygKey = key;
      el.draggable = true;
      if (!el.querySelector(':scope > .wysiwyg-field-grip')) {
        const grip = document.createElement('span');
        grip.className = 'wysiwyg-field-grip';
        grip.textContent = '⠿';
        grip.title = '拖曳欄位';
        el.appendChild(grip);
      }
      if (!el.querySelector(':scope > .wysiwyg-resize-handle')) {
        const handle = document.createElement('span');
        handle.className = 'wysiwyg-resize-handle';
        handle.title = '拖曳調整欄位大小';
        el.appendChild(handle);
      }
    });
  };

  const layoutDropPosition = (grid, clientX, clientY) => {
    if (!grid || typeof currentDesignerLayout !== 'function') return null;
    const layout = currentDesignerLayout();
    const rect = grid.getBoundingClientRect();
    const cols = Math.max(1, Number(layout.columns) || 1);
    const rows = Math.max(1, Number(layout.rows) || 1);
    const col = Math.min(cols, Math.max(1, Math.floor(((clientX - rect.left) / Math.max(1, rect.width)) * cols) + 1));
    const row = Math.min(10, Math.max(1, Math.floor((clientY - rect.top) / Math.max(48, rect.height / rows)) + 1));
    return { row, col };
  };

  const startResize = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof currentDesignerLayout !== 'function') return;
    const layout = currentDesignerLayout();
    const item = { ...(layout.fields?.[key] || { row: 1, col: 1, colSpan: 1, rowSpan: 1 }) };
    STATE.resize = { key, startX: event.clientX, startY: event.clientY, item, layout };
    const move = (moveEvent) => {
      if (!STATE.resize) return;
      const dx = moveEvent.clientX - STATE.resize.startX;
      const dy = moveEvent.clientY - STATE.resize.startY;
      const cellW = Math.max(70, (formView()?.querySelector('.ragic-view-grid')?.getBoundingClientRect().width || 700) / Math.max(1, layout.columns));
      const colSpan = Math.max(1, Math.min(layout.columns - item.col + 1, item.colSpan + Math.round(dx / cellW)));
      const rowSpan = Math.max(1, item.rowSpan + Math.round(dy / 56));
      const target = document.querySelector(`#ragicDesignerModal [data-wysiwyg-key="${CSS.escape(key)}"]`);
      if (target) {
        target.style.gridColumn = `${item.col} / span ${colSpan}`;
        target.style.gridRow = `${item.row} / span ${rowSpan}`;
      }
      STATE.resize.next = { ...item, colSpan, rowSpan };
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      const next = STATE.resize?.next;
      STATE.resize = null;
      if (!next) return;
      mutateLayout((nextLayout) => {
        nextLayout.rows = Math.min(10, Math.max(nextLayout.rows || 1, next.row + next.rowSpan - 1));
        nextLayout.fields[key] = next;
      });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  };

  const bindStageEvents = (stage) => {
    stage.addEventListener('click', (event) => {
      const field = event.target.closest('[data-wysiwyg-key]');
      if (!field) return;
      event.preventDefault();
      event.stopPropagation();
      selectField(field.dataset.wysiwygKey);
    }, true);
    stage.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('.wysiwyg-resize-handle');
      const field = handle?.closest('[data-wysiwyg-key]');
      if (field) startResize(event, field.dataset.wysiwygKey);
    }, true);
    stage.addEventListener('dragstart', (event) => {
      const field = event.target.closest('[data-wysiwyg-key]');
      if (!field) return;
      STATE.dragKey = field.dataset.wysiwygKey;
      field.classList.add('is-wysiwyg-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', STATE.dragKey);
    });
    stage.addEventListener('dragover', (event) => { if (STATE.dragKey) event.preventDefault(); });
    stage.addEventListener('drop', (event) => {
      if (!STATE.dragKey) return;
      const grid = event.target.closest('.ragic-view-grid') || formView()?.querySelector('.ragic-view-grid');
      const pos = layoutDropPosition(grid, event.clientX, event.clientY);
      if (!pos) return;
      event.preventDefault();
      const key = STATE.dragKey;
      mutateLayout((layout) => {
        const current = layout.fields[key] || { row: 1, col: 1, colSpan: 1, rowSpan: 1 };
        layout.rows = Math.min(10, Math.max(layout.rows || 1, pos.row + current.rowSpan - 1));
        layout.fields[key] = { ...current, row: pos.row, col: pos.col };
      });
      STATE.dragKey = '';
    });
    stage.addEventListener('dragend', () => {
      document.querySelectorAll('.is-wysiwyg-dragging').forEach((el) => el.classList.remove('is-wysiwyg-dragging'));
      STATE.dragKey = '';
    });
    stage.addEventListener('scroll', () => {
      if (!STATE.selectedKey) return;
      const target = document.querySelector(`#ragicDesignerModal [data-wysiwyg-key="${CSS.escape(STATE.selectedKey)}"]`);
      if (target) positionToolbar(target);
    }, { passive: true });
  };

  const restoreFormView = () => {
    if (!STATE.formParent) return;
    const live = formView();
    if (live) {
      if (STATE.formNextSibling && STATE.formNextSibling.parentElement === STATE.formParent) STATE.formParent.insertBefore(live, STATE.formNextSibling);
      else STATE.formParent.appendChild(live);
    }
    STATE.formParent = null;
    STATE.formNextSibling = null;
    STATE.active = false;
    STATE.selectedKey = '';
    const toolbar = document.querySelector('.wysiwyg-floating-toolbar');
    if (toolbar) toolbar.hidden = true;
    modal()?.classList.remove('is-wysiwyg-form-designer');
  };

  const enterWysiwygMode = () => {
    const m = modal();
    const p = panel();
    const live = formView();
    if (!m || !p || !live) return;
    injectStyles();
    if (!STATE.formParent) {
      STATE.formParent = live.parentElement;
      STATE.formNextSibling = live.nextSibling;
      STATE.currentRecordId = typeof RAGIC_STATE !== 'undefined' ? RAGIC_STATE.currentId : null;
    }
    STATE.active = true;
    m.classList.add('is-wysiwyg-form-designer');
    m.querySelectorAll('[data-designer-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.designerTab === 'form'));
    m.querySelectorAll('[data-designer-panel]').forEach((item) => { item.hidden = item !== p; });
    p.hidden = false;
    p.innerHTML = '<main class="wysiwyg-live-stage"><div class="wysiwyg-live-stage-inner"></div></main><aside class="wysiwyg-inspector"><div class="wysiwyg-inspector-empty"><b>欄位屬性</b><br>直接點選左側正式檢視畫面的欄位進行設定。</div></aside>';
    bindStageEvents(p.querySelector('.wysiwyg-live-stage'));
    if (typeof renderForm === 'function') renderForm(currentPreviewRecord(), { mode: 'view' });
    requestAnimationFrame(() => {
      const currentLive = formView();
      p.querySelector('.wysiwyg-live-stage-inner')?.appendChild(currentLive);
      if (currentLive) currentLive.hidden = false;
      decorateFormalFields();
      ensureToolbar();
    });
  };

  const install = () => {
    injectStyles();
    document.addEventListener('click', (event) => {
      const m = modal();
      if (!m || m.hidden) return;
      const tab = event.target.closest('#ragicDesignerModal [data-designer-tab]');
      if (tab?.dataset.designerTab === 'form') {
        event.preventDefault();
        event.stopImmediatePropagation();
        enterWysiwygMode();
        return;
      }
      if (tab?.dataset.designerTab === 'list' && STATE.active) restoreFormView();
      if (event.target.closest('#closeDesignerButton') && STATE.active) restoreFormView();
    }, true);
    window.addEventListener('resize', () => {
      if (!STATE.active || !STATE.selectedKey) return;
      const target = document.querySelector(`#ragicDesignerModal [data-wysiwyg-key="${CSS.escape(STATE.selectedKey)}"]`);
      if (target) positionToolbar(target);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

(() => {
  'use strict';
  const db = window.omniplayDb;
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const now = () => new Date().toISOString();
  const actor = () => sessionStorage.getItem('omniplayStaffName') || 'Unknown';
  const canEdit = () => window.canUse?.('edit') !== false;
  const collections = {
    games: db?.collection('game_master'), groups: db?.collection('game_groups'), clients: db?.collection('game_clients'),
    documents: db?.collection('game_documents'), history: db?.collection('game_change_log'), syncJobs: db?.collection('game_sync_jobs')
  };
  const state = { games: [], groups: [], clients: [], documents: [], history: [], syncJobs: [], previewClientId: null, pendingSave: null };
  const googleSheets = {
    masterSpreadsheetId: '1PzOvGUv5PWpx-1uLwg9gLOnMWPqH9ThuepaBv7Pu9lI', masterSheetName: 'GameList',
    customerTemplateSpreadsheetId: '1BHyeVxQzsLHHeVFqo4iSdqYlTEteznYMgufbPw1sbtQ', customerTemplateSheetName: 'OP Game',
    scheduleId: 'google_sheets_game_master_schedule', intervalMinutes: 5,
    feedUrl: 'https://script.google.com/macros/s/AKfycbw2saSKReX6c4juxILFzSofZPCZzvtui8NimeCrKJnm2gIfdONnHyybMGsZyeRnlvmW/exec'
  };
  let autoScheduleEnsured = false;
  let syncCountdownTimer = null;
  let autoSyncTimer = null;
  let syncInFlight = false;

  const customerColumns = [
    ['gameId','Game ID'],['nameZh','中文遊戲名稱\nGame Name\n(Mandarin)'],['nameEn','英文遊戲名稱\nGame Name\n(English)'],['status','狀態\nGame Status'],['releaseDate','上線日期\nRelease Date'],['pagcorApproval','是否取得Pagcor驗證\nPagcor Approval'],['freeSpin','是否支援\nFree Spin'],['gameVersion','Game Version'],['manufacturer','Manufacturer'],['denomination','Denomination'],['gameType','Game Type'],['lines','No. of Lines'],['betMin','Bet (PHP)\nMinimum'],['betMax','Bet (PHP)\nMaximum'],['maxPrize','Max Prize\n(PHP)'],['maxPrizeMultiplier','Max Prize\nMultiplier'],['jackpotGroup','Progressive\nJackpot Group'],['jackpotMin','Jackpot Range\nMin (PHP)'],['jackpotMax','Jackpot Range\nMax (PHP)'],['jackpotReserve','Jackpot RTP %\nReserve %'],['jackpotIncrement','Jackpot RTP %\nIncrement %'],['totalJackpotRtp','Total Jackpot\nRTP %'],['baseRtp','Base Game\nRTP %'],['totalPayout','Total Payout %\n(Theoretical)']
  ];
  const gameFields = [
    ['gameId','Game ID','text',true],['gameVersion','Game Version'],['nameEn','英文遊戲名稱'],['nameZh','中文遊戲名稱'],['status','Game Status','select'],['releaseDate','Release Date','date'],['pagcorApproval','Pagcor Approval','selectYes'],['freeSpin','Free Spin','selectYes'],['manufacturer','Manufacturer'],['denomination','Denomination'],['gameType','Game Type'],['lines','No. of Lines'],['betMin','Bet Minimum','number'],['betMax','Bet Maximum','number'],['maxPrize','Max Prize','number'],['maxPrizeMultiplier','Max Prize Multiplier','number'],['jackpotGroup','Progressive Jackpot Group'],['jackpotMin','Jackpot Range Min'],['jackpotMax','Jackpot Range Max'],['jackpotReserve','Jackpot RTP Reserve'],['jackpotIncrement','Jackpot RTP Increment'],['totalJackpotRtp','Total Jackpot RTP','number'],['baseRtp','Base Game RTP','number'],['totalPayout','Total Payout','number'],['customerNote','Customer Note','textarea'],['internalNote','Internal Note','textarea']
  ];

  function normalizeDoc(doc){ return { id: doc.id, ...doc.data() }; }
  function subscribe(name){
    const ref=collections[name]; if(!ref) return;
    ref.onSnapshot((snapshot)=>{ state[name]=snapshot.docs.map(normalizeDoc); if(name==='history') state.history.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))); render(); },(error)=>console.error(`讀取 ${name} 失敗`,error));
  }
  function gameById(id){ return state.games.find((game)=>game.id===id || String(game.gameId)===String(id)); }
  function clientById(id){ return state.clients.find((client)=>client.id===id); }
  function groupById(id){ return state.groups.find((group)=>group.id===id); }
  function groupIdsForGame(gameId){ return state.groups.filter((group)=>(group.gameIds||[]).includes(gameId)).map((group)=>group.id); }
  function clientsForGame(gameId){ return state.clients.filter((client)=>effectiveGames(client).some((item)=>item.game.id===gameId)); }
  function effectiveGames(client){
    const sourceMap=new Map();
    (client.groupIds||[]).forEach((groupId)=>{ const group=groupById(groupId); (group?.gameIds||[]).forEach((gameId)=>{ if(!sourceMap.has(gameId)) sourceMap.set(gameId,[]); sourceMap.get(gameId).push(group?.name||groupId); }); });
    (client.excludeGameIds||[]).forEach((gameId)=>sourceMap.delete(gameId));
    (client.includeGameIds||[]).forEach((gameId)=>sourceMap.set(gameId,['Client Override']));
    return [...sourceMap.entries()].map(([gameId,sources])=>({game:gameById(gameId),source:sources.join(', ')})).filter((item)=>item.game).sort((a,b)=>String(a.game.gameId).localeCompare(String(b.game.gameId),undefined,{numeric:true}));
  }
  function effectiveIds(client){ return effectiveGames(client).map((item)=>item.game.id); }
  function affectedByGroup(groupId, oldGameIds, newGameIds){
    const changed=[...new Set([...(oldGameIds||[]),...(newGameIds||[])])].filter((id)=>(oldGameIds||[]).includes(id)!==(newGameIds||[]).includes(id));
    return state.clients.filter((client)=>(client.groupIds||[]).includes(groupId) && changed.some((gameId)=>!(client.excludeGameIds||[]).includes(gameId)));
  }
  const tagList=(items)=>`<div class="library-tags">${items.length?items.map((x)=>`<span class="library-tag">${escapeHtml(x)}</span>`).join(''):'—'}</div>`;

  function render(){ renderGames(); renderGroups(); renderClients(); renderDocuments(); renderHistory(); renderSyncStatus(); }
  function syncSchedule(){ return state.syncJobs.find(job=>job.id===googleSheets.scheduleId); }
  function gameListFeedUrl(){ return String(syncSchedule()?.feedUrl||googleSheets.feedUrl||'').trim(); }
  function renderSyncStatus(){ const button=$('#syncMasterButton'),badge=$('#syncStatusBadge'); if(!button)return; const runs=state.syncJobs.filter(job=>job.type==='GOOGLE_SHEETS_GAME_MASTER_RUN'); const latest=[...runs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]; const configured=Boolean(gameListFeedUrl()); button.title=configured?(latest?`最近同步：${latest.status||'requested'} ${latest.updatedAt||latest.createdAt||''}`:'從 Game List_Online / GameList 立即同步'):'同步服務尚待系統管理員完成部署'; button.disabled=latest?.status==='processing'; button.textContent=latest?.status==='processing'?'同步中…':'立即同步'; if(!configured&&badge){badge.classList.add('is-error');badge.textContent='同步服務尚未完成部署';}else startSyncCountdown(latest,badge); ensureAutoSyncSchedule(); }
  function startSyncCountdown(latest,badge){ if(!badge)return; clearInterval(syncCountdownTimer); const tick=()=>{badge.classList.toggle('is-syncing',latest?.status==='processing');badge.classList.toggle('is-error',latest?.status==='failed');if(latest?.status==='processing'){badge.textContent='Google Sheets 同步中…';return;}if(latest?.status==='failed'){badge.textContent=`同步失敗；下次重試 ${formatCountdown(nextSyncSeconds(latest))}`;return;}badge.textContent=`下次自動同步 ${formatCountdown(nextSyncSeconds(latest))}`;};tick();syncCountdownTimer=setInterval(tick,1000);}
  function nextSyncSeconds(latest){ const base=Date.parse(latest?.completedAt||latest?.updatedAt||latest?.createdAt||now()); const interval=googleSheets.intervalMinutes*60; const elapsed=Math.max(0,Math.floor((Date.now()-base)/1000)); return Math.max(0,interval-(elapsed%interval)); }
  function formatCountdown(seconds){ const minutes=Math.floor(seconds/60);const remain=seconds%60;return `${String(minutes).padStart(2,'0')}:${String(remain).padStart(2,'0')}`; }
  async function ensureAutoSyncSchedule(){
    if(autoScheduleEnsured||!canEdit()||!collections.syncJobs)return;
    autoScheduleEnsured=true;
    try{
      const existing=state.syncJobs.find(job=>job.id===googleSheets.scheduleId);
      if(!existing?.enabled||existing?.intervalMinutes!==googleSheets.intervalMinutes){
        await collections.syncJobs.doc(googleSheets.scheduleId).set({type:'GOOGLE_SHEETS_GAME_MASTER_SCHEDULE',enabled:true,intervalMinutes:googleSheets.intervalMinutes,spreadsheetId:googleSheets.masterSpreadsheetId,sheetName:googleSheets.masterSheetName,feedUrl:googleSheets.feedUrl,customerTemplate:{spreadsheetId:googleSheets.customerTemplateSpreadsheetId,sheetName:googleSheets.customerTemplateSheetName,mode:'columns_only'},upsertKey:'GAME ID',missingRowPolicy:'keep_and_flag',updatedBy:actor(),updatedAt:now()},{merge:true});
      }
      if(gameListFeedUrl()){
        clearInterval(autoSyncTimer);
        autoSyncTimer=setInterval(()=>syncGoogleMaster('auto').catch((error)=>console.error('Google Sheets 自動同步失敗',error)),googleSheets.intervalMinutes*60*1000);
        const completed=state.syncJobs.some(job=>job.type==='GOOGLE_SHEETS_GAME_MASTER_RUN'&&job.status==='completed');
        if(!completed&&state.games.length===0) syncGoogleMaster('auto').catch((error)=>console.error('Google Sheets 初次同步失敗',error));
      }
    }catch(error){autoScheduleEnsured=false;console.error('建立 Google Sheets 自動同步排程失敗',error);}
  }
  function renderGames(){
    const body=$('#gameTableBody'); if(!body)return;
    const query=$('#gameSearch')?.value.trim().toLowerCase()||''; const status=$('#gameStatusFilter')?.value||'';
    const games=state.games.filter((g)=>(!status||g.status===status)&&(!query||[g.gameId,g.nameEn,g.nameZh,g.gameVersion].some((v)=>String(v||'').toLowerCase().includes(query)))).sort((a,b)=>String(a.gameId).localeCompare(String(b.gameId),undefined,{numeric:true}));
    body.innerHTML=games.map((game)=>{ const groups=groupIdsForGame(game.id).map((id)=>groupById(id)?.name||id); const clients=clientsForGame(game.id); return `<tr><td><strong>${escapeHtml(game.gameId)}</strong></td><td>${escapeHtml(game.nameEn)}</td><td>${escapeHtml(game.nameZh)}</td><td>${escapeHtml(game.status||'—')}</td><td>${escapeHtml(game.gameVersion)}</td><td>${tagList(groups)}</td><td>${clients.length} ${clients.length?`<span title="${escapeHtml(clients.map(c=>c.name).join(', '))}">位</span>`:''}</td><td>${escapeHtml(game.internalNote||'—')}</td><td><div class="library-actions"><button class="secondary" data-action="game-groups" data-id="${game.id}">群組設定</button><button class="ghost" data-action="edit-game" data-id="${game.id}">編輯</button></div></td></tr>`; }).join('')||'<tr><td class="library-empty" colspan="9">目前沒有符合條件的遊戲。</td></tr>';
  }
  function renderGroups(){ const grid=$('#groupGrid'); if(!grid)return; grid.innerHTML=state.groups.map((group)=>{const clients=state.clients.filter(c=>(c.groupIds||[]).includes(group.id));return `<article class="library-card"><h3>${escapeHtml(group.name)}</h3><p>${escapeHtml(group.description||'無說明')}</p><div class="library-card-meta"><div><span>Games</span><strong>${(group.gameIds||[]).length}</strong></div><div><span>Clients</span><strong>${clients.length}</strong></div></div><div class="library-actions"><button class="primary" data-action="edit-group" data-id="${group.id}">管理群組</button></div></article>`;}).join('')||'<p class="library-empty">尚未建立群組。</p>'; }
  function renderClients(){ const grid=$('#clientGrid'); if(!grid)return; grid.innerHTML=state.clients.map((client)=>`<article class="library-card"><h3>${escapeHtml(client.name)}</h3><p>${client.exclusivity==='exclusive'?'Exclusive':'Non-exclusive'}</p><div class="library-card-meta"><div><span>Groups</span><strong>${(client.groupIds||[]).length}</strong></div><div><span>Games</span><strong>${effectiveGames(client).length}</strong></div></div>${tagList((client.groupIds||[]).map(id=>groupById(id)?.name||id))}<div class="library-actions" style="margin-top:14px"><button class="primary" data-action="preview-client" data-id="${client.id}">Preview OMNIPLAY Game</button><button class="secondary" data-action="edit-client" data-id="${client.id}">設定</button></div></article>`).join('')||'<p class="library-empty">尚未建立客戶。</p>'; }
  function renderDocuments(){ const body=$('#documentTableBody'); if(!body)return; body.innerHTML=state.documents.map((doc)=>`<tr><td>${escapeHtml(doc.type)}</td><td>${escapeHtml(doc.name)}</td><td>${escapeHtml(gameById(doc.gameId)?.gameId||'—')}</td><td>${doc.url?`<a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">開啟</a>`:'—'}</td><td>${escapeHtml(doc.note||'—')}</td><td>${escapeHtml(doc.updatedAt||'—')}</td></tr>`).join('')||'<tr><td class="library-empty" colspan="6">尚無文件。</td></tr>'; }
  function renderHistory(){ const body=$('#historyTableBody'); if(!body)return; body.innerHTML=state.history.slice(0,300).map((log)=>`<tr><td>${escapeHtml(log.createdAt||'')}</td><td>${escapeHtml(log.actor||'')}</td><td>${escapeHtml(log.actionType||'')}</td><td>${escapeHtml(log.subject||'')}</td><td>${escapeHtml(compact(log.before))}</td><td>${escapeHtml(compact(log.after))}</td><td>${escapeHtml((log.affectedClients||[]).join(', ')||'—')}</td></tr>`).join('')||'<tr><td class="library-empty" colspan="7">尚無異動紀錄。</td></tr>'; }
  const compact=(value)=>{ if(value==null)return '—'; const text=typeof value==='string'?value:JSON.stringify(value); return text.length>180?`${text.slice(0,180)}…`:text; };

  function fieldHtml([key,label,type='text',required=false],value=''){
    const req=required?'required':''; let control;
    if(type==='textarea') control=`<textarea name="${key}" ${req}>${escapeHtml(value)}</textarea>`;
    else if(type==='select') control=`<select name="${key}"><option value=""></option>${['已上線 Released','未上線 Unreleased','下架 Delisted'].map(v=>`<option ${value===v?'selected':''}>${v}</option>`).join('')}</select>`;
    else if(type==='selectYes') control=`<select name="${key}">${['','Yes','No'].map(v=>`<option ${value===v?'selected':''}>${v}</option>`).join('')}</select>`;
    else control=`<input name="${key}" type="${type}" value="${escapeHtml(value)}" ${req}>`;
    return `<div class="library-field ${type==='textarea'?'wide':''}"><label>${escapeHtml(label)}</label>${control}</div>`;
  }
  function checkboxGrid(name,items,selected,labeler){ return `<div class="library-field wide"><label>${name}</label><div class="library-check-grid">${items.map((item)=>`<label class="library-check"><input type="checkbox" name="${name}" value="${item.id}" ${(selected||[]).includes(item.id)?'checked':''}><span>${escapeHtml(labeler(item))}</span></label>`).join('')||'尚無可選項目'}</div></div>`; }
  function values(form){ const data=Object.fromEntries(new FormData(form)); form.querySelectorAll('input[type="number"]').forEach((input)=>{ if(input.value!=='')data[input.name]=Number(input.value); }); return data; }
  function checked(form,name){ return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input)=>input.value); }
  function openEditor(title,html,onSubmit){ if(!canEdit())return alert('你沒有編輯藏經閣的權限。'); $('#editorTitle').textContent=title; $('#editorForm').innerHTML=html; $('#editorModal').hidden=false; $('#editorForm').onsubmit=(event)=>{event.preventDefault();onSubmit(event.currentTarget);}; }
  function closeModals(){ document.querySelectorAll('.library-modal').forEach((modal)=>modal.hidden=true); state.pendingSave=null; }
  async function logChange(actionType,subject,before,after,affected=[]){ const id=uid('log'); await collections.history.doc(id).set({actionType,subject,before:before??null,after:after??null,affectedClients:affected.map(c=>c.name||c),actor:actor(),createdAt:now()}); }
  async function saveWithImpact({summary,description,clients,save}){ if(!clients.length){await save();return;} $('#impactSummary').textContent=`此操作將影響 ${clients.length} 個客戶`; $('#impactClientList').innerHTML=clients.map(c=>`<li>${escapeHtml(c.name)}</li>`).join(''); $('#impactDescription').textContent=description; $('#editorModal').hidden=true; $('#impactModal').hidden=false; state.pendingSave=save; }

  function editGame(game={}){ openEditor(game.id?'編輯遊戲':'新增遊戲',gameFields.map((f)=>fieldHtml(f,game[f[0]]??'')).join(''),async(form)=>{ const data=values(form), id=game.id||uid('game'); data.updatedAt=now(); data.updatedBy=actor(); await collections.games.doc(id).set(data,{merge:true}); await logChange(game.id?'UPDATE_GAME':'CREATE_GAME',`Game ${data.gameId}`,game.id?game:null,data,clientsForGame(id)); closeModals(); }); }
  function editGameGroups(game){ const old=groupIdsForGame(game.id); openEditor(`Game ${game.gameId} 群組設定`,checkboxGrid('groupIds',state.groups,old,g=>g.name),async(form)=>{ const next=checked(form,'groupIds'); const changed=state.groups.filter(g=>old.includes(g.id)!==next.includes(g.id)); const clients=[...new Map(changed.flatMap(g=>state.clients.filter(c=>(c.groupIds||[]).includes(g.id))).map(c=>[c.id,c])).values()]; const save=async()=>{ for(const group of changed){ const ids=new Set(group.gameIds||[]); next.includes(group.id)?ids.add(game.id):ids.delete(game.id); await collections.groups.doc(group.id).set({gameIds:[...ids],updatedAt:now(),updatedBy:actor()},{merge:true}); } await logChange('SET_GAME_GROUPS',`Game ${game.gameId}`,old,next,clients); closeModals(); }; await saveWithImpact({clients,summary:'',description:`${game.gameId} 將依新的群組設定更新以上客戶的 Game List。`,save}); }); }
  function editGroup(group={}){ const oldIds=group.gameIds||[]; openEditor(group.id?'管理群組':'新增群組',fieldHtml(['name','群組名稱','text',true],group.name||'')+fieldHtml(['description','說明','textarea'],group.description||'')+checkboxGrid('gameIds',state.games,oldIds,g=>`${g.gameId} ${g.nameEn||''}`),async(form)=>{ const data=values(form), id=group.id||uid('group'); data.gameIds=checked(form,'gameIds'); data.updatedAt=now();data.updatedBy=actor(); const clients=group.id?affectedByGroup(id,oldIds,data.gameIds):[]; const changedGames=[...new Set([...oldIds,...data.gameIds])].filter(x=>oldIds.includes(x)!==data.gameIds.includes(x)).map(gameById).filter(Boolean); const save=async()=>{await collections.groups.doc(id).set(data,{merge:true});await logChange(group.id?'UPDATE_GROUP':'CREATE_GROUP',`Group ${data.name}`,group.id?group:null,data,clients);closeModals();}; await saveWithImpact({clients,description:`${changedGames.map(g=>g.gameId).join(', ')} 將依群組異動更新以上客戶的 Game List。`,save}); }); }
  function editClient(client={}){ const ids=effectiveIds(client); openEditor(client.id?'客戶設定':'新增客戶',fieldHtml(['name','客戶名稱','text',true],client.name||'')+`<div class="library-field"><label>Exclusive / Non-exclusive</label><select name="exclusivity"><option value="non-exclusive" ${client.exclusivity!=='exclusive'?'selected':''}>Non-exclusive</option><option value="exclusive" ${client.exclusivity==='exclusive'?'selected':''}>Exclusive</option></select></div>`+checkboxGrid('groupIds',state.groups,client.groupIds||[],g=>g.name)+checkboxGrid('includeGameIds',state.games,client.includeGameIds||[],g=>`${g.gameId} ${g.nameEn||''}`)+checkboxGrid('excludeGameIds',state.games,client.excludeGameIds||[],g=>`${g.gameId} ${g.nameEn||''}`),async(form)=>{ const data=values(form),id=client.id||uid('client'); data.groupIds=checked(form,'groupIds');data.includeGameIds=checked(form,'includeGameIds');data.excludeGameIds=checked(form,'excludeGameIds');data.updatedAt=now();data.updatedBy=actor(); const virtual={id,...client,...data}; const nextIds=effectiveIds(virtual); const changed=[...new Set([...ids,...nextIds])].filter(x=>ids.includes(x)!==nextIds.includes(x)); const save=async()=>{await collections.clients.doc(id).set(data,{merge:true});await logChange(client.id?'UPDATE_CLIENT_RULES':'CREATE_CLIENT',`Client ${data.name}`,client.id?client:null,data,[virtual]);closeModals();}; await saveWithImpact({clients:client.id&&changed.length?[virtual]:[],description:`此客戶的最終 Game List 將變更 ${changed.length} 款遊戲。`,save}); }); }
  function editDocument(){ openEditor('新增文件',`<div class="library-field"><label>文件類型</label><select name="type">${['Game Asset','Game Description','BMM Report','RNG Certificate','RTP Declaration','Other'].map(x=>`<option>${x}</option>`).join('')}</select></div>`+fieldHtml(['name','文件名稱','text',true])+`<div class="library-field"><label>Game</label><select name="gameId"><option value="">共用文件</option>${state.games.map(g=>`<option value="${g.id}">${escapeHtml(g.gameId)} ${escapeHtml(g.nameEn)}</option>`).join('')}</select></div>`+fieldHtml(['url','文件連結','url'])+fieldHtml(['note','備註','textarea']),async(form)=>{const data=values(form),id=uid('document');data.updatedAt=now();data.updatedBy=actor();await collections.documents.doc(id).set(data);await logChange('CREATE_DOCUMENT',data.name,null,data,[]);closeModals();}); }

  function previewClient(client){ state.previewClientId=client.id; const rows=effectiveGames(client); $('#previewTitle').textContent=`${client.name}｜Preview OMNIPLAY Game`; $('#previewHead').innerHTML=`<tr>${customerColumns.map(([,h])=>`<th>${escapeHtml(h).replace(/\n/g,'<br>')}</th>`).join('')}<th>Source（內部）</th></tr>`; $('#previewBody').innerHTML=rows.map(({game,source})=>`<tr>${customerColumns.map(([key])=>`<td>${escapeHtml(game[key]??'')}</td>`).join('')}<td class="source-cell">${escapeHtml(source)}</td></tr>`).join('')||`<tr><td colspan="${customerColumns.length+1}" class="library-empty">此客戶目前沒有遊戲。</td></tr>`; $('#previewModal').hidden=false; }
  function exportClient(client){ if(!window.XLSX)return alert('Excel 元件尚未載入。'); const rows=effectiveGames(client).map(({game})=>Object.fromEntries(customerColumns.map(([key,label])=>[label,game[key]??'']))); const sheet=XLSX.utils.json_to_sheet(rows,{header:customerColumns.map(([,label])=>label)}); sheet['!cols']=customerColumns.map(([key])=>({wch:['nameZh','nameEn','customerNote'].includes(key)?24:16})); const book=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,'OP Game'); XLSX.writeFile(book,`${client.name} OMNIPLAY Game.xlsx`); logChange('EXPORT_CLIENT_GAME_LIST',`Client ${client.name}`,null,{gameCount:rows.length},[client]).catch(console.error); }
  function numberOrText(value){ const text=String(value??'').trim(); if(!text)return ''; const normalized=text.replace(/,/g,''); return /^-?\d+(\.\d+)?$/.test(normalized)?Number(normalized):text; }
  function sheetRowToGame(row){
    return {
      gameId:String(row[1]??'').trim(),gameVersion:String(row[2]??'').trim(),nameEn:String(row[3]??'').trim(),
      manufacturer:String(row[4]??'').trim(),denomination:String(row[5]??'').trim(),gameType:String(row[6]??'').trim(),
      lines:String(row[7]??'').trim(),betMin:numberOrText(row[8]),betMax:numberOrText(row[9]),maxPrize:numberOrText(row[10]),
      maxPrizeMultiplier:numberOrText(row[11]),jackpotGroup:String(row[12]??'').trim(),jackpotMin:String(row[13]??'').trim(),
      jackpotMax:String(row[14]??'').trim(),jackpotReserve:String(row[15]??'').trim(),jackpotIncrement:String(row[16]??'').trim(),
      totalJackpotRtp:numberOrText(row[17]),baseRtp:numberOrText(row[18]),totalPayout:numberOrText(row[19])
    };
  }
  function loadAppsScriptJsonp(feedUrl){
    return new Promise((resolve,reject)=>{
      const callbackName=`__omniplayGameListSync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement('script');
      const cleanup=()=>{clearTimeout(timer);script.remove();delete window[callbackName];};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Apps Script 同步服務逾時，請確認已部署支援 JSONP 的最新版本。'));},20000);
      window[callbackName]=(payload)=>{cleanup();resolve(payload);};
      script.onerror=()=>{cleanup();reject(new Error('Apps Script 同步服務無法載入，請確認已重新部署最新版本。'));};
      const separator=feedUrl.includes('?')?'&':'?';
      script.src=`${feedUrl}${separator}callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }
  async function fetchGoogleMasterRows(){
    const feedUrl=gameListFeedUrl();
    if(!feedUrl)throw new Error('尚未設定 Game List Apps Script 同步服務。');
    const payload=await loadAppsScriptJsonp(feedUrl);
    if(!payload?.success||!Array.isArray(payload.rows))throw new Error(payload?.error||'Apps Script 回傳格式錯誤');
    const rows=payload.rows.filter((row)=>String(row?.[1]??'').trim());
    if(!rows.length)throw new Error('GameList 第 3 列起沒有可同步的 GAME ID。');
    return rows;
  }
  async function syncGoogleMaster(reason='manual'){
    if(!canEdit()){if(reason==='manual')alert('你沒有同步藏經閣的權限。');return;}
    if(syncInFlight)return;
    syncInFlight=true;
    const id=uid('sync'),job=collections.syncJobs.doc(id),startedAt=now();
    try{
      await job.set({type:'GOOGLE_SHEETS_GAME_MASTER_RUN',status:'processing',reason,spreadsheetId:googleSheets.masterSpreadsheetId,sheetName:googleSheets.masterSheetName,customerTemplate:{spreadsheetId:googleSheets.customerTemplateSpreadsheetId,sheetName:googleSheets.customerTemplateSheetName,mode:'columns_only'},upsertKey:'GAME ID',missingRowPolicy:'keep_and_flag',requestedBy:actor(),createdAt:startedAt,updatedAt:startedAt});
      const rows=await fetchGoogleMasterRows();
      let imported=0;
      for(let offset=0;offset<rows.length;offset+=40){
        const chunk=rows.slice(offset,offset+40);
        await Promise.all(chunk.map(async(row)=>{
          const game=sheetRowToGame(row);
          const docId=`game_${game.gameId.replace(/[^A-Za-z0-9_-]/g,'_')}`;
          await collections.games.doc(docId).set({...game,source:'Google Sheets',sourceSpreadsheetId:googleSheets.masterSpreadsheetId,sourceSheetName:googleSheets.masterSheetName,syncedAt:now(),updatedAt:now(),updatedBy:actor()},{merge:true});
          imported+=1;
        }));
      }
      const completedAt=now();
      await job.set({status:'completed',importedRows:imported,completedAt,updatedAt:completedAt},{merge:true});
      await logChange('GOOGLE_SHEETS_SYNC_COMPLETED','Game List_Online',null,{spreadsheetId:googleSheets.masterSpreadsheetId,sheetName:googleSheets.masterSheetName,mode:reason,importedRows:imported},[]);
      if(reason==='manual')alert(`同步完成，共匯入 ${imported} 款遊戲。`);
    }catch(error){
      const failedAt=now();
      await job.set({status:'failed',error:String(error?.message||error),updatedAt:failedAt,completedAt:failedAt},{merge:true}).catch(()=>{});
      if(reason==='manual')alert(`同步失敗：${error?.message||'未知錯誤'}`);
      throw error;
    }finally{syncInFlight=false;}
  }

  document.addEventListener('click',(event)=>{ const tab=event.target.closest('[data-tab]'); if(tab){document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('is-active',x===tab));document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('is-active',x.dataset.panel===tab.dataset.tab));return;} if(event.target.closest('[data-close-modal]')){closeModals();return;} const button=event.target.closest('[data-action]'); if(!button)return; const id=button.dataset.id; ({'edit-game':()=>editGame(gameById(id)),'game-groups':()=>editGameGroups(gameById(id)),'edit-group':()=>editGroup(groupById(id)),'edit-client':()=>editClient(clientById(id)),'preview-client':()=>previewClient(clientById(id))}[button.dataset.action]||(()=>{}))(); });
  $('#newGroupButton').onclick=()=>editGroup(); $('#newClientButton').onclick=()=>editClient(); $('#newDocumentButton').onclick=editDocument; $('#gameSearch').oninput=renderGames; $('#gameStatusFilter').onchange=renderGames; $('#syncMasterButton').onclick=async()=>{try{if(!gameListFeedUrl()){alert('同步服務尚未完成部署，請由系統管理員設定 Apps Script 服務網址。');return;}await syncGoogleMaster('manual');}catch(err){console.error('立即同步失敗',err);}}; $('#cancelImpactButton').onclick=closeModals; $('#confirmImpactButton').onclick=async()=>{const save=state.pendingSave;if(save){state.pendingSave=null;await save();}}; $('#exportClientButton').onclick=()=>{const client=clientById(state.previewClientId);if(client)exportClient(client);};
  document.querySelectorAll('.library-modal').forEach((modal)=>modal.addEventListener('click',(e)=>{if(e.target===modal)closeModals();}));
  window.permissionReady?.then(()=>{ if(!canEdit()) document.querySelectorAll('#newGroupButton,#newClientButton,#newDocumentButton,#syncMasterButton').forEach(b=>b.hidden=true); });
  Object.keys(collections).forEach(subscribe);
})();

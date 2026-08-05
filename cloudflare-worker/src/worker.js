const JSON_HEADERS={"content-type":"application/json;charset=UTF-8"};
const corsHeaders=origin=>({"access-control-allow-origin":origin==="https://gb168168.github.io"?origin:"https://gb168168.github.io","access-control-allow-headers":"authorization,content-type,x-admin-key","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","vary":"Origin"});
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});
const telegram=(token,method,body={})=>fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:JSON_HEADERS,body:JSON.stringify(body)}).then(r=>r.json());
const senderOf=m=>({creatorId:String(m.from?.id||""),creatorName:[m.from?.first_name,m.from?.last_name].filter(Boolean).join(" "),creatorUsername:m.from?.username||""});
const originOf=m=>{const o=m.forward_origin||{};return{forwardType:o.type||"",forwardSourceName:o.chat?.title||o.sender_user_name||[o.sender_user?.first_name,o.sender_user?.last_name].filter(Boolean).join(" "),forwardSourceId:String(o.chat?.id||o.sender_user?.id||"")}};
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sign(value,secret){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(value)))}
async function validSignature(value,signature,secret){return (await sign(value,secret))===signature}
const authOk=(req,env)=>req.headers.get("authorization")===`Bearer ${env.INBOX_API_TOKEN}`;
const adminOk=(req,env)=>Boolean(env.INBOX_ADMIN_TOKEN)&&req.headers.get("x-admin-key")===env.INBOX_ADMIN_TOKEN;
async function finish(env,message){
  const userId=String(message.from.id);
  const draft=await env.DB.prepare("SELECT * FROM drafts WHERE user_id=?").bind(userId).first();
  const rows=(await env.DB.prepare("SELECT sequence,payload FROM draft_messages WHERE user_id=? ORDER BY sequence").bind(userId).all()).results||[];
  if(!draft||!rows.length){return {chat_id:message.chat.id,text:"目前沒有暫存訊息。請先轉傳訊息，再輸入「執行」。"}}
  await env.DB.prepare("INSERT INTO counters(name,value) VALUES('conversations',1) ON CONFLICT(name) DO UPDATE SET value=value+1").run();
  const counter=await env.DB.prepare("SELECT value FROM counters WHERE name='conversations'").first();
  const displayId=`CONV-${String(counter.value).padStart(6,"0")}`,id=crypto.randomUUID(),creator=senderOf(message),now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO conversations(id,display_id,source,source_label,created_at,creator_id,creator_name,creator_username,message_count,analyzed,imported,archived,raw_immutable) VALUES(?,?,?,?,?,?,?,?,?,0,0,0,1)").bind(id,displayId,"telegram","Telegram",now,creator.creatorId,creator.creatorName,creator.creatorUsername,rows.length).run();
  for(let offset=0;offset<rows.length;offset+=90){
    const statements=rows.slice(offset,offset+90).map(row=>env.DB.prepare("INSERT INTO messages(conversation_id,sequence,payload) VALUES(?,?,?)").bind(id,row.sequence,row.payload));
    await env.DB.batch(statements);
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM draft_messages WHERE user_id=?").bind(userId),env.DB.prepare("DELETE FROM drafts WHERE user_id=?").bind(userId)]);
  return {chat_id:message.chat.id,text:`${displayId} 已建立，共 ${rows.length} 則訊息。暫存已清空。`};
}
async function handleTelegram(env,update){
  const m=update?.message;if(!m?.from?.id)return;
  const command=String(m.text||"").trim();
  if(["執行","完成","/done"].includes(command))return finish(env,m);
  const userId=String(m.from.id),sequence=Number(update.update_id||Date.now()),creator=senderOf(m),origin=originOf(m);
  let mediaType="",fileId="",fileName="",mimeType="";
  if(m.photo?.length){mediaType="photo";fileId=m.photo[m.photo.length-1].file_id;fileName=`photo_${sequence}.jpg`;mimeType="image/jpeg"}
  else if(m.video){mediaType="video";fileId=m.video.file_id;fileName=m.video.file_name||`video_${sequence}.mp4`;mimeType=m.video.mime_type||"video/mp4"}
  else if(m.document){mediaType="document";fileId=m.document.file_id;fileName=m.document.file_name||`file_${sequence}`;mimeType=m.document.mime_type||"application/octet-stream"}
  const payload={sequence,text:m.text||m.caption||"",sentAt:new Date((m.forward_origin?.date||m.date||Math.floor(Date.now()/1000))*1000).toISOString(),senderId:String(m.from.id),senderName:creator.creatorName,senderUsername:creator.creatorUsername,...origin,mediaType,fileId,fileName,mimeType,telegramMessageId:m.message_id};
  await env.DB.batch([
    env.DB.prepare("INSERT INTO drafts(user_id,chat_id,creator_name,creator_username,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,creator_name=excluded.creator_name,creator_username=excluded.creator_username,updated_at=excluded.updated_at").bind(userId,String(m.chat.id),creator.creatorName,creator.creatorUsername,new Date().toISOString()),
    env.DB.prepare("INSERT OR REPLACE INTO draft_messages(user_id,sequence,payload) VALUES(?,?,?)").bind(userId,sequence,JSON.stringify(payload))
  ]);
  return {chat_id:m.chat.id,text:"已暫存。完成轉傳後請輸入「執行」。"};
}

const teamsIngestOk=(req,env)=>Boolean(env.TEAMS_INGEST_TOKEN)&&req.headers.get("authorization")===`Bearer ${env.TEAMS_INGEST_TOKEN}`;
async function draftStats(env,userKey){
  const rows=(await env.DB.prepare("SELECT payload FROM draft_messages WHERE user_id=?").bind(userKey).all()).results||[];
  let attachmentCount=0;
  for(const row of rows){try{const m=JSON.parse(row.payload);attachmentCount+=(m.attachments||[]).length;if(m.mediaType)attachmentCount++}catch{}}
  return {rows,messageCount:rows.length,attachmentCount};
}
async function createConversationFromDraft(env,body){
  const {rows,messageCount}=await draftStats(env,body.userKey);
  if(!messageCount)return {empty:true,messageCount:0,attachmentCount:0};
  await env.DB.prepare("INSERT INTO counters(name,value) VALUES('conversations',1) ON CONFLICT(name) DO UPDATE SET value=value+1").run();
  const counter=await env.DB.prepare("SELECT value FROM counters WHERE name='conversations'").first();
  const displayId=`CONV-${String(counter.value).padStart(6,"0")}`,id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO conversations(id,display_id,source,source_label,created_at,creator_id,creator_name,creator_username,message_count,analyzed,imported,archived,raw_immutable) VALUES(?,?,?,?,?,?,?,?,?,0,0,0,1)")
    .bind(id,displayId,body.source,body.sourceLabel,now,body.creatorId||"",body.creatorName||"",body.creatorUsername||"",messageCount).run();
  const ordered=(await env.DB.prepare("SELECT sequence,payload FROM draft_messages WHERE user_id=? ORDER BY sequence").bind(body.userKey).all()).results||[];
  for(let offset=0;offset<ordered.length;offset+=90){
    await env.DB.batch(ordered.slice(offset,offset+90).map(row=>env.DB.prepare("INSERT INTO messages(conversation_id,sequence,payload) VALUES(?,?,?)").bind(id,row.sequence,row.payload)));
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM draft_messages WHERE user_id=?").bind(body.userKey),env.DB.prepare("DELETE FROM drafts WHERE user_id=?").bind(body.userKey)]);
  return {empty:false,id,displayId,messageCount};
}
async function internalApi(req,env,url){
  if(!teamsIngestOk(req,env))return json({error:"Unauthorized"},401);
  const body=await req.json();
  if(body.source!=="teams"||!body.userKey?.startsWith("teams:"))return json({error:"Invalid Teams source"},400);
  if(url.pathname==="/internal/conversations/ingest"){
    const payload=body.payload||{},last=await env.DB.prepare("SELECT MAX(sequence) AS value FROM draft_messages WHERE user_id=?").bind(body.userKey).first(),sequence=Math.max(Number(payload.sequence||Date.now()),Number(last?.value||0)+1),now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO drafts(user_id,chat_id,creator_name,creator_username,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,creator_name=excluded.creator_name,creator_username=excluded.creator_username,updated_at=excluded.updated_at").bind(body.userKey,String(body.chatId||""),body.creatorName||"",body.creatorUsername||"",now),
      env.DB.prepare("INSERT OR REPLACE INTO draft_messages(user_id,sequence,payload) VALUES(?,?,?)").bind(body.userKey,sequence,JSON.stringify({...payload,sequence}))
    ]);
    return json(await draftStats(env,body.userKey));
  }
  if(url.pathname==="/internal/conversations/command"){
    const stats=await draftStats(env,body.userKey);
    if(body.command==="status")return json(stats);
    if(body.command==="cancel"){
      await env.DB.batch([env.DB.prepare("DELETE FROM draft_messages WHERE user_id=?").bind(body.userKey),env.DB.prepare("DELETE FROM drafts WHERE user_id=?").bind(body.userKey)]);
      return json(stats);
    }
    if(body.command==="execute")return json(await createConversationFromDraft(env,body));
  }
  return json({error:"Not found"},404);
}
async function mediaResponse(req,env,url,fileId){
  const exp=url.searchParams.get("exp")||"",sig=url.searchParams.get("sig")||"";
  if(!exp||Date.now()>Number(exp)*1000||!await validSignature(`${fileId}|${exp}`,sig,env.TELEGRAM_WEBHOOK_SECRET))return new Response("Forbidden",{status:403});
  const meta=await telegram(env.TELEGRAM_BOT_TOKEN,"getFile",{file_id:fileId});if(!meta.ok)return new Response("Not found",{status:404});
  const upstream=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  return new Response(upstream.body,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")||"application/octet-stream","cache-control":"private,max-age=300"}});
}
async function api(req,env,url,origin){
  const cors=corsHeaders(origin);if(!authOk(req,env))return json({error:"Unauthorized"},401,cors);
  const parts=url.pathname.split("/").filter(Boolean);
  if(req.method==="GET"&&parts.join("/")==="api/conversations"){
    const rows=(await env.DB.prepare("SELECT * FROM conversations ORDER BY created_at DESC LIMIT 200").all()).results||[];
    return json(rows.map(r=>({id:r.id,displayId:r.display_id,source:r.source,sourceLabel:r.source_label,createdAt:r.created_at,creatorId:r.creator_id,creatorName:r.creator_name,creatorUsername:r.creator_username,messageCount:r.message_count,analyzed:!!r.analyzed,imported:!!r.imported,archived:!!r.archived,analysis:r.analysis_json?JSON.parse(r.analysis_json):null})),200,cors);
  }
  if(req.method==="GET"&&parts[0]==="api"&&parts[1]==="conversations"&&parts[3]==="messages"){
    const rows=(await env.DB.prepare("SELECT sequence,payload FROM messages WHERE conversation_id=? ORDER BY sequence").bind(parts[2]).all()).results||[],exp=Math.floor(Date.now()/1000)+1800,out=[];
    for(const row of rows){const m=JSON.parse(row.payload);if(m.fileId&&!m.mediaUrl&&!m.attachments?.length){const sig=await sign(`${m.fileId}|${exp}`,env.TELEGRAM_WEBHOOK_SECRET);m.mediaUrl=`${url.origin}/media/${encodeURIComponent(m.fileId)}?exp=${exp}&sig=${encodeURIComponent(sig)}&name=${encodeURIComponent(m.fileName||"file")}`}out.push(m)}
    return json(out,200,cors);
  }
  if(req.method==="DELETE"&&parts[0]==="api"&&parts[1]==="conversations"&&parts.length===3){
    if(!adminOk(req,env))return json({error:"Admin only"},403,cors);
    const exists=await env.DB.prepare("SELECT display_id FROM conversations WHERE id=?").bind(parts[2]).first();
    if(!exists)return json({error:"Conversation not found"},404,cors);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM messages WHERE conversation_id=?").bind(parts[2]),
      env.DB.prepare("DELETE FROM conversations WHERE id=?").bind(parts[2])
    ]);
    return json({ok:true,deletedId:parts[2],displayId:exists.display_id},200,cors);
  }
  if(req.method==="PATCH"&&parts[0]==="api"&&parts[1]==="conversations"&&parts.length===3){
    const body=await req.json(),sets=[],values=[];
    if("analysis"in body){sets.push("analysis_json=?");values.push(JSON.stringify(body.analysis))}
    for(const [key,col] of [["analyzed","analyzed"],["imported","imported"],["archived","archived"],["importDrafted","import_drafted"]])if(key in body){sets.push(`${col}=?`);values.push(body[key]?1:0)}
    if("importedLogId"in body){sets.push("imported_log_id=?");values.push(String(body.importedLogId||""))}
    if(!sets.length)return json({error:"No supported fields"},400,cors);
    sets.push("updated_at=?");values.push(new Date().toISOString(),parts[2]);await env.DB.prepare(`UPDATE conversations SET ${sets.join(",")} WHERE id=?`).bind(...values).run();
    return json({ok:true},200,cors);
  }
  return json({error:"Not found"},404,cors);
}

const REMINDER_MODULES={
  log:{collection:"log",title:"日誌提醒",path:"work/log.html"},
  log_new:{collection:"log_new",title:"日誌 NEW 提醒",path:"work/log-new.html"},
  handover:{collection:"handover",title:"交接提醒",path:"work/handover.html"},
  report:{collection:"report",title:"提報提醒",path:"work/report.html"},
  tracking:{collection:"tracking",title:"對接追蹤提醒",path:"work/tracking.html"}
};
let firebaseAccessTokenCache=null;
const encodeText=value=>b64(new TextEncoder().encode(String(value)));
const pemKey=async pem=>{
  const body=String(pem||"").replace(/\\n/g,"\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  if(!body)throw new Error("FIREBASE_PRIVATE_KEY is not configured");
  const bytes=Uint8Array.from(atob(body),char=>char.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8",bytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
};
async function firebaseAccessToken(env){
  if(firebaseAccessTokenCache&&firebaseAccessTokenCache.expiresAt>Date.now()+60000)return firebaseAccessTokenCache.value;
  if(!env.FIREBASE_CLIENT_EMAIL||!env.FIREBASE_PRIVATE_KEY)throw new Error("Firebase service account secrets are not configured");
  const now=Math.floor(Date.now()/1000),header=encodeText(JSON.stringify({alg:"RS256",typ:"JWT"})),claims=encodeText(JSON.stringify({
    iss:env.FIREBASE_CLIENT_EMAIL,
    sub:env.FIREBASE_CLIENT_EMAIL,
    aud:"https://oauth2.googleapis.com/token",
    scope:"https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
    iat:now,
    exp:now+3600
  }));
  const unsigned=`${header}.${claims}`,key=await pemKey(env.FIREBASE_PRIVATE_KEY),signature=b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned)));
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${unsigned}.${signature}`})});
  if(!response.ok)throw new Error(`Firebase OAuth failed (${response.status}): ${await response.text()}`);
  const result=await response.json();
  firebaseAccessTokenCache={value:result.access_token,expiresAt:Date.now()+Number(result.expires_in||3600)*1000};
  return firebaseAccessTokenCache.value;
}
const firestoreValue=value=>{
  if(!value)return null;
  if("nullValue"in value)return null;
  if("stringValue"in value)return value.stringValue;
  if("timestampValue"in value)return value.timestampValue;
  if("booleanValue"in value)return value.booleanValue;
  if("integerValue"in value)return Number(value.integerValue);
  if("doubleValue"in value)return Number(value.doubleValue);
  if(value.arrayValue)return (value.arrayValue.values||[]).map(firestoreValue);
  if(value.mapValue)return firestoreFields(value.mapValue.fields||{});
  return null;
};
const firestoreFields=fields=>Object.fromEntries(Object.entries(fields||{}).map(([key,value])=>[key,firestoreValue(value)]));
async function listFirestoreCollection(env,collection,accessToken){
  const project=env.FIREBASE_PROJECT_ID||"omniplay-csr-support",documents=[];
  let pageToken="";
  do{
    const endpoint=new URL(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/${encodeURIComponent(collection)}`);
    endpoint.searchParams.set("pageSize","1000");
    if(pageToken)endpoint.searchParams.set("pageToken",pageToken);
    const response=await fetch(endpoint,{headers:{authorization:`Bearer ${accessToken}`}});
    if(!response.ok)throw new Error(`Firestore ${collection} failed (${response.status}): ${await response.text()}`);
    const result=await response.json();documents.push(...(result.documents||[]));pageToken=result.nextPageToken||"";
  }while(pageToken);
  return documents.map(document=>({id:document.name.split("/").pop(),...firestoreFields(document.fields)}));
}
const reminderDate=value=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null};
const reminderBody=(record,module)=>{
  if(module==="handover")return String(record.item||record.note||record.serial||"交接事項");
  const parts=[record.serial,record.customer,record.issue||record.description||record.note||record.subject].map(value=>String(value||"").trim()).filter(Boolean);
  return parts.join("｜")||"提醒時間到了";
};
const normalizedJob=(module,id,record)=>{
  const config=REMINDER_MODULES[module],at=reminderDate(record.reminder_at??record.reminderTime);
  if(!config||!at)return null;
  return {source:"firestore",module,collection:config.collection,id:String(id),at,title:config.title,body:reminderBody(record,module),url:`https://gb168168.github.io/OMNIPLAY-CSR-Support/${config.path}?id=${encodeURIComponent(id)}`};
};
async function loadFirestoreReminderJobs(env){
  const accessToken=await firebaseAccessToken(env),groups=await Promise.all(Object.entries(REMINDER_MODULES).map(async([module,config])=>(await listFirestoreCollection(env,config.collection,accessToken)).map(record=>normalizedJob(module,record.id,record)).filter(Boolean)));
  return groups.flat();
}
async function loadNasReminderJobs(env){
  if(!env.NAS_REMINDER_API_URL)throw new Error("NAS_REMINDER_API_URL is not configured");
  const response=await fetch(env.NAS_REMINDER_API_URL,{headers:env.NAS_REMINDER_API_TOKEN?{authorization:`Bearer ${env.NAS_REMINDER_API_TOKEN}`}:{}});
  if(!response.ok)throw new Error(`NAS reminder API failed (${response.status})`);
  const result=await response.json();
  return (Array.isArray(result)?result:result.jobs||[]).map(item=>{
    const config=REMINDER_MODULES[item.module]||{};
    return {source:"nas",module:item.module||"nas",collection:item.collection||item.module||"nas",id:String(item.id),at:reminderDate(item.reminder_at||item.reminderAt),title:item.title||config.title||"OMNIPLAY 提醒",body:item.body||item.text||"提醒時間到了",url:item.url||`https://gb168168.github.io/OMNIPLAY-CSR-Support/${config.path||"index.html"}?id=${encodeURIComponent(item.id)}`};
  }).filter(item=>item.id&&item.at);
}
const loadReminderJobs=env=>String(env.REMINDER_SOURCE||"firestore").toLowerCase()==="nas"?loadNasReminderJobs(env):loadFirestoreReminderJobs(env);
async function ensureReminderTables(env){
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS notification_tokens(token TEXT PRIMARY KEY,module TEXT,user_agent TEXT,updated_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sent_reminders(reminder_key TEXT PRIMARY KEY,source TEXT NOT NULL,collection_name TEXT NOT NULL,record_id TEXT NOT NULL,reminder_at TEXT NOT NULL,sent_at TEXT NOT NULL,token_count INTEGER NOT NULL DEFAULT 0)")
  ]);
}
async function registerReminderToken(req,env,origin){
  const cors=corsHeaders(origin);
  if(origin!=="https://gb168168.github.io")return json({error:"Forbidden origin"},403,cors);
  const body=await req.json(),token=String(body.token||"").trim();
  if(token.length<40||token.length>4096)return json({error:"Invalid token"},400,cors);
  await ensureReminderTables(env);
  await env.DB.prepare("INSERT INTO notification_tokens(token,module,user_agent,updated_at) VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET module=excluded.module,user_agent=excluded.user_agent,updated_at=excluded.updated_at").bind(token,String(body.module||"").slice(0,50),String(body.userAgent||"").slice(0,500),new Date().toISOString()).run();
  return json({ok:true},200,cors);
}
const isInvalidFcmToken=result=>JSON.stringify(result||{}).includes("UNREGISTERED")||JSON.stringify(result||{}).includes("registration-token-not-registered");
async function sendFcm(env,accessToken,token,job){
  const project=env.FIREBASE_PROJECT_ID||"omniplay-csr-support";
  const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`,{method:"POST",headers:{authorization:`Bearer ${accessToken}`,"content-type":"application/json"},body:JSON.stringify({message:{token,notification:{title:job.title,body:job.body},data:{url:job.url,module:job.module,recordId:job.id},webpush:{headers:{Urgency:"high"},notification:{icon:"https://gb168168.github.io/OMNIPLAY-CSR-Support/assets/icon-192.png",badge:"https://gb168168.github.io/OMNIPLAY-CSR-Support/assets/icon-192.png",requireInteraction:true,tag:`csr-${job.module}-${job.id}`},fcm_options:{link:job.url}}}})});
  const result=await response.json().catch(()=>({}));
  return {ok:response.ok,invalid:isInvalidFcmToken(result),status:response.status,result};
}
async function runReminderPush(env){
  await ensureReminderTables(env);
  const now=Date.now(),oldest=now-7*86400000,jobs=(await loadReminderJobs(env)).filter(job=>job.at.getTime()<=now&&job.at.getTime()>=oldest),tokens=(await env.DB.prepare("SELECT token FROM notification_tokens").all()).results||[];
  if(!tokens.length)return {ok:true,due:jobs.length,sent:0,devices:0,message:"No registered devices"};
  const accessToken=await firebaseAccessToken(env);let sent=0;
  for(const job of jobs){
    const reminderKey=`${job.source}:${job.collection}:${job.id}:${job.at.toISOString()}`;
    if(await env.DB.prepare("SELECT 1 FROM sent_reminders WHERE reminder_key=?").bind(reminderKey).first())continue;
    const results=[];
    for(let offset=0;offset<tokens.length;offset+=20)results.push(...await Promise.all(tokens.slice(offset,offset+20).map(row=>sendFcm(env,accessToken,row.token,job).then(result=>({token:row.token,...result})))));
    const invalid=results.filter(result=>result.invalid);
    if(invalid.length)await env.DB.batch(invalid.map(result=>env.DB.prepare("DELETE FROM notification_tokens WHERE token=?").bind(result.token)));
    const delivered=results.filter(result=>result.ok).length;
    if(delivered){await env.DB.prepare("INSERT INTO sent_reminders(reminder_key,source,collection_name,record_id,reminder_at,sent_at,token_count) VALUES(?,?,?,?,?,?,?)").bind(reminderKey,job.source,job.collection,job.id,job.at.toISOString(),new Date().toISOString(),delivered).run();sent+=delivered;}
  }
  await env.DB.prepare("DELETE FROM sent_reminders WHERE sent_at < ?").bind(new Date(now-90*86400000).toISOString()).run();
  return {ok:true,due:jobs.length,sent,devices:tokens.length,source:env.REMINDER_SOURCE||"firestore"};
}

export default{async fetch(req,env,ctx){
  const url=new URL(req.url),origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(origin)});
  if(url.pathname==="/api/reminder-tokens"&&req.method==="POST")return registerReminderToken(req,env,origin);
  if(url.pathname==="/api/reminders/status"&&req.method==="GET")return json({ok:true,source:env.REMINDER_SOURCE||"firestore",firebaseConfigured:Boolean(env.FIREBASE_CLIENT_EMAIL&&env.FIREBASE_PRIVATE_KEY),nasConfigured:Boolean(env.NAS_REMINDER_API_URL)});
  if(url.pathname.startsWith("/internal/conversations/")&&req.method==="POST")return internalApi(req,env,url);
  if(url.pathname==="/telegram"&&req.method==="POST"){
    if(req.headers.get("x-telegram-bot-api-secret-token")!==env.TELEGRAM_WEBHOOK_SECRET)return new Response("Forbidden",{status:403});
    const update=await req.json(),reply=await handleTelegram(env,update);return reply?json({method:"sendMessage",...reply}):new Response("OK");
  }
  if(url.pathname.startsWith("/media/")&&req.method==="GET")return mediaResponse(req,env,url,decodeURIComponent(url.pathname.slice(7)));
  if(url.pathname.startsWith("/api/"))return api(req,env,url,origin);
  return new Response("OMNIPLAY Conversation Worker",{status:200});
},async scheduled(event,env,ctx){ctx.waitUntil(runReminderPush(env).then(result=>console.log("reminder push",result)).catch(error=>console.error("reminder push failed",error)));}};

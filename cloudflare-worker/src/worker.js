const JSON_HEADERS={"content-type":"application/json;charset=UTF-8"};
const corsHeaders=origin=>({"access-control-allow-origin":origin==="https://gb168168.github.io"?origin:"https://gb168168.github.io","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,PATCH,OPTIONS","vary":"Origin"});
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});
const telegram=(token,method,body={})=>fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:JSON_HEADERS,body:JSON.stringify(body)}).then(r=>r.json());
const senderOf=m=>({creatorId:String(m.from?.id||""),creatorName:[m.from?.first_name,m.from?.last_name].filter(Boolean).join(" "),creatorUsername:m.from?.username||""});
const originOf=m=>{const o=m.forward_origin||{};return{forwardType:o.type||"",forwardSourceName:o.chat?.title||o.sender_user_name||[o.sender_user?.first_name,o.sender_user?.last_name].filter(Boolean).join(" "),forwardSourceId:String(o.chat?.id||o.sender_user?.id||"")}};
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sign(value,secret){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(value)))}
async function validSignature(value,signature,secret){return (await sign(value,secret))===signature}
const authOk=(req,env)=>req.headers.get("authorization")===`Bearer ${env.INBOX_API_TOKEN}`;
async function finish(env,message){
  const userId=String(message.from.id);
  const draft=await env.DB.prepare("SELECT * FROM drafts WHERE user_id=?").bind(userId).first();
  const rows=(await env.DB.prepare("SELECT sequence,payload FROM draft_messages WHERE user_id=? ORDER BY sequence").bind(userId).all()).results||[];
  if(!draft||!rows.length){await telegram(env.TELEGRAM_BOT_TOKEN,"sendMessage",{chat_id:message.chat.id,text:"目前沒有暫存訊息。請先轉傳訊息，再輸入「執行」。"});return}
  await env.DB.prepare("INSERT INTO counters(name,value) VALUES('conversations',1) ON CONFLICT(name) DO UPDATE SET value=value+1").run();
  const counter=await env.DB.prepare("SELECT value FROM counters WHERE name='conversations'").first();
  const displayId=`CONV-${String(counter.value).padStart(6,"0")}`,id=crypto.randomUUID(),creator=senderOf(message),now=new Date().toISOString();
  const statements=[env.DB.prepare("INSERT INTO conversations(id,display_id,source,source_label,created_at,creator_id,creator_name,creator_username,message_count,analyzed,imported,archived,raw_immutable) VALUES(?,?,?,?,?,?,?,?,?,0,0,0,1)").bind(id,displayId,"telegram","Telegram",now,creator.creatorId,creator.creatorName,creator.creatorUsername,rows.length)];
  for(const row of rows)statements.push(env.DB.prepare("INSERT INTO messages(conversation_id,sequence,payload) VALUES(?,?,?)").bind(id,row.sequence,row.payload));
  statements.push(env.DB.prepare("DELETE FROM draft_messages WHERE user_id=?").bind(userId),env.DB.prepare("DELETE FROM drafts WHERE user_id=?").bind(userId));
  await env.DB.batch(statements);
  await telegram(env.TELEGRAM_BOT_TOKEN,"sendMessage",{chat_id:message.chat.id,text:`${displayId} 已建立，共 ${rows.length} 則訊息。暫存已清空。`});
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
  const payload={sequence,text:m.text||m.caption||"",sentAt:new Date((m.date||Math.floor(Date.now()/1000))*1000).toISOString(),senderId:String(m.from.id),senderName:creator.creatorName,senderUsername:creator.creatorUsername,...origin,mediaType,fileId,fileName,mimeType,telegramMessageId:m.message_id};
  await env.DB.batch([
    env.DB.prepare("INSERT INTO drafts(user_id,chat_id,creator_name,creator_username,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,creator_name=excluded.creator_name,creator_username=excluded.creator_username,updated_at=excluded.updated_at").bind(userId,String(m.chat.id),creator.creatorName,creator.creatorUsername,new Date().toISOString()),
    env.DB.prepare("INSERT OR REPLACE INTO draft_messages(user_id,sequence,payload) VALUES(?,?,?)").bind(userId,sequence,JSON.stringify(payload))
  ]);
  await telegram(env.TELEGRAM_BOT_TOKEN,"sendMessage",{chat_id:m.chat.id,text:"已暫存。完成轉傳後請輸入「執行」。"});
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
    for(const row of rows){const m=JSON.parse(row.payload);if(m.fileId){const sig=await sign(`${m.fileId}|${exp}`,env.TELEGRAM_WEBHOOK_SECRET);m.mediaUrl=`${url.origin}/media/${encodeURIComponent(m.fileId)}?exp=${exp}&sig=${encodeURIComponent(sig)}&name=${encodeURIComponent(m.fileName||"file")}`}out.push(m)}
    return json(out,200,cors);
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
export default{async fetch(req,env,ctx){
  const url=new URL(req.url),origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(origin)});
  if(url.pathname==="/telegram"&&req.method==="POST"){
    if(req.headers.get("x-telegram-bot-api-secret-token")!==env.TELEGRAM_WEBHOOK_SECRET)return new Response("Forbidden",{status:403});
    const update=await req.json();ctx.waitUntil(handleTelegram(env,update).catch(console.error));return new Response("OK");
  }
  if(url.pathname.startsWith("/media/")&&req.method==="GET")return mediaResponse(req,env,url,decodeURIComponent(url.pathname.slice(7)));
  if(url.pathname.startsWith("/api/"))return api(req,env,url,origin);
  return new Response("OMNIPLAY Conversation Worker",{status:200});
}};
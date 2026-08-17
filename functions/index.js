const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
admin.initializeApp();
const {createTeamsBotHandler}=require('./teams-bot');
const BOT_TOKEN=defineSecret('TELEGRAM_BOT_TOKEN');
const WEBHOOK_SECRET=defineSecret('TELEGRAM_WEBHOOK_SECRET');
const db=admin.firestore(),bucket=admin.storage().bucket();
const api=(token,method,body={})=>fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
const safe=v=>String(v||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
async function storeMedia(token,fileId,path,mime){const meta=await api(token,'getFile',{file_id:fileId});if(!meta.ok)throw new Error('Telegram getFile failed');const res=await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);if(!res.ok)throw new Error('Telegram download failed');const buf=Buffer.from(await res.arrayBuffer());const f=bucket.file(path);await f.save(buf,{metadata:{contentType:mime||res.headers.get('content-type')||'application/octet-stream'}});return path;}
const senderOf=m=>({creatorId:String(m.from?.id||''),creatorName:[m.from?.first_name,m.from?.last_name].filter(Boolean).join(' '),creatorUsername:m.from?.username||''});
const originOf=m=>{const o=m.forward_origin||{};return{forwardType:o.type||'',forwardSourceName:o.chat?.title||o.sender_user_name||[o.sender_user?.first_name,o.sender_user?.last_name].filter(Boolean).join(' '),forwardSourceId:String(o.chat?.id||o.sender_user?.id||'')};};
async function finish(token,message){const userId=String(message.from.id),draftRef=db.collection('telegram_drafts').doc(userId),draft=await draftRef.get();if(!draft.exists){await api(token,'sendMessage',{chat_id:message.chat.id,text:'目前沒有暫存訊息。請先轉傳訊息，再輸入「執行」。'});return;}const msgSnap=await draftRef.collection('messages').orderBy('sequence').get();if(msgSnap.empty){await api(token,'sendMessage',{chat_id:message.chat.id,text:'目前沒有暫存訊息。'});return;}const counterRef=db.collection('system_counters').doc('conversations');const displayId=await db.runTransaction(async tx=>{const s=await tx.get(counterRef),n=(s.data()?.value||0)+1;tx.set(counterRef,{value:n},{merge:true});return `CONV-${String(n).padStart(6,'0')}`;});const conversationRef=db.collection('conversations').doc(),creator=senderOf(message);await conversationRef.set({displayId,source:'telegram',sourceLabel:'Telegram',createdAt:admin.firestore.FieldValue.serverTimestamp(),...creator,messageCount:msgSnap.size,analyzed:false,imported:false,archived:false,rawImmutable:true});for(let offset=0;offset<msgSnap.docs.length;offset+=200){const batch=db.batch();msgSnap.docs.slice(offset,offset+200).forEach(doc=>{batch.set(conversationRef.collection('messages').doc(doc.id),doc.data());batch.delete(doc.ref);});await batch.commit();}await draftRef.delete();await api(token,'sendMessage',{chat_id:message.chat.id,text:`${displayId} 已建立，共 ${msgSnap.size} 則訊息。暫存已清空。`});}
exports.telegramWebhook=onRequest({region:'asia-east1',secrets:[BOT_TOKEN,WEBHOOK_SECRET],timeoutSeconds:120,memory:'512MiB'},async(req,res)=>{if(req.method!=='POST')return res.status(405).send('Method Not Allowed');if(req.get('x-telegram-bot-api-secret-token')!==WEBHOOK_SECRET.value())return res.status(403).send('Forbidden');res.status(200).send('OK');try{const token=BOT_TOKEN.value(),m=req.body?.message;if(!m?.from?.id)return;const command=String(m.text||'').trim();if(['執行','完成','/done'].includes(command)){await finish(token,m);return;}const userId=String(m.from.id),draftRef=db.collection('telegram_drafts').doc(userId),sequence=Number(req.body.update_id||Date.now()),creator=senderOf(m),origin=originOf(m);let mediaType='',fileId='',fileName='',mimeType='';if(m.photo?.length){mediaType='photo';fileId=m.photo[m.photo.length-1].file_id;fileName=`photo_${sequence}.jpg`;mimeType='image/jpeg';}else if(m.video){mediaType='video';fileId=m.video.file_id;fileName=m.video.file_name||`video_${sequence}.mp4`;mimeType=m.video.mime_type;}else if(m.document){mediaType='document';fileId=m.document.file_id;fileName=m.document.file_name||`file_${sequence}`;mimeType=m.document.mime_type;}let storagePath='';if(fileId){storagePath=`telegram-conversations/${userId}/${sequence}-${safe(fileName)}`;await storeMedia(token,fileId,storagePath,mimeType);}await draftRef.set({...creator,chatId:String(m.chat.id),updatedAt:admin.firestore.FieldValue.serverTimestamp(),source:'telegram'},{merge:true});await draftRef.collection('messages').doc(String(sequence)).set({sequence,text:m.text||m.caption||'',sentAt:admin.firestore.Timestamp.fromMillis((m.forward_origin?.date||m.date||Math.floor(Date.now()/1000))*1000),senderId:String(m.from.id),senderName:creator.creatorName,senderUsername:creator.creatorUsername,...origin,mediaType,fileId,fileName,mimeType,storagePath,telegramMessageId:m.message_id});await api(token,'sendMessage',{chat_id:m.chat.id,text:'已暫存。完成轉傳後請輸入「執行」。'});}catch(error){console.error('telegramWebhook',error);}});

const TEAMS_APP_ID=defineSecret('TEAMS_APP_ID');
const TEAMS_APP_PASSWORD=defineSecret('TEAMS_APP_PASSWORD');
const TEAMS_TENANT_ID=defineSecret('TEAMS_TENANT_ID');
const CONVERSATION_WORKER_URL=defineSecret('CONVERSATION_WORKER_URL');
const TEAMS_INGEST_TOKEN=defineSecret('TEAMS_INGEST_TOKEN');

const EXTERNAL_LEAVE_ORIGIN='http://61.216.37.15:8080';
const EXTERNAL_LEAVE_STAFF=new Map([
  ['余中魁','中魁'],
  ['宋佳臻','佳臻'],
  ['熊茗雅','茗雅'],
  ['鄭晴心','晴心'],
  ['郭澄希','澄希']
]);
const externalLeaveCors={
  'access-control-allow-origin':'https://gb168168.github.io',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
  'vary':'Origin'
};
const externalLeaveJson=(res,status,data)=>res.status(status).set({...externalLeaveCors,'cache-control':'public,max-age=120','content-type':'application/json;charset=utf-8'}).send(JSON.stringify(data));
const externalLeaveFetch=async(path)=>{
  const response=await fetch(`${EXTERNAL_LEAVE_ORIGIN}${path}`,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Upstream ${response.status}`);
  return response.json();
};

exports.externalLeave=onRequest({region:'asia-east1',timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
  if(req.method==='OPTIONS')return res.status(204).set(externalLeaveCors).send('');
  if(req.method!=='GET')return externalLeaveJson(res,405,{error:'Method Not Allowed'});
  const month=String(req.query.month||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return externalLeaveJson(res,400,{error:'Invalid month'});
  try{
    const [employeePayload,leavePayload]=await Promise.all([
      externalLeaveFetch(`/api/employees?month=${encodeURIComponent(month)}`),
      externalLeaveFetch(`/api/leave/${encodeURIComponent(month)}`)
    ]);
    const employees=Array.isArray(employeePayload)?employeePayload:(employeePayload?.data||[]);
    const allLeaves=leavePayload?.data||{};
    const allStars=Array.isArray(leavePayload?.stars)?leavePayload.stars:[];
    const people={};
    for(const employee of employees){
      const fullName=String(employee?.name||'').trim();
      const shortName=EXTERNAL_LEAVE_STAFF.get(fullName);
      if(!shortName)continue;
      const sourceDays=allLeaves[employee.id]||allLeaves[String(employee.id)]||{};
      const days={};
      for(const [day,value] of Object.entries(sourceDays)){
        if(!value||!/^\d{1,2}$/.test(day))continue;
        const leaveTypes=Array.isArray(value.leave)?value.leave.filter(Boolean).map(item=>String(item).trim()).filter(Boolean):[];
        const label=leaveTypes.join('、');
        if(value.shift==='red')days[day]={type:'required',label};
        else if(value.shift==='black'||leaveTypes.length)days[day]={type:'leave',label};
      }
      for(const star of allStars){
        if(String(star?.employee_id)!==String(employee.id))continue;
        const day=String(star?.day||'');
        if(!/^\d{1,2}$/.test(day))continue;
        const current=days[day]||{};
        days[day]={...current,specials:[...new Set([...(current.specials||[]),'event'])]};
      }
      people[shortName]={fullName,shift:employee.shift==='晚班'?'晚':'早',days};
    }
    return externalLeaveJson(res,200,{month,people,syncedAt:new Date().toISOString()});
  }catch(error){
    console.error('externalLeave',error);
    return externalLeaveJson(res,502,{error:'External leave service unavailable'});
  }
});

exports.teamsWebhook=onRequest({
  region:'asia-east1',
  secrets:[TEAMS_APP_ID,TEAMS_APP_PASSWORD,TEAMS_TENANT_ID,CONVERSATION_WORKER_URL,TEAMS_INGEST_TOKEN],
  timeoutSeconds:120,
  memory:'512MiB'
},async(req,res)=>{
  const handler=createTeamsBotHandler({
    appId:TEAMS_APP_ID.value(),
    appPassword:TEAMS_APP_PASSWORD.value(),
    tenantId:TEAMS_TENANT_ID.value(),
    workerUrl:CONVERSATION_WORKER_URL.value(),
    ingestToken:TEAMS_INGEST_TOKEN.value(),
    bucket
  });
  return handler(req,res);
});

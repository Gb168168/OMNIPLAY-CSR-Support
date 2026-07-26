const {CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext}=require('botbuilder');

const safe=v=>String(v||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

async function botFrameworkToken(appId,appPassword,tenantId){
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:appId,client_secret:appPassword,scope:'https://api.botframework.com/.default'});
  const res=await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!res.ok)throw new Error(`Bot Framework token failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function downloadAttachment(attachment,credentials){
  const info=attachment.contentType==='application/vnd.microsoft.teams.file.download.info'?attachment.content:null;
  const url=info?.downloadUrl||attachment.contentUrl;
  if(!url)return null;
  let res=await fetch(url);
  if(res.status===401||res.status===403){
    const token=await botFrameworkToken(credentials.appId,credentials.appPassword,credentials.tenantId);
    res=await fetch(url,{headers:{authorization:`Bearer ${token}`}});
  }
  if(!res.ok)throw new Error(`Teams attachment download failed: ${res.status}`);
  return {buffer:Buffer.from(await res.arrayBuffer()),fileName:info?.name||attachment.name||`teams-file-${Date.now()}`,mimeType:res.headers.get('content-type')||attachment.contentType||'application/octet-stream'};
}

async function saveAttachment(bucket,userKey,activityId,index,attachment,credentials){
  const file=await downloadAttachment(attachment,credentials);
  if(!file)return null;
  const token=crypto.randomUUID(),objectName=`teams-conversations/${safe(userKey)}/${safe(activityId)}-${index}-${safe(file.fileName)}`;
  await bucket.file(objectName).save(file.buffer,{resumable:false,metadata:{contentType:file.mimeType,metadata:{firebaseStorageDownloadTokens:token}}});
  const mediaUrl=`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`;
  const mime=file.mimeType.toLowerCase();
  return {mediaType:mime.startsWith('image/')?'photo':mime.startsWith('video/')?'video':'document',fileId:objectName,fileName:file.fileName,mimeType:file.mimeType,mediaUrl};
}

async function worker(config,path,body){
  const res=await fetch(`${config.workerUrl.replace(/\/$/,'')}${path}`,{method:'POST',headers:{authorization:`Bearer ${config.ingestToken}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||`Conversation Worker failed: ${res.status}`);
  return data;
}

function createTeamsBotHandler(config){
  const auth=new ConfigurationBotFrameworkAuthentication({MicrosoftAppType:'SingleTenant',MicrosoftAppId:config.appId,MicrosoftAppPassword:config.appPassword,MicrosoftAppTenantId:config.tenantId});
  const adapter=new CloudAdapter(auth);
  adapter.onTurnError=async(context,error)=>{console.error('Teams turn error',error);await context.sendActivity('處理失敗，請稍後再試。')};
  return async(req,res)=>adapter.process(req,res,async context=>{
    if(context.activity.type!=='message')return;
    const a=context.activity,aadId=a.from?.aadObjectId||a.from?.id;
    if(!aadId)return;
    const userKey=`teams:${aadId}`,command=String(TurnContext.removeRecipientMention(a)||a.text||'').trim();
    const common={source:'teams',sourceLabel:'Microsoft Teams',userKey,chatId:String(a.conversation?.id||''),creatorId:String(aadId),creatorName:a.from?.name||'',creatorUsername:''};
    if(['執行','完成'].includes(command)){
      const r=await worker(config,'/internal/conversations/command',{...common,command:'execute'});
      await context.sendActivity(r.empty?'目前沒有暫存內容。':`已收到 ${r.messageCount} 則訊息\nConversation ${r.displayId} 已建立`);
      return;
    }
    if(command==='取消'){
      const r=await worker(config,'/internal/conversations/command',{...common,command:'cancel'});
      await context.sendActivity(`已取消並刪除 ${r.messageCount} 則暫存訊息。`);
      return;
    }
    if(command==='狀態'){
      const r=await worker(config,'/internal/conversations/command',{...common,command:'status'});
      await context.sendActivity(`目前已暫存 ${r.messageCount} 則訊息、${r.attachmentCount} 個附件。`);
      return;
    }
    const credentials={appId:config.appId,appPassword:config.appPassword,tenantId:config.tenantId},attachments=[];
    for(const [i,attachment] of (a.attachments||[]).entries()){
      const saved=await saveAttachment(config.bucket,userKey,a.id||Date.now(),i,attachment,credentials);
      if(saved)attachments.push(saved);
    }
    const payload={sequence:new Date(a.timestamp||Date.now()).getTime(),text:command,sentAt:new Date(a.timestamp||Date.now()).toISOString(),senderId:String(aadId),senderName:a.from?.name||'',senderUsername:'',teamsActivityId:a.id||'',attachments};
    const r=await worker(config,'/internal/conversations/ingest',{...common,payload});
    await context.sendActivity(`已收到 ${r.messageCount} 則訊息。完成後請輸入「執行」。`);
  });
}

module.exports={createTeamsBotHandler};

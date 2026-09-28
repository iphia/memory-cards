'use strict';
const DAY = 86400000;
const KEY = 'five-recall:v1:' + location.pathname.replace(/index\.html$/, '');
const $ = id => document.getElementById(id);
const examples = [['임병찬', '독립의군부'], ['박상진', '대한광복회']];
function makeCard(q,a){return {id:crypto.randomUUID(),q,a,hits:0,total:0,wrong:0,nextDecayAt:0};}
function shuffle(ids){const out=[...ids];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function fresh(){const cards=examples.map(([q,a])=>makeCard(q,a));return {cards,queue:cards.map(c=>c.id),index:0,round:1};}
function valid(s){return s && Array.isArray(s.cards) && s.cards.every(c=>c && typeof c.id==='string' && typeof c.q==='string' && typeof c.a==='string' && Number.isSafeInteger(c.hits) && c.hits>=0 && Number.isInteger(c.total) && c.total>=0 && ((Number.isSafeInteger(c.nextDecayAt) && c.nextDecayAt>=0) || (c.nextDecayAt===undefined && Number.isSafeInteger(c.until) && c.until>=0))) && new Set(s.cards.map(c=>c.id)).size===s.cards.length && Array.isArray(s.queue) && s.queue.every(id=>typeof id==='string') && new Set(s.queue).size===s.queue.length && Number.isInteger(s.index) && s.index>=0 && s.index<=s.queue.length && Number.isInteger(s.round) && s.round>0;}
let state, storageWarning='';
try{const raw=localStorage.getItem(KEY);state=raw?JSON.parse(raw):fresh();if(!valid(state))throw Error('invalid');}catch{state=fresh();storageWarning='저장된 기록을 읽을 수 없어 예시 카드로 시작했습니다.';}
// Add the new example once while preserving existing cards and learning records.
if(!state.examplesV2){
 if(!state.cards.some(c=>c.q==='박상진'&&c.a==='대한광복회')){
  const card=makeCard('박상진','대한광복회');state.cards.push(card);state.queue.push(card.id);
 }
 state.examplesV2=true;
}
function migrateDecay(s,now=Date.now()){
 for(const c of s.cards){
  if(c.nextDecayAt===undefined)c.nextDecayAt=c.hits>0?(c.until>0?c.until:now+DAY):0;
  delete c.until;
 }
 return s;
}
function applyDecay(s,now=Date.now()){
 for(const c of s.cards){
  if(c.hits>0&&c.nextDecayAt>0&&now>=c.nextDecayAt){
   const elapsed=Math.floor((now-c.nextDecayAt)/DAY)+1;
   c.hits=Math.max(0,c.hits-elapsed);
   c.nextDecayAt=c.hits>0?c.nextDecayAt+elapsed*DAY:0;
  }
 }
}
migrateDecay(state);
let revealed=false;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageWarning='저장 공간에 접근할 수 없습니다. 현재 기록은 창을 닫으면 사라질 수 있습니다.';}}
function current(){return state.cards.find(c=>c.id===state.queue[state.index]);}
function prepare(){
 applyDecay(state);
 while(state.index<state.queue.length && !current())state.index++;
 if(state.index>=state.queue.length){const ids=state.cards.map(c=>c.id);if(ids.length){if(state.queue.length)state.round++;state.queue=shuffle(ids);state.index=0;revealed=false;}}
}
function decayText(c){
 if(!c.hits||!c.nextDecayAt)return '현재 정답 0회';
 const mins=Math.max(1,Math.ceil((c.nextDecayAt-Date.now())/60000));
 return mins>=60?`${Math.floor(mins/60)}시간 ${mins%60}분 뒤 −1회`:`${mins}분 뒤 −1회`;
}
function render(){
 prepare();save();
 const c=current(), active=state.cards.length;
 $('total').textContent=state.cards.length;$('active').textContent=active;$('mastered').textContent=state.cards.filter(c=>c.hits>=5).length;
 $('round').textContent=`${state.round}번째 바퀴`;
 $('position').textContent=c?`${state.index+1} / ${state.queue.length}번째 카드`:'학습할 카드 없음';
 $('round-progress').max=Math.max(1,state.queue.length);$('round-progress').value=c?state.index+1:state.queue.length;
 $('card').disabled=!c;$('answer').hidden=!revealed||!c;
 $('card').setAttribute('aria-expanded',String(!!c&&revealed));
 $('card').setAttribute('aria-label',revealed?'카드를 눌러 정답 가리기':'카드를 눌러 정답 보기');
 $('previous').disabled=!c||previousIndex()<0;
 $('next').disabled=!c;
 $('next').textContent=hasNext()?'다음 카드 →':'다음 바퀴 →';
 $('card-label').textContent=c?(revealed?'ANSWER':'QUESTION'):'ALL CLEAR';
 $('question').textContent=c?c.q:'첫 카드를 추가해 보세요.';
 $('answer').textContent=c?c.a:'';
 $('hint').textContent=c?(revealed?'다시 누르면 정답이 가려집니다.':'카드를 눌러 정답 확인 ↵'):'상단의 카드 관리에서 내용을 추가할 수 있어요.';
 $('card-count').textContent=c?`현재 정답 ${c.hits}회 · 누적 정답 ${c.total}회`:'';
 $('dots').replaceChildren();if(c)for(let i=0;i<5;i++){const dot=document.createElement('span');dot.className='dot'+(i<c.hits?' done':'');$('dots').append(dot);}
 $('wrong').disabled=$('correct').disabled=!c||!revealed;
 if($('editor').open)editorList();
 if(storageWarning)$('notice').textContent=storageWarning;
}
function reveal(){if(!current())return;revealed=!revealed;render();}
function grade(ok){
 const c=current();if(!c||!revealed)return;
 applyDecay(state);const before=state.round;
 if(ok){c.hits++;c.total++;c.nextDecayAt=Date.now()+DAY;}
 else c.wrong=(c.wrong||0)+1;
 state.index++;revealed=false;render();
 $('notice').textContent=storageWarning||(state.round>before?'한 바퀴 완료! 카드 순서를 새로 섞었습니다.':'');
}
function previousIndex(){
 for(let i=state.index-1;i>=0;i--){const c=state.cards.find(c=>c.id===state.queue[i]);if(c)return i;}
 return -1;
}
function hasNext(){return state.queue.slice(state.index+1).some(id=>state.cards.some(c=>c.id===id));}
function navigate(direction){
 if(!current())return;
 const before=state.round;
 if(direction===-1){const index=previousIndex();if(index<0)return;state.index=index;}
 else if(direction===1){state.index++;}
 else return;
 revealed=false;render();
 $('notice').textContent=storageWarning||(state.round>before?'한 바퀴 완료! 카드 순서를 새로 섞었습니다.':'');
}
$('previous').onclick=()=>navigate(-1);$('next').onclick=()=>navigate(1);
$('card').onclick=reveal;$('wrong').onclick=()=>grade(false);$('correct').onclick=()=>grade(true);
const editorTabs=['list','edit','clipboard','backup'];
function selectEditorTab(name,focus=false){
 if(!editorTabs.includes(name))return;
 for(const key of editorTabs){
  const selected=key===name;
  $('tab-'+key).setAttribute('aria-selected',String(selected));
  $('tab-'+key).tabIndex=selected?0:-1;$('panel-'+key).hidden=!selected;
 }
 if(focus)$('tab-'+name).focus();
}
for(const [index,name] of editorTabs.entries()){
 $('tab-'+name).onclick=()=>selectEditorTab(name);
 $('tab-'+name).onkeydown=e=>{
  let target;
  if(e.key==='ArrowRight')target=(index+1)%editorTabs.length;
  else if(e.key==='ArrowLeft')target=(index+editorTabs.length-1)%editorTabs.length;
  else if(e.key==='Home')target=0;
  else if(e.key==='End')target=editorTabs.length-1;
  else return;
  e.preventDefault();selectEditorTab(editorTabs[target],true);
 };
}
let editingId=null;
function resetEditor(){
 editingId=null;
 $('new-question').value='';$('new-answer').value='';
 $('save-card').textContent='카드 추가';$('cancel-edit').hidden=true;
 $('form-help').textContent='질문과 정답을 한 쌍씩 추가하세요.';
}
function startEdit(id){
 const card=state.cards.find(c=>c.id===id);if(!card)return;
 selectEditorTab('edit');editingId=id;$('new-question').value=card.q;$('new-answer').value=card.a;
 $('save-card').textContent='수정 저장';$('cancel-edit').hidden=false;
 $('form-help').textContent='질문과 정답을 수정하세요. 학습 기록은 유지됩니다.';
 $('editor-status').textContent='';$('new-question').focus();
}
$('cancel-edit').onclick=()=>{resetEditor();$('editor-status').textContent='수정을 취소했습니다.';};
function editorList(){
 $('mastery').textContent=`${state.cards.filter(c=>c.total>0).length} / ${state.cards.length} 정답 경험`;
 const query=$('card-search').value.trim().normalize('NFC').toLocaleLowerCase();
 const cards=state.cards.filter(c=>[c.q,c.a].some(value=>value.normalize('NFC').toLocaleLowerCase().includes(query)));
 $('search-status').textContent=query?`검색 결과 ${cards.length}개 / 전체 ${state.cards.length}개`:`전체 ${cards.length}개`;
 $('editable-list').replaceChildren();
 if(!cards.length){const empty=document.createElement('p');empty.className='muted small';empty.textContent=query?'검색 결과가 없습니다. 다른 검색어를 입력해 주세요.':'등록된 카드가 없습니다.';$('editable-list').append(empty);}
 for(const c of cards){const row=document.createElement('div'),text=document.createElement('span'),button=document.createElement('button');row.className='edit-row';text.textContent=c.q+' → '+c.a;button.textContent='삭제';button.type='button';button.className='delete';button.setAttribute('aria-label',c.q+' 삭제');button.onclick=()=>{if(!confirm('이 카드와 학습 기록을 삭제할까요?'))return;const id=current()?.id;state.cards=state.cards.filter(x=>x.id!==c.id);if(c.id===id)revealed=false;if(editingId===c.id)resetEditor();render();editorList();};
 const edit=document.createElement('button'),actions=document.createElement('div');
 edit.type='button';edit.className='outline';edit.textContent='수정';edit.setAttribute('aria-label',c.q+' 수정');edit.onclick=()=>startEdit(c.id);
 const details=document.createElement('div'),meta=document.createElement('div'),count=document.createElement('span'),status=document.createElement('span'),bar=document.createElement('progress');
 details.className='edit-details';text.className='list-title';
 meta.className='list-meta';count.textContent=`현재 정답 ${c.hits}회 · 누적 정답 ${c.total}회`;
 status.textContent=(c.id===current()?.id?'학습 중 · ':'')+decayText(c);
 bar.max=5;bar.value=Math.min(c.hits,5);bar.setAttribute('aria-label',`${c.q} 목표 진행도`);
 meta.append(count,status);details.append(text,meta,bar);
 actions.className='edit-actions';actions.append(edit,button);row.append(details,actions);$('editable-list').append(row);}}
$('card-search').oninput=editorList;
$('manage').onclick=()=>{selectEditorTab('list');resetEditor();$('card-search').value='';editorList();$('editor-status').textContent='';$('editor').showModal();};$('close').onclick=()=>$('editor').close();
$('card-form').onsubmit=e=>{
 e.preventDefault();const q=$('new-question').value.trim(),a=$('new-answer').value.trim();
 if(!q||!a){$('editor-status').textContent='질문과 정답을 모두 입력해 주세요.';return;}
 let message;
 if(editingId){
  const card=state.cards.find(c=>c.id===editingId);
  if(!card){$('editor-status').textContent='이 카드는 삭제되어 수정할 수 없습니다.';return;}
  card.q=q;card.a=a;if(current()?.id===card.id)revealed=false;
  message='카드를 수정했습니다. 학습 기록은 유지됩니다.';
 }else{
  const card=makeCard(q,a);state.cards.push(card);state.queue.push(card.id);message='카드를 추가했습니다.';
 }
 resetEditor();$('editor-status').textContent=message;render();editorList();$('new-question').focus();
};
let pendingClipboard=[];
function clearClipboardPreview(){
 pendingClipboard=[];$('clipboard-confirmation').hidden=true;$('clipboard-confirm').disabled=true;
 $('clipboard-list').replaceChildren();
}
function parseClipboard(text){
 if(typeof text!=='string'||!text.trim())throw Error('추가할 내용을 입력해 주세요.');
 if(text.length>100000)throw Error('한 번에 100,000자 이하로 입력해 주세요.');
 const parts=text.trim().split('/');
 if(parts.length>200)throw Error('한 번에 최대 200개까지 추가할 수 있습니다.');
 return parts.map((part,i)=>{
  const separator=part.indexOf('-');
  const q=part.slice(0,separator).trim(),a=part.slice(separator+1).trim();
  if(separator<0||!q||!a)throw Error(`${i+1}번째 항목을 질문-정답 형식으로 입력해 주세요.`);
  if(q.length>5000||a.length>10000)throw Error(`${i+1}번째 항목이 너무 깁니다. 질문은 5,000자, 정답은 10,000자까지 입력할 수 있습니다.`);
  return {q,a};
 });
}
function previewClipboard(){
 clearClipboardPreview();
 try{
  const cards=parseClipboard($('clipboard-text').value);
  pendingClipboard=cards;
  for(const card of cards){const row=document.createElement('li');row.textContent=card.q+' → '+card.a;$('clipboard-list').append(row);}
  $('clipboard-title').textContent=`다음 카드 ${cards.length}개를 추가할까요?`;
  $('clipboard-confirm').textContent=`${cards.length}개 추가`;$('clipboard-confirm').disabled=false;
  $('clipboard-confirmation').hidden=false;
  $('clipboard-status').textContent='내용을 확인하고 추가를 눌러 주세요. 기존 카드는 유지됩니다.';
 }catch(error){$('clipboard-status').textContent=error.message;}
}
$('clipboard-preview').onclick=previewClipboard;
$('clipboard-text').oninput=()=>{clearClipboardPreview();$('clipboard-status').textContent='';};
$('clipboard-cancel').onclick=()=>{clearClipboardPreview();$('clipboard-status').textContent='추가를 취소했습니다.';};
$('clipboard-read').onclick=async()=>{
 $('clipboard-read').disabled=true;clearClipboardPreview();
 try{
  if(!navigator.clipboard?.readText)throw Error('unavailable');
  const text=await navigator.clipboard.readText();
  if(!$('editor').open)return;
  $('clipboard-text').value=text;previewClipboard();
 }catch{
  $('clipboard-status').textContent='클립보드를 읽을 수 없습니다. 아래 입력란에 직접 붙여넣고 추가할 카드 확인을 눌러 주세요.';
  $('clipboard-text').focus();
 }finally{$('clipboard-read').disabled=false;}
};
$('clipboard-confirm').onclick=()=>{
 if(!pendingClipboard.length)return;
 const additions=pendingClipboard.map(({q,a})=>makeCard(q,a));
 const next={...state,cards:[...state.cards,...additions],queue:[...state.queue,...additions.map(c=>c.id)]};
 try{localStorage.setItem(KEY,JSON.stringify(next));}
 catch{$('clipboard-status').textContent='저장 공간에 접근할 수 없어 추가하지 못했습니다. 입력 내용은 유지됩니다.';return;}
 state=next;clearClipboardPreview();$('clipboard-text').value='';$('card-search').value='';
 render();editorList();$('clipboard-status').textContent=`카드 ${additions.length}개를 추가했습니다.`;
};
$('editor').addEventListener('close',()=>{clearClipboardPreview();});
const BACKUP_FORMAT='five-recall-backup';
const MAX_BACKUP_BYTES=10*1024*1024;
function backupText(){
 applyDecay(state);save();
 return JSON.stringify({format:BACKUP_FORMAT,version:2,exportedAt:new Date().toISOString(),state},null,2);
}
function parseBackup(text){
 const data=JSON.parse(text);
 if(!data||data.format!==BACKUP_FORMAT||![1,2].includes(data.version)||!valid(data.state))throw Error('invalid');
 const s=data.state;
 const count=n=>Number.isSafeInteger(n)&&n>=0;
 if(!Number.isSafeInteger(s.round)||s.cards.length>10000||s.queue.length>100000||
  !s.cards.every(c=>c.id.length>0&&c.id.length<=200&&c.q.trim().length>0&&c.q.length<=5000&&
   c.a.trim().length>0&&c.a.length<=10000&&count(c.total)&&c.total>=c.hits&&
   count(c.wrong)&&(data.version===1?
    (count(c.until)&&c.until<=8640000000000000&&c.hits<=5&&(c.until>0?c.hits===5:c.hits<5)):
    (count(c.nextDecayAt)&&c.nextDecayAt<=8640000000000000&&(c.hits>0?c.nextDecayAt>0:c.nextDecayAt===0))))||!s.queue.every(id=>id.length>0&&id.length<=200))throw Error('invalid');
 // Copy supported fields only; old queue IDs for deleted cards are skipped by prepare().
 return migrateDecay({cards:s.cards.map(c=>({id:c.id,q:c.q,a:c.a,hits:c.hits,total:c.total,wrong:c.wrong,...(data.version===1?{until:c.until}:{nextDecayAt:c.nextDecayAt})})),
  queue:[...s.queue],index:s.index,round:s.round,examplesV2:true});
}
$('backup-download').onclick=()=>{
 try{
  const blob=new Blob([backupText()],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`five-recall-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('backup-status').textContent=`카드 ${state.cards.length}개와 학습 기록의 백업 다운로드를 요청했습니다.`;
 }catch{$('backup-status').textContent='백업 파일을 만들지 못했습니다. 다시 시도해 주세요.';}
};
$('backup-restore').onclick=()=>$('backup-file').click();
$('backup-file').onchange=async()=>{
 const input=$('backup-file'),file=input.files?.[0];if(!file)return;
 $('backup-restore').disabled=true;
 try{
  if(file.size>MAX_BACKUP_BYTES){$('backup-status').textContent='10MB 이하의 백업 파일을 선택해 주세요.';return;}
  let restored;
  try{restored=parseBackup(await file.text());}
  catch{$('backup-status').textContent='올바른 백업 파일이 아닙니다. 현재 데이터는 유지됩니다.';return;}
  if(!confirm(`백업의 카드 ${restored.cards.length}개와 학습 기록으로 현재 카드 ${state.cards.length}개를 덮어쓸까요? 수정 중인 내용도 사라집니다. 필요하면 취소 후 먼저 백업해 주세요.`)){
   $('backup-status').textContent='복원을 취소했습니다. 현재 데이터는 유지됩니다.';return;
  }
  // Persist before replacing live state so storage errors cannot discard current data.
  try{localStorage.setItem(KEY,JSON.stringify(restored));}
  catch{$('backup-status').textContent='저장 공간에 접근할 수 없어 복원하지 못했습니다. 현재 데이터는 유지됩니다.';return;}
  state=restored;revealed=false;storageWarning='';resetEditor();$('card-search').value='';
  $('editor-status').textContent='';$('notice').textContent='';render();editorList();
  $('backup-status').textContent=`카드 ${state.cards.length}개와 학습 기록을 복원했습니다.`;
 }finally{input.value='';$('backup-restore').disabled=false;}
};
window.addEventListener('keydown',e=>{if($('editor').open||e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.key===' '||e.key==='Enter'){if(e.target.tagName==='BUTTON')return;e.preventDefault();reveal();}else if(e.key.toLowerCase()==='o')grade(true);else if(e.key.toLowerCase()==='x')grade(false);});
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{const incoming=JSON.parse(e.newValue);if(valid(incoming)){state=migrateDecay(incoming);revealed=false;render();if($('editor').open)editorList();}}catch{}});
setInterval(()=>{if(state.cards.some(c=>c.nextDecayAt))render();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
render();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_learning_progress',description:'현재 암기 카드와 학습 진행도를 조회합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({round:state.round,cards:state.cards.map(c=>({question:c.q,hits:c.hits,total:c.total,nextDecayAt:c.nextDecayAt}))})})).catch(()=>{});}catch{}}

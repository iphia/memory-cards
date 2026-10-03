'use strict';
const DAY = 86400000;
const KEY = 'five-recall:v1:' + location.pathname.replace(/index\.html$/, '');
const $ = id => document.getElementById(id);
const examples = [['임병찬', '독립의군부'], ['박상진', '대한광복회']];
function validKeywords(words){return Array.isArray(words)&&words.length>=2&&words.length<=200&&words.every(w=>typeof w==='string'&&w.trim().length>0&&w.length<=10000);}
function cardKeywords(card){return card.keywords||[card.q,card.a];}
function validAnswerOnly(c){return c.answerOnly===undefined||(Array.isArray(c.answerOnly)&&c.answerOnly.length===c.keywords?.length&&c.answerOnly.every(v=>typeof v==='boolean')&&c.answerOnly.some(v=>!v));}
function makeCard(input){const {keywords,answerOnly}=Array.isArray(input)?{keywords:input,answerOnly:input.map(()=>false)}:input;return {id:crypto.randomUUID(),keywords:[...keywords],answerOnly:[...answerOnly],hits:0,total:0,wrong:0,nextDecayAt:0};}
function parseKeywords(text){
 const lines=text.trim().split(/\r?\n/).map(w=>w.trim()).filter(Boolean);
 const answerOnly=lines.map(w=>w.startsWith('-')||w.endsWith('-'));
 const keywords=lines.map(w=>w.replace(/^-+|-+$/g,'').trim());
 if(!validKeywords(keywords))throw Error('엔터로 구분해 키워드를 2~200개 입력해 주세요. 키워드 하나는 10,000자까지 가능합니다.');
 if(new Set(keywords.map(w=>w.normalize('NFC'))).size!==keywords.length)throw Error('같은 키워드가 중복되어 있습니다. 중복을 제거해 주세요.');
 if(answerOnly.every(Boolean))throw Error('문제로 사용할 키워드가 하나 이상 필요합니다. 하나 이상의 키워드에서 앞뒤 -를 지워 주세요.');
 return {keywords,answerOnly};
}
function keywordInput(card){return card.keywords.map((w,i)=>(card.answerOnly?.[i]?'-':'')+w).join('\n');}
function keywordSummary(card){return card.keywords.map((w,i)=>w+(card.answerOnly?.[i]?' (정답 전용)':'')).join(' · ');}

function shuffle(ids){const out=[...ids];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function fresh(){const cards=examples.map(words=>makeCard(words));return {cards,queue:cards.map(c=>c.id),index:0};}
function valid(s){return s && Array.isArray(s.cards) && s.cards.every(c=>c && typeof c.id==='string' && validAnswerOnly(c) && (c.keywords!==undefined?validKeywords(c.keywords):(typeof c.q==='string'&&typeof c.a==='string')) && Number.isSafeInteger(c.hits) && c.hits>=0 && Number.isInteger(c.total) && c.total>=0 && ((Number.isSafeInteger(c.nextDecayAt) && c.nextDecayAt>=0) || (c.nextDecayAt===undefined && Number.isSafeInteger(c.until) && c.until>=0))) && new Set(s.cards.map(c=>c.id)).size===s.cards.length && Array.isArray(s.queue) && s.queue.every(id=>typeof id==='string') && new Set(s.queue).size===s.queue.length && Number.isInteger(s.index) && s.index>=0 && s.index<=s.queue.length;}
let state, storageWarning='';
try{const raw=localStorage.getItem(KEY);state=raw?JSON.parse(raw):fresh();if(!valid(state))throw Error('invalid');}catch{state=fresh();storageWarning='저장된 기록을 읽을 수 없어 예시 카드로 시작했습니다.';}
// Add the new example once while preserving existing cards and learning records.
if(!state.examplesV2){
 if(!state.cards.some(c=>cardKeywords(c).includes('박상진')&&cardKeywords(c).includes('대한광복회'))){
  const card=makeCard(['박상진','대한광복회']);state.cards.push(card);state.queue.push(card.id);
 }
 state.examplesV2=true;
}
function migrateDecay(s,now=Date.now()){
 delete s.round;
 for(const c of s.cards){
  if(!c.keywords)c.keywords=[c.q,c.a];
  if(!c.answerOnly)c.answerOnly=c.keywords.map(()=>false);
  delete c.q;delete c.a;
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
let revealed=false,promptKey='',promptIndex=0;
function selectPrompt(card){
 if(!card){promptKey='';return;}
 const key=JSON.stringify([state.index,card.id,card.keywords,card.answerOnly]);
 if(key!==promptKey){promptKey=key;const candidates=card.keywords.map((_,i)=>i).filter(i=>!card.answerOnly[i]);promptIndex=candidates[Math.floor(Math.random()*candidates.length)];revealed=false;}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageWarning='저장 공간에 접근할 수 없습니다. 현재 기록은 창을 닫으면 사라질 수 있습니다.';}}
function current(){return state.cards.find(c=>c.id===state.queue[state.index]);}
function prepare(){
 applyDecay(state);
 while(state.index<state.queue.length && !current())state.index++;
 if(state.index>=state.queue.length){
  const ids=state.cards.map(c=>c.id);
  if(ids.length){state.queue=shuffle(ids);state.index=0;revealed=false;promptKey='';return true;}
 }
 return false;
}
function decayText(c){
 if(!c.hits||!c.nextDecayAt)return '현재 정답 0회';
 const mins=Math.max(1,Math.ceil((c.nextDecayAt-Date.now())/60000));
 return mins>=60?`${Math.floor(mins/60)}시간 ${mins%60}분 뒤 −1회`:`${mins}분 뒤 −1회`;
}
function render(){
 const shuffled=prepare();save();
 const c=current(), active=state.cards.length;
 selectPrompt(c);
 $('total').textContent=state.cards.length;$('active').textContent=active;$('mastered').textContent=state.cards.filter(c=>c.hits>=5).length;
 $('position').textContent=c?`${state.index+1} / ${state.queue.length}번째 카드`:'학습할 카드 없음';
 $('round-progress').max=Math.max(1,state.queue.length);$('round-progress').value=c?state.index+1:state.queue.length;
 $('card').disabled=!c;$('answer').hidden=!revealed||!c;
 $('card').setAttribute('aria-expanded',String(!!c&&revealed));
 $('card').setAttribute('aria-label',revealed?'카드를 눌러 정답 가리기':'카드를 눌러 정답 보기');
 $('previous').disabled=!c||previousIndex()<0;
 $('next').disabled=!c;
 $('next').textContent=hasNext()?'다음 카드 →':'다음 바퀴 →';
 $('card-label').textContent=c?(revealed?'ANSWER':'QUESTION'):'ALL CLEAR';
 $('question').textContent=c?c.keywords[promptIndex]:'첫 카드를 추가해 보세요.';
 $('answer').textContent=c?c.keywords.filter((_,i)=>i!==promptIndex).join(', '):'';
 $('hint').textContent=c?(revealed?'다시 눌러 가리기 · 길게 눌러 수정':'눌러 정답 확인 · 길게 눌러 수정'):'상단의 카드 관리에서 내용을 추가할 수 있어요.';
 $('card-count').textContent=c?`현재 정답 ${c.hits}회 · 누적 정답 ${c.total}회`:'';
 $('dots').replaceChildren();if(c)for(let i=0;i<5;i++){const dot=document.createElement('span');dot.className='dot'+(i<c.hits?' done':'');$('dots').append(dot);}
 $('wrong').disabled=$('correct').disabled=!c||!revealed;
 if($('editor').open)editorList();
 if(storageWarning)$('notice').textContent=storageWarning;
 return shuffled;
}
let shuffleAnimation=null;
function animateShuffle(){
 shuffleAnimation?.cancel();
 const card=$('card');
 if(typeof card.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 shuffleAnimation=card.animate([
  {transform:'translateX(0) rotate(0deg) scale(1)',opacity:1},
  {transform:'translateX(-14px) rotate(-1.5deg) scale(.97)',opacity:.75,offset:.22},
  {transform:'translateX(14px) rotate(1.5deg) scale(.97)',opacity:.85,offset:.48},
  {transform:'translateX(-7px) rotate(-.7deg) scale(.99)',opacity:1,offset:.72},
  {transform:'translateX(0) rotate(0deg) scale(1)',opacity:1}
 ],{duration:560,easing:'ease-in-out'});
}
function reveal(){if(!current())return;revealed=!revealed;render();}
function grade(ok){
 const c=current();if(!c||!revealed)return;
 applyDecay(state);
 if(ok){c.hits++;c.total++;c.nextDecayAt=Date.now()+DAY;}
 else c.wrong=(c.wrong||0)+1;
 state.index++;revealed=false;promptKey='';const shuffled=render();
 if(shuffled)animateShuffle();
 $('notice').textContent=storageWarning||(shuffled?'카드 순서를 새로 섞었습니다.':'');
}
function previousIndex(){
 for(let i=state.index-1;i>=0;i--){const c=state.cards.find(c=>c.id===state.queue[i]);if(c)return i;}
 return -1;
}
function hasNext(){return state.queue.slice(state.index+1).some(id=>state.cards.some(c=>c.id===id));}
function navigate(direction){
 if(!current())return;
 if(direction===-1){const index=previousIndex();if(index<0)return;state.index=index;}
 else if(direction===1){state.index++;}
 else return;
 revealed=false;promptKey='';const shuffled=render();
 if(shuffled)animateShuffle();
 $('notice').textContent=storageWarning||(shuffled?'카드 순서를 새로 섞었습니다.':'');
}
$('previous').onclick=()=>navigate(-1);$('next').onclick=()=>navigate(1);
let pressTimer=null,pressStart=null,suppressCardClick=false;
function cancelCardPress(){clearTimeout(pressTimer);pressTimer=null;pressStart=null;}
$('card').onpointerdown=e=>{
 cancelCardPress();suppressCardClick=false;
 if(e.button!==0||e.isPrimary===false||!current())return;
 const id=current().id;pressStart={x:e.clientX,y:e.clientY};
 pressTimer=setTimeout(()=>{
  pressTimer=null;pressStart=null;
  if(current()?.id!==id||$('editor').open)return;
  suppressCardClick=true;shuffleAnimation?.cancel();
  $('editor').showModal();startEdit(id);
 },550);
};
$('card').onpointermove=e=>{if(pressStart&&Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y)>10)cancelCardPress();};
$('card').onpointerup=cancelCardPress;
$('card').onpointercancel=cancelCardPress;
$('card').onpointerleave=cancelCardPress;
$('card').oncontextmenu=e=>e.preventDefault();
window.addEventListener('blur',cancelCardPress);
$('card').onclick=()=>{cancelCardPress();if(suppressCardClick){suppressCardClick=false;return;}reveal();};$('wrong').onclick=()=>grade(false);$('correct').onclick=()=>grade(true);
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
 $('card-keywords').value='';
 $('save-card').textContent='카드 추가';$('cancel-edit').hidden=true;
 $('form-help').textContent='키워드를 한 줄에 하나씩 입력하세요. 앞뒤 -는 정답 전용 표시입니다.';
}
function startEdit(id){
 const card=state.cards.find(c=>c.id===id);if(!card)return;
 selectEditorTab('edit');editingId=id;$('card-keywords').value=keywordInput(card);
 $('save-card').textContent='수정 저장';$('cancel-edit').hidden=false;
 $('form-help').textContent='키워드를 수정하세요. 학습 기록은 카드 단위로 유지됩니다.';
 $('editor-status').textContent='';$('card-keywords').focus();
}
$('cancel-edit').onclick=()=>{resetEditor();$('editor-status').textContent='수정을 취소했습니다.';};
function editorList(){
 $('mastery').textContent=`${state.cards.filter(c=>c.total>0).length} / ${state.cards.length} 정답 경험`;
 const query=$('card-search').value.trim().normalize('NFC').toLocaleLowerCase();
 const cards=state.cards.filter(c=>c.keywords.some(value=>value.normalize('NFC').toLocaleLowerCase().includes(query)));
 $('search-status').textContent=query?`검색 결과 ${cards.length}개 / 전체 ${state.cards.length}개`:`전체 ${cards.length}개`;
 $('editable-list').replaceChildren();
 if(!cards.length){const empty=document.createElement('p');empty.className='muted small';empty.textContent=query?'검색 결과가 없습니다. 다른 검색어를 입력해 주세요.':'등록된 카드가 없습니다.';$('editable-list').append(empty);}
 for(const c of cards){const row=document.createElement('div'),text=document.createElement('span'),button=document.createElement('button');row.className='edit-row';text.textContent=keywordSummary(c);button.textContent='삭제';button.type='button';button.className='delete';button.setAttribute('aria-label',c.keywords.join(', ')+' 삭제');button.onclick=()=>{if(!confirm('이 카드와 학습 기록을 삭제할까요?'))return;const id=current()?.id;state.cards=state.cards.filter(x=>x.id!==c.id);if(c.id===id)revealed=false;if(editingId===c.id)resetEditor();render();editorList();};
 const edit=document.createElement('button'),actions=document.createElement('div');
 edit.type='button';edit.className='outline';edit.textContent='수정';edit.setAttribute('aria-label',c.keywords.join(', ')+' 수정');edit.onclick=()=>startEdit(c.id);
 const details=document.createElement('div'),meta=document.createElement('div'),count=document.createElement('span'),status=document.createElement('span'),bar=document.createElement('progress');
 details.className='edit-details';text.className='list-title';
 meta.className='list-meta';count.textContent=`현재 정답 ${c.hits}회 · 누적 정답 ${c.total}회`;
 status.textContent=(c.id===current()?.id?'학습 중 · ':'')+decayText(c);
 bar.max=5;bar.value=Math.min(c.hits,5);bar.setAttribute('aria-label',`${c.keywords.join(', ')} 목표 진행도`);
 meta.append(count,status);details.append(text,meta,bar);
 actions.className='edit-actions';actions.append(edit,button);row.append(details,actions);$('editable-list').append(row);}}
$('card-search').oninput=editorList;
$('manage').onclick=()=>{selectEditorTab('list');resetEditor();$('card-search').value='';editorList();$('editor-status').textContent='';$('editor').showModal();};$('close').onclick=()=>$('editor').close();
$('card-form').onsubmit=e=>{
 e.preventDefault();let keywords;
 try{keywords=parseKeywords($('card-keywords').value);}catch(error){$('editor-status').textContent=error.message;return;}
 let message;
 if(editingId){
  const card=state.cards.find(c=>c.id===editingId);
  if(!card){$('editor-status').textContent='이 카드는 삭제되어 수정할 수 없습니다.';return;}
  card.keywords=keywords.keywords;card.answerOnly=keywords.answerOnly;if(current()?.id===card.id)revealed=false;
  message='카드를 수정했습니다. 학습 기록은 유지됩니다.';
 }else{
  const card=makeCard(keywords);state.cards.push(card);state.queue.push(card.id);message='카드를 추가했습니다.';
 }
 resetEditor();$('editor-status').textContent=message;render();editorList();$('card-keywords').focus();
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
  try{return parseKeywords(part);}
  catch(error){throw Error(`${i+1}번째 카드: ${error.message}`);}
 });
}
function previewClipboard(){
 clearClipboardPreview();
 try{
  const cards=parseClipboard($('clipboard-text').value);
  pendingClipboard=cards;
  for(const card of cards){const row=document.createElement('li');row.textContent=keywordSummary(card);$('clipboard-list').append(row);}
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
 const additions=pendingClipboard.map(input=>makeCard(input));
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
 return JSON.stringify({format:BACKUP_FORMAT,version:4,exportedAt:new Date().toISOString(),state},null,2);
}
function parseBackup(text){
 const data=JSON.parse(text);
 if(!data||data.format!==BACKUP_FORMAT||![1,2,3,4].includes(data.version)||!valid(data.state))throw Error('invalid');
 const s=data.state;
 const count=n=>Number.isSafeInteger(n)&&n>=0;
 if(s.cards.length>10000||s.queue.length>100000||
  !s.cards.every(c=>c.id.length>0&&c.id.length<=200&&(data.version>=3?(validKeywords(c.keywords)&&(data.version<4||Array.isArray(c.answerOnly))):(typeof c.q==='string'&&c.q.trim().length>0&&c.q.length<=5000&&typeof c.a==='string'&&c.a.trim().length>0&&c.a.length<=10000))&&count(c.total)&&c.total>=c.hits&&
   count(c.wrong)&&(data.version===1?
    (count(c.until)&&c.until<=8640000000000000&&c.hits<=5&&(c.until>0?c.hits===5:c.hits<5)):
    (count(c.nextDecayAt)&&c.nextDecayAt<=8640000000000000&&(c.hits>0?c.nextDecayAt>0:c.nextDecayAt===0))))||!s.queue.every(id=>id.length>0&&id.length<=200))throw Error('invalid');
 // Copy supported fields only; old queue IDs for deleted cards are skipped by prepare().
 return migrateDecay({cards:s.cards.map(c=>({id:c.id,...(data.version>=3?{keywords:[...c.keywords],...(data.version>=4?{answerOnly:[...c.answerOnly]}:{})}:{q:c.q,a:c.a}),hits:c.hits,total:c.total,wrong:c.wrong,...(data.version===1?{until:c.until}:{nextDecayAt:c.nextDecayAt})})),
  queue:[...s.queue],index:s.index,examplesV2:true});
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
  state=restored;promptKey='';revealed=false;storageWarning='';resetEditor();$('card-search').value='';
  $('editor-status').textContent='';$('notice').textContent='';render();editorList();
  $('backup-status').textContent=`카드 ${state.cards.length}개와 학습 기록을 복원했습니다.`;
 }finally{input.value='';$('backup-restore').disabled=false;}
};
window.addEventListener('keydown',e=>{if($('editor').open||e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.key===' '||e.key==='Enter'){if(e.target.tagName==='BUTTON')return;e.preventDefault();reveal();}else if(e.key.toLowerCase()==='o')grade(true);else if(e.key.toLowerCase()==='x')grade(false);});
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{const incoming=JSON.parse(e.newValue);if(valid(incoming)){state=migrateDecay(incoming);revealed=false;render();if($('editor').open)editorList();}}catch{}});
setInterval(()=>{if(state.cards.some(c=>c.nextDecayAt))render();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
render();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_learning_progress',description:'현재 암기 카드와 학습 진행도를 조회합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({cards:state.cards.map(c=>({keywords:[...c.keywords],answerOnly:[...c.answerOnly],hits:c.hits,total:c.total,nextDecayAt:c.nextDecayAt}))})})).catch(()=>{});}catch{}}

'use strict';
const DECAY_HOURS=[24,18,12];
function decayInterval(s){return (s.decayHours??24)*60*60*1000;}
const KEY = 'five-recall:v1:' + location.pathname.replace(/index\.html$/, '');
const $ = id => document.getElementById(id);
const examples = [['임병찬', '독립의군부'], ['박상진', '대한광복회']];
function validKeywords(words){return Array.isArray(words)&&words.length>=2&&words.length<=200&&words.every(w=>typeof w==='string'&&w.trim().length>0&&w.length<=10000);}
function cardKeywords(card){return card.keywords||[card.q,card.a];}
function validAnswerOnly(c){return c.answerOnly===undefined||(Array.isArray(c.answerOnly)&&c.answerOnly.length===c.keywords?.length&&c.answerOnly.every(v=>typeof v==='boolean')&&c.answerOnly.some(v=>!v));}
function validBold(c){return c.bold===undefined||(Array.isArray(c.bold)&&c.bold.length===c.keywords?.length&&c.bold.every(v=>typeof v==='boolean'));}
function validKeywordLocks(c){
 if(c.keywordLocks===undefined)return true;
 const eligibleIndices=(c.keywords||[]).map((_,i)=>i).filter(i=>!c.answerOnly?.[i]);
 return Array.isArray(c.keywordLocks)&&c.keywordLocks.length<Math.max(1,eligibleIndices.length)&&
  new Set(c.keywordLocks.map(lock=>lock?.index)).size===c.keywordLocks.length&&
  c.keywordLocks.every(lock=>lock&&eligibleIndices.includes(lock.index)&&Array.isArray(lock.remaining)&&lock.remaining.length>0&&
   new Set(lock.remaining).size===lock.remaining.length&&lock.remaining.every(i=>i!==lock.index&&eligibleIndices.includes(i)));
}
function chooseKeyword(card){
 const eligibleIndices=card.keywords.map((_,i)=>i).filter(i=>!card.answerOnly[i]);
 const available=eligibleIndices.filter(i=>card.reviewUnmatched?!card.matchedKeywords.includes(i):!card.keywordLocks.some(lock=>lock.index===i));
 const index=available[Math.floor(Math.random()*available.length)];
 // A fresh appearance counts for every earlier correctly answered keyword.
 card.keywordLocks=card.keywordLocks.map(lock=>({...lock,remaining:lock.remaining.filter(i=>i!==index)})).filter(lock=>lock.remaining.length);
 return index;
}
function lockCorrectKeyword(card,index){
 const remaining=card.keywords.map((_,i)=>i).filter(i=>i!==index&&!card.answerOnly[i]);
 if(!remaining.length)return;
 card.keywordLocks=card.keywordLocks.filter(lock=>lock.index!==index);
 card.keywordLocks.push({index,remaining});
}
function validMatched(c){
 if(c.matchedKeywords===undefined)return true;
 const candidates=(c.keywords||[]).map((_,i)=>i).filter(i=>!c.answerOnly?.[i]);
 return Array.isArray(c.matchedKeywords)&&c.matchedKeywords.length<candidates.length&&new Set(c.matchedKeywords).size===c.matchedKeywords.length&&c.matchedKeywords.every(i=>candidates.includes(i));
}
function partialText(card){return card.matchedKeywords.length?` · 키워드 ${card.matchedKeywords.length}/${card.answerOnly.filter(v=>!v).length} 정답`:'';}
function makeCard(input){const {keywords,answerOnly}=Array.isArray(input)?{keywords:input,answerOnly:input.map(()=>false)}:input;return {id:crypto.randomUUID(),keywords:[...keywords],answerOnly:[...answerOnly],bold:[...(input.bold||keywords.map(()=>false))],keywordLocks:[],matchedKeywords:[],reviewUnmatched:false,hits:0,total:0,wrong:0,nextDecayAt:0};}
function parseKeywords(text){
 const lines=text.trim().split(/\r?\n/).map(w=>w.trim()).filter(Boolean);
 const markers=lines.map(w=>(w.match(/^[-*]+/)?.[0]||'')+(w.match(/[-*]+$/)?.[0]||''));
 const answerOnly=markers.map(m=>m.includes('-'));
 const bold=markers.map(m=>m.includes('*'));
 const keywords=lines.map(w=>w.replace(/^[-*]+|[-*]+$/g,'').trim());
 if(!validKeywords(keywords))throw Error('엔터로 구분해 키워드를 2~200개 입력해 주세요. 키워드 하나는 10,000자까지 가능합니다.');
 if(new Set(keywords.map(w=>w.normalize('NFC'))).size!==keywords.length)throw Error('같은 키워드가 중복되어 있습니다. 중복을 제거해 주세요.');
 if(answerOnly.every(Boolean))throw Error('문제로 사용할 키워드가 하나 이상 필요합니다. 하나 이상의 키워드에서 앞뒤 -를 지워 주세요.');
 return {keywords,answerOnly,bold};
}
function keywordInput(card){return card.keywords.map((w,i)=>(card.answerOnly?.[i]?'-':'')+(card.bold?.[i]?'*':'')+w).join('\n');}
function renderKeywordLines(target,card,indices,showFlags=false){
 target.replaceChildren();
 for(const i of indices){
  const line=document.createElement('span'),word=document.createElement(card.bold?.[i]?'strong':'span');
  line.className='keyword-line';word.textContent=card.keywords[i];line.append(word);
  if(showFlags&&card.answerOnly?.[i]){const flag=document.createElement('span');flag.className='keyword-flag';flag.textContent=' (정답 전용)';line.append(flag);}
  else if(showFlags&&card.reviewUnmatched&&card.matchedKeywords.includes(i)){const flag=document.createElement('span');flag.className='keyword-flag';flag.textContent=' (정답 처리됨)';line.append(flag);}
  else if(showFlags&&card.keywordLocks?.some(lock=>lock.index===i)){const flag=document.createElement('span');flag.className='keyword-flag keyword-locked';flag.textContent=' (맞힘 · 일시 제외)';line.append(flag);}
  target.append(line);
 }
}

function shuffle(ids){const out=[...ids];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function fresh(){const cards=examples.map(words=>makeCard(words));return {cards,queue:cards.map(c=>c.id),index:0,decayHours:24,correctIds:[],promptChoices:[],undoAnswers:[],pendingExclusionIds:[],reviewingCorrectId:null};}
function validCycle(s){
 return (s.correctIds===undefined||(Array.isArray(s.correctIds)&&s.correctIds.every(id=>typeof id==='string')&&new Set(s.correctIds).size===s.correctIds.length))&&
 (s.promptChoices===undefined||(Array.isArray(s.promptChoices)&&s.promptChoices.every(p=>p&&typeof p.id==='string'&&Number.isSafeInteger(p.index)&&p.index>=0)&&new Set(s.promptChoices.map(p=>p.id)).size===s.promptChoices.length));
}
function validUndo(s){
 if(s.undoAnswers===undefined)return true;
 return Array.isArray(s.undoAnswers)&&new Set(s.undoAnswers.map(u=>u?.id)).size===s.undoAnswers.length&&s.undoAnswers.every(u=>{
  const before=u?.before,card=s.cards?.find(c=>c.id===u?.id);
  return before&&card&&s.correctIds?.includes(u.id)&&before.id===u.id&&valid({cards:[before],queue:[],index:0})&&
   ['keywords','answerOnly','bold','matchedKeywords','keywordLocks'].every(key=>Array.isArray(before[key]))&&
   ['keywords','answerOnly','bold'].every(key=>JSON.stringify(before[key])===JSON.stringify(card[key]))&&
   before.total>=before.hits&&Number.isSafeInteger(before.wrong)&&before.wrong>=0&&
   Number.isSafeInteger(before.nextDecayAt)&&(before.hits>0?before.nextDecayAt>0:before.nextDecayAt===0);
 });
}
function valid(s){return s && validCycle(s) && validUndo(s) && (s.pendingExclusionIds===undefined||(Array.isArray(s.pendingExclusionIds)&&s.pendingExclusionIds.every(id=>typeof id==='string')&&new Set(s.pendingExclusionIds).size===s.pendingExclusionIds.length)) && (s.reviewingCorrectId===undefined||s.reviewingCorrectId===null||typeof s.reviewingCorrectId==='string') && (s.decayHours===undefined||DECAY_HOURS.includes(s.decayHours)) && Array.isArray(s.cards) && s.cards.every(c=>c && typeof c.id==='string' && validAnswerOnly(c) && validBold(c) && validKeywordLocks(c) && validMatched(c) && (c.reviewUnmatched===undefined||typeof c.reviewUnmatched==='boolean') && (c.keywords!==undefined?validKeywords(c.keywords):(typeof c.q==='string'&&typeof c.a==='string')) && Number.isSafeInteger(c.hits) && c.hits>=0 && Number.isInteger(c.total) && c.total>=0 && ((Number.isSafeInteger(c.nextDecayAt) && c.nextDecayAt>=0) || (c.nextDecayAt===undefined && Number.isSafeInteger(c.until) && c.until>=0))) && new Set(s.cards.map(c=>c.id)).size===s.cards.length && Array.isArray(s.queue) && s.queue.every(id=>typeof id==='string') && new Set(s.queue).size===s.queue.length && Number.isInteger(s.index) && s.index>=0 && s.index<=s.queue.length;}
let state, storageWarning='', recovery=null;
let originalStoredText=null;
try{
 originalStoredText=localStorage.getItem(KEY);
 state=originalStoredText===null?fresh():JSON.parse(originalStoredText);
 if(!valid(state))throw Error('invalid');
}catch{
 recovery={raw:originalStoredText};
 state={cards:[],queue:[],index:0,examplesV2:true};
}
function showRecovery(){
 $('recovery-panel').hidden=!recovery;$('app-main').hidden=!!recovery;$('manage').disabled=!!recovery;
 if(!recovery)return;
 $('recovery-download').disabled=recovery.raw===null;
 $('recovery-description').textContent=recovery.raw===null?
  '브라우저의 저장 기록에 접근하지 못했습니다. 기존 기록을 보호하기 위해 학습과 자동 저장을 멈췄습니다. 브라우저 설정을 확인한 뒤 새로고침하거나, 백업을 복원해 주세요.':
  '저장 기록을 읽을 수 없어 학습과 자동 저장을 멈췄습니다. 원본은 덮어쓰지 않았습니다. 먼저 원본을 내려받아 보관한 뒤 백업을 복원하거나 초기화할 수 있습니다.';
}

// Add the new example once while preserving existing cards and learning records.
if(!state.examplesV2){
 if(!state.cards.some(c=>cardKeywords(c).includes('박상진')&&cardKeywords(c).includes('대한광복회'))){
  const card=makeCard(['박상진','대한광복회']);state.cards.push(card);state.queue.push(card.id);
 }
 state.examplesV2=true;
}
function migrateDecay(s,now=Date.now()){
 delete s.round;
 if(!s.correctIds)s.correctIds=[];
 if(!s.undoAnswers)s.undoAnswers=[];
 if(!s.pendingExclusionIds)s.pendingExclusionIds=s.cards.filter(c=>c.hits>=5&&s.correctIds.includes(c.id)&&s.queue.includes(c.id)).map(c=>c.id);
 if(s.reviewingCorrectId===undefined)s.reviewingCorrectId=null;
 if(!s.promptChoices)s.promptChoices=[];
 if(s.decayHours===undefined)s.decayHours=24;
 for(const c of s.cards){
  if(!c.keywords)c.keywords=[c.q,c.a];
  if(!c.answerOnly)c.answerOnly=c.keywords.map(()=>false);
  if(!c.bold)c.bold=c.keywords.map(()=>false);
  if(!c.keywordLocks)c.keywordLocks=[];
  if(!c.matchedKeywords)c.matchedKeywords=[];
  if(c.reviewUnmatched===undefined)c.reviewUnmatched=false;
  delete c.q;delete c.a;
  if(c.nextDecayAt===undefined)c.nextDecayAt=c.hits>0?(c.until>0?c.until:now+decayInterval(s)):0;
  delete c.until;
 }
 return s;
}
function applyDecay(s,now=Date.now()){
 for(const c of s.cards){
  if(c.hits>0&&c.nextDecayAt>0&&now>=c.nextDecayAt){
   const elapsed=Math.floor((now-c.nextDecayAt)/decayInterval(s))+1;
   c.hits=Math.max(0,c.hits-elapsed);
   c.nextDecayAt=c.hits>0?c.nextDecayAt+elapsed*decayInterval(s):0;
  }
 }
}
migrateDecay(state);
let revealed=false,promptKey='',promptIndex=0;
function selectPrompt(card){
 if(!card){promptKey='';return;}
 const key=JSON.stringify([state.index,card.id,card.keywords,card.answerOnly]);
 let choice=state.promptChoices.find(p=>p.id===card.id);
 if(!choice||choice.index>=card.keywords.length||card.answerOnly[choice.index]){
  state.promptChoices=state.promptChoices.filter(p=>p.id!==card.id);
  choice={id:card.id,index:chooseKeyword(card)};state.promptChoices.push(choice);
 }
 if(key!==promptKey){promptKey=key;revealed=false;}
 promptIndex=choice.index;
}
const SAVE_FAILURE='저장하지 못했습니다. 변경 사항은 적용하지 않았습니다. 입력 내용을 유지했으니 저장 공간을 확인한 뒤 다시 시도해 주세요.';
function save(allowRecovery=false){
 if(recovery&&!allowRecovery)return false;
 try{localStorage.setItem(KEY,JSON.stringify(state));storageWarning='';return true;}
 catch{storageWarning='브라우저에 저장하지 못했습니다. 저장 공간이나 브라우저 설정을 확인해 주세요.';return false;}
}
function commitChange(change,statusId='notice',allowRecovery=false){
 if(recovery&&!allowRecovery){showRecovery();return false;}
 const before=state,ui={revealed,promptKey,promptIndex};
 state=JSON.parse(JSON.stringify(state));
 let shuffled=false;
 try{change();shuffled=prepare();selectPrompt(current());}
 catch(error){state=before;revealed=ui.revealed;promptKey=ui.promptKey;promptIndex=ui.promptIndex;throw error;}
 if(!save(allowRecovery)){
  state=before;revealed=ui.revealed;promptKey=ui.promptKey;promptIndex=ui.promptIndex;storageWarning=SAVE_FAILURE;
  render(false,false);$(statusId).textContent=SAVE_FAILURE;return false;
 }
 if(allowRecovery)recovery=null;
 render(false,false);if($(statusId).textContent===SAVE_FAILURE)$(statusId).textContent='';
 return {shuffled};
}

function eligible(card){return card.hits<5;}
function inCurrentDeck(card){return eligible(card)||state.pendingExclusionIds.includes(card.id);}
function current(){return state.cards.find(c=>c.id===state.queue[state.index]&&inCurrentDeck(c));}
function prepare(){
 applyDecay(state);
 const queued=new Set(state.queue);
 for(const card of state.cards){if(eligible(card)&&!queued.has(card.id)){state.queue.push(card.id);queued.add(card.id);}}
 while(state.index<state.queue.length && !current())state.index++;
 if(state.index>=state.queue.length){
  const ids=state.cards.filter(eligible).map(c=>c.id);
  state.correctIds=[];state.undoAnswers=[];state.pendingExclusionIds=[];state.reviewingCorrectId=null;state.promptChoices=[];state.queue=shuffle(ids);state.index=0;revealed=false;promptKey='';return ids.length>0;
 }
 return false;
}
function decayText(c){
 if(!c.hits||!c.nextDecayAt)return '현재 정답 0회';
 const mins=Math.max(1,Math.ceil((c.nextDecayAt-Date.now())/60000));
 return mins>=60?`${Math.floor(mins/60)}시간 ${mins%60}분 뒤 −1회`:`${mins}분 뒤 −1회`;
}
function render(persist=true,advance=true){
 showRecovery();if(recovery)return false;
 const shuffled=advance?prepare():false;
 const c=current(), active=state.cards.filter(inCurrentDeck).length;
 selectPrompt(c);if(persist)save();
 $('total').textContent=state.cards.length;$('active').textContent=active;$('mastered').textContent=state.cards.filter(c=>!inCurrentDeck(c)).length;
 $('decay-hours').value=String(state.decayHours);
 $('decay-summary').textContent=`마지막 1회 완성부터 ${state.decayHours}시간마다 현재 정답 횟수가 1씩 줄어듭니다.`;
 $('position').textContent=c?`${state.index+1} / ${state.queue.length}번째 카드`:'학습할 카드 없음';
 $('round-progress').max=Math.max(1,state.queue.length);$('round-progress').value=c?state.index+1:state.queue.length;
 $('card').disabled=!c;$('answer').hidden=!revealed||!c;
 $('card').setAttribute('aria-expanded',String(!!c&&revealed));
 $('card').setAttribute('aria-label',revealed?'카드를 눌러 정답 가리기':'카드를 눌러 정답 보기');
 $('previous').disabled=!c||previousIndex()<0;
 $('next').disabled=!c;
 $('next').textContent=hasNext()?'다음 카드 →':'다음 바퀴 →';
 $('card-label').textContent=c?(revealed?'ANSWER':'QUESTION'):'ALL CLEAR';
 $('question').textContent=c?c.keywords[promptIndex]:state.cards.length?'모든 카드가 5회 이상입니다.':'첫 카드를 추가해 보세요.';
 $('question').style.fontWeight=c?.bold[promptIndex]?'800':'500';
 if(c)renderKeywordLines($('answer'),c,c.keywords.map((_,i)=>i).filter(i=>i!==promptIndex));else $('answer').replaceChildren();
 $('hint').textContent=c?(revealed?'다시 눌러 가리기 · 길게 눌러 수정':'눌러 정답 확인 · 길게 눌러 수정'):state.cards.length?'현재 정답 횟수가 4회 이하가 되면 자동으로 다시 나옵니다.':'상단의 카드 관리에서 내용을 추가할 수 있어요.';
 $('card-count').textContent=c?`현재 정답 ${c.hits}회 · 누적 정답 ${c.total}회${partialText(c)}`:'';
 $('dots').replaceChildren();if(c)for(let i=0;i<5;i++){const dot=document.createElement('span');dot.className='dot'+(i<c.hits?' done':i===c.hits&&c.matchedKeywords.length?' partial':'');$('dots').append(dot);}
 $('wrong').disabled=!c||!revealed;
 const alreadyCorrect=!!c&&state.correctIds.includes(c.id);
 $('correct').disabled=!c||!revealed||alreadyCorrect;
 $('correct-label').textContent=alreadyCorrect?'이미 기억했어요':'기억했어요';
 $('correct').title=alreadyCorrect?'이번 순서에서 이미 정답으로 기록한 카드입니다.':'';
 $('grade-buttons').hidden=alreadyCorrect;
 $('undo-correct').hidden=!alreadyCorrect;
 $('undo-correct').disabled=false;
 $('backup-limit').textContent=state.cards.length>10000?'카드가 10,000개를 넘어 현재 데이터는 백업할 수 없습니다. 카드 수를 줄여 주세요.':'';
 $('save-alert').textContent=storageWarning||$('backup-limit').textContent;
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
 const selected=current();if(!selected||!revealed||state.correctIds.includes(selected.id))return;
 let completed=false,excluded=false,moved=false;
 const result=commitChange(()=>{
  applyDecay(state);const c=current();
  if(ok){
   state.undoAnswers=state.undoAnswers.filter(u=>u.id!==c.id);
   state.undoAnswers.push({id:c.id,before:JSON.parse(JSON.stringify(c))});
   lockCorrectKeyword(c,promptIndex);state.correctIds.push(c.id);
   if(!c.matchedKeywords.includes(promptIndex))c.matchedKeywords.push(promptIndex);
   if(c.matchedKeywords.length===c.answerOnly.filter(v=>!v).length){c.matchedKeywords=[];c.reviewUnmatched=false;c.hits++;c.total++;c.nextDecayAt=Date.now()+decayInterval(state);completed=true;}
   excluded=!eligible(c);if(excluded&&!state.pendingExclusionIds.includes(c.id))state.pendingExclusionIds.push(c.id);state.reviewingCorrectId=c.id;
   if(hasNext()){state.index++;state.reviewingCorrectId=null;revealed=false;promptKey='';moved=true;}
  }else{c.wrong=(c.wrong||0)+1;state.index++;state.reviewingCorrectId=null;revealed=false;promptKey='';}
 });
 if(!result)return;
 if(result.shuffled)animateShuffle();
 $('notice').textContent=excluded?'5회 정답을 채웠습니다. 이번 바퀴에서는 유지하고 다음 바퀴부터 학습에서 제외됩니다.':completed?'모든 문제 키워드를 맞혀 정답 카운트가 1회 올라갔습니다.':moved?'정답을 저장했습니다. 이전 카드로 돌아가 취소할 수 있습니다.':'마지막 카드의 정답을 저장했습니다. 취소하거나 다음 바퀴로 이동할 수 있습니다.';
 if(!ok)$('notice').textContent=result.shuffled?'카드 순서를 새로 섞었습니다.':'';
}
function undoCorrect(){
 const selected=current();if(!selected||!state.correctIds.includes(selected.id))return;
 const exact=state.undoAnswers.some(u=>u.id===selected.id);
 const result=commitChange(()=>{
  const c=current(),undo=state.undoAnswers.find(u=>u.id===c.id);
  if(undo){
   const restored=JSON.parse(JSON.stringify(undo.before));
   applyDecay({cards:[restored],decayHours:state.decayHours});
   for(const key of ['hits','total','wrong','nextDecayAt','matchedKeywords','keywordLocks'])c[key]=restored[key];
   c.reviewUnmatched=restored.reviewUnmatched??false;
  }else{
   // Older versions have no exact pre-O snapshot; restart only this partial group.
   c.matchedKeywords=[];c.keywordLocks=[];c.reviewUnmatched=false;
  }
  state.correctIds=state.correctIds.filter(id=>id!==c.id);state.undoAnswers=state.undoAnswers.filter(u=>u.id!==c.id);
  if(eligible(c))state.pendingExclusionIds=state.pendingExclusionIds.filter(id=>id!==c.id);
  state.reviewingCorrectId=null;revealed=false;
 });
 if(result)$('notice').textContent=exact?'정답 처리를 취소했습니다. 같은 문제를 다시 외울 수 있습니다.':'이전 버전의 정답 기록은 취소 전 정보가 없어 완성 횟수를 유지했습니다. 부분 진행을 초기화해 다시 외울 수 있습니다.';
}
$('undo-correct').onclick=undoCorrect;

function previousIndex(){
 for(let i=state.index-1;i>=0;i--){const c=state.cards.find(c=>c.id===state.queue[i]);if(c&&inCurrentDeck(c))return i;}
 return -1;
}
function hasNext(){return state.queue.slice(state.index+1).some(id=>state.cards.some(c=>c.id===id&&inCurrentDeck(c)));}
function navigate(direction){
 if(!current())return;
 const previous=direction===-1?previousIndex():-1;
 if(direction===-1&&previous<0)return;if(direction!==-1&&direction!==1)return;
 const result=commitChange(()=>{state.reviewingCorrectId=null;if(direction===-1)state.index=previous;else state.index++;revealed=false;promptKey='';});
 if(!result)return;
 if(result.shuffled)animateShuffle();$('notice').textContent=result.shuffled?'카드 순서를 새로 섞었습니다.':'';
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
  if(current()?.id!==id||$('editor').open||$('edit-dialog').open)return;
  suppressCardClick=true;shuffleAnimation?.cancel();
  startEdit(id);
 },550);
};
$('card').onpointermove=e=>{if(pressStart&&Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y)>10)cancelCardPress();};
$('card').onpointerup=cancelCardPress;
$('card').onpointercancel=cancelCardPress;
$('card').onpointerleave=cancelCardPress;
$('card').oncontextmenu=e=>e.preventDefault();
window.addEventListener('blur',cancelCardPress);
$('card').onclick=()=>{cancelCardPress();if(suppressCardClick){suppressCardClick=false;return;}reveal();};$('wrong').onclick=()=>grade(false);$('correct').onclick=()=>grade(true);
const editorTabs=['list','edit','clipboard','settings'];
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
let editingId=null,editingOriginal='';
function resetEditor(){$('card-keywords').value='';}
function editProgress(card,input){
 const known=new Set(card.keywords.filter((_,i)=>!card.answerOnly[i]).map(w=>w.normalize('NFC')));
 const candidates=input.keywords.map((_,i)=>i).filter(i=>!input.answerOnly[i]);
 const matched=candidates.filter(i=>known.has(input.keywords[i].normalize('NFC')));
 return {relearn:card.hits>=5&&matched.length<candidates.length,matched};
}
function updateEditNotice(){
 const changed=$('edit-keywords').value!==editingOriginal;
 $('edit-warning').hidden=!changed;$('save-edit').disabled=!changed;
 const card=state.cards.find(c=>c.id===editingId);
 $('edit-warning').textContent='수정하면 부분 정답 진행, 키워드 일시 제외와 이번 순서의 정답 처리가 초기화됩니다. 완성한 정답 횟수는 유지됩니다. 띄어쓰기·순서·굵기 변경도 동일하게 적용됩니다.';
 if(!card)return;
 const currentProgress=JSON.parse(JSON.stringify(card));applyDecay({cards:[currentProgress],decayHours:state.decayHours});
 if(currentProgress.hits<5)return;
 try{
  const plan=editProgress(currentProgress,parseKeywords($('edit-keywords').value));
  $('edit-warning').hidden=!changed||!plan.relearn;
  $('edit-warning').textContent=plan.relearn?
   '새로 외울 문제 키워드가 있어 현재 정답 횟수를 4회로 내립니다. 그대로 남은 기존 문제 키워드는 정답 처리하며, 남은 키워드를 모두 맞히면 1회 올라갑니다. 누적 횟수와 다음 감소 시각은 유지됩니다.':
   '새로 외울 문제 키워드가 없어 기존 정답 횟수를 유지합니다. 키워드 일시 제외와 이번 순서의 정답 처리는 초기화됩니다.';
 }catch{$('edit-warning').textContent='새 문제 키워드가 있으면 현재 정답 횟수를 4회로 내리고 기존 문제 키워드는 정답 처리합니다. 입력 내용을 확인해 주세요.';}
}
function startEdit(id){
 if(recovery)return;
 const card=state.cards.find(c=>c.id===id);if(!card)return;
 editingId=id;editingOriginal=keywordInput(card);$('edit-keywords').value=editingOriginal;
 $('edit-status').textContent='';updateEditNotice();
 if(!$('edit-dialog').open)$('edit-dialog').showModal();$('edit-keywords').focus();
}
$('edit-keywords').oninput=updateEditNotice;
$('close-edit').onclick=()=>$('edit-dialog').close();
$('edit-dialog').addEventListener('close',()=>{editingId=null;editingOriginal='';});
$('edit-form').onsubmit=e=>{
 e.preventDefault();if(!editingId)return;
 if($('edit-keywords').value===editingOriginal){$('edit-dialog').close();return;}
 let input;try{input=parseKeywords($('edit-keywords').value);}catch(error){$('edit-status').textContent=error.message;return;}
 const id=editingId;
 if(!state.cards.some(c=>c.id===id)){$('edit-status').textContent='삭제된 카드입니다. 수정할 수 없습니다.';return;}
 let relearn=false,wasMastered=false;
 const result=commitChange(()=>{
  applyDecay(state);const card=state.cards.find(c=>c.id===id);
  const plan=editProgress(card,input);relearn=plan.relearn;wasMastered=card.hits>=5;
  card.keywords=input.keywords;card.answerOnly=input.answerOnly;card.bold=input.bold;
  card.keywordLocks=[];card.matchedKeywords=relearn?plan.matched:[];card.reviewUnmatched=relearn;
  if(relearn){card.hits=4;state.pendingExclusionIds=state.pendingExclusionIds.filter(value=>value!==id);}
  state.correctIds=state.correctIds.filter(value=>value!==id);state.undoAnswers=state.undoAnswers.filter(u=>u.id!==id);
  state.promptChoices=state.promptChoices.filter(p=>p.id!==id);
  if(state.reviewingCorrectId===id)state.reviewingCorrectId=null;
  if(current()?.id===id){revealed=false;promptKey='';}
 },'edit-status');
 if(!result)return;
 $('edit-dialog').close();
 const message=relearn?'수정 내용을 저장했습니다. 현재 정답 4회로 돌아가 새 문제 키워드를 학습합니다.':wasMastered?'수정 내용을 저장했습니다.':'수정 내용을 저장했습니다. 이 카드의 부분 진행을 초기화했습니다.';
 $('editor-status').textContent=message;$('notice').textContent=message;
};

function editorList(){
 $('mastery').textContent=`${state.cards.filter(c=>c.total>0).length} / ${state.cards.length} 정답 경험`;
 const query=$('card-search').value.trim().normalize('NFC').toLocaleLowerCase();
 const cards=state.cards.filter(c=>c.keywords.some(value=>value.normalize('NFC').toLocaleLowerCase().includes(query)));
 $('search-status').textContent=query?`검색 결과 ${cards.length}개 / 전체 ${state.cards.length}개`:`전체 ${cards.length}개`;
 $('editable-list').replaceChildren();
 if(!cards.length){const empty=document.createElement('p');empty.className='muted small';empty.textContent=query?'검색 결과가 없습니다. 다른 검색어를 입력해 주세요.':'등록된 카드가 없습니다.';$('editable-list').append(empty);}
 for(const c of cards){const row=document.createElement('div'),text=document.createElement('span'),button=document.createElement('button');row.className='edit-row';renderKeywordLines(text,c,c.keywords.map((_,i)=>i),true);button.textContent='삭제';button.type='button';button.className='delete';button.setAttribute('aria-label',c.keywords.join(', ')+' 삭제');button.onclick=()=>{if(!confirm('이 카드와 학습 기록을 삭제할까요?'))return;const id=current()?.id;const result=commitChange(()=>{state.cards=state.cards.filter(x=>x.id!==c.id);state.pendingExclusionIds=state.pendingExclusionIds.filter(id=>id!==c.id);state.correctIds=state.correctIds.filter(value=>value!==c.id);state.undoAnswers=state.undoAnswers.filter(u=>u.id!==c.id);if(c.id===id){revealed=false;state.reviewingCorrectId=null;}},'list-status');if(result)$('list-status').textContent='카드를 삭제했습니다.';};
 const edit=document.createElement('button'),actions=document.createElement('div');
 edit.type='button';edit.className='outline';edit.textContent='수정';edit.setAttribute('aria-label',c.keywords.join(', ')+' 수정');edit.onclick=()=>startEdit(c.id);
 const details=document.createElement('div'),meta=document.createElement('div'),count=document.createElement('span'),status=document.createElement('span'),bar=document.createElement('progress');
 details.className='edit-details';text.className='list-title';
 meta.className='list-meta';count.textContent=`현재 정답 ${c.hits}회 · 누적 정답 ${c.total}회${partialText(c)}`;
 status.textContent=(!inCurrentDeck(c)?'학습 제외 · ':!eligible(c)?'다음 바퀴부터 제외 · ':c.id===current()?.id?'학습 중 · ':'')+decayText(c);
 bar.max=5;bar.value=Math.min(c.hits,5);bar.setAttribute('aria-label',`${c.keywords.join(', ')} 목표 진행도`);
 meta.append(count,status);details.append(text,meta,bar);
 actions.className='edit-actions';actions.append(edit,button);row.append(details,actions);$('editable-list').append(row);}}
$('card-search').oninput=editorList;
$('manage').onclick=()=>{if(recovery)return;selectEditorTab('list');resetEditor();$('card-search').value='';editorList();$('editor-status').textContent='';$('editor').showModal();};$('close').onclick=()=>$('editor').close();
$('card-form').onsubmit=e=>{
 e.preventDefault();let input;
 try{input=parseKeywords($('card-keywords').value);}catch(error){$('editor-status').textContent=error.message;return;}
 const result=commitChange(()=>{const card=makeCard(input);state.cards.push(card);state.queue.push(card.id);},'editor-status');
 if(!result)return;
 resetEditor();$('editor-status').textContent='카드를 저장했습니다.';$('card-keywords').focus();
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
  for(const card of cards){const row=document.createElement('li');renderKeywordLines(row,card,card.keywords.map((_,i)=>i),true);$('clipboard-list').append(row);}
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
 const result=commitChange(()=>{state.cards.push(...additions);state.queue.push(...additions.map(c=>c.id));},'clipboard-status');
 if(!result)return;
 clearClipboardPreview();$('clipboard-text').value='';$('card-search').value='';editorList();
 $('clipboard-status').textContent=`카드 ${additions.length}개를 저장했습니다.`;
};
$('editor').addEventListener('close',()=>{clearClipboardPreview();});
$('decay-hours').onchange=()=>{
 const hours=Number($('decay-hours').value);
 if(!DECAY_HOURS.includes(hours)){$('decay-hours').value=String(state.decayHours);return;}
 if(hours===state.decayHours)return;
 const now=Date.now();
 const result=commitChange(()=>{
  const previousHours=state.decayHours;applyDecay(state,now);state.decayHours=hours;
  for(const card of state.cards)card.nextDecayAt=card.hits>0?now+decayInterval(state):0;
  for(const undo of state.undoAnswers){applyDecay({cards:[undo.before],decayHours:previousHours},now);undo.before.nextDecayAt=undo.before.hits>0?now+decayInterval(state):0;}
 },'settings-status');
 if(!result)return;
 $('settings-status').textContent=`${hours}시간으로 저장했습니다. 현재 정답 횟수가 있는 카드는 지금부터 ${hours}시간 뒤에 1회 감소합니다.`;
};
const BACKUP_FORMAT='five-recall-backup';
const MAX_BACKUP_BYTES=10*1024*1024;
function backupText(){
 if(recovery)throw Error('recovery required');
 applyDecay(state);save();
 return JSON.stringify({format:BACKUP_FORMAT,version:11,exportedAt:new Date().toISOString(),state},null,2);
}
function parseBackup(text){
 const data=JSON.parse(text);
 if(!data||data.format!==BACKUP_FORMAT||![1,2,3,4,5,6,7,8,9,10,11].includes(data.version)||!valid(data.state))throw Error('invalid');
 const s=data.state;
 if(data.version>=11&&!s.cards.every(c=>typeof c.reviewUnmatched==='boolean'))throw Error('invalid');
 if(data.version>=10&&!Array.isArray(s.undoAnswers))throw Error('invalid');
 if(data.version>=9&&!s.cards.every(c=>Array.isArray(c.matchedKeywords)))throw Error('invalid');
 if(data.version>=8&&!s.cards.every(c=>Array.isArray(c.keywordLocks)))throw Error('invalid');
 if(data.version>=7&&!s.cards.every(c=>Array.isArray(c.bold)))throw Error('invalid');
 if(data.version>=5&&!DECAY_HOURS.includes(s.decayHours))throw Error('invalid');
 if(data.version>=6&&(!Array.isArray(s.correctIds)||!Array.isArray(s.promptChoices)))throw Error('invalid');
 const count=n=>Number.isSafeInteger(n)&&n>=0;
 if(s.cards.length>10000||s.queue.length>100000||
  !s.cards.every(c=>c.id.length>0&&c.id.length<=200&&(data.version>=3?(validKeywords(c.keywords)&&(data.version<4||Array.isArray(c.answerOnly))):(typeof c.q==='string'&&c.q.trim().length>0&&c.q.length<=5000&&typeof c.a==='string'&&c.a.trim().length>0&&c.a.length<=10000))&&count(c.total)&&c.total>=c.hits&&
   count(c.wrong)&&(data.version===1?
    (count(c.until)&&c.until<=8640000000000000&&c.hits<=5&&(c.until>0?c.hits===5:c.hits<5)):
    (count(c.nextDecayAt)&&c.nextDecayAt<=8640000000000000&&(c.hits>0?c.nextDecayAt>0:c.nextDecayAt===0))))||!s.queue.every(id=>id.length>0&&id.length<=200))throw Error('invalid');
 // Copy supported fields only; old queue IDs for deleted cards are skipped by prepare().
 return migrateDecay({cards:s.cards.map(c=>({id:c.id,...(data.version>=3?{keywords:[...c.keywords],...(data.version>=4?{answerOnly:[...c.answerOnly]}:{}),...(data.version>=7?{bold:[...c.bold]}:{})}:{q:c.q,a:c.a}),matchedKeywords:data.version>=9?[...c.matchedKeywords]:[],reviewUnmatched:data.version>=11?c.reviewUnmatched:false,keywordLocks:data.version>=8?c.keywordLocks.map(lock=>({index:lock.index,remaining:[...lock.remaining]})):[],hits:c.hits,total:c.total,wrong:c.wrong,...(data.version===1?{until:c.until}:{nextDecayAt:c.nextDecayAt})})),
  queue:[...s.queue],index:s.index,examplesV2:true,pendingExclusionIds:data.version>=10&&s.pendingExclusionIds?[...s.pendingExclusionIds]:undefined,undoAnswers:data.version>=10?JSON.parse(JSON.stringify(s.undoAnswers)):[],reviewingCorrectId:data.version>=10?(s.reviewingCorrectId??null):null,decayHours:data.version>=5?s.decayHours:24,correctIds:data.version>=6?[...s.correctIds]:[],promptChoices:data.version>=6?s.promptChoices.map(p=>({id:p.id,index:p.index})):[]});
}
$('backup-download').onclick=()=>{
 try{
  if(state.cards.length>10000){$('backup-status').textContent='카드가 10,000개를 넘어 복원 가능한 백업을 만들 수 없습니다. 카드 수를 줄여 주세요.';return;}
  const blob=new Blob([backupText()],{type:'application/json;charset=utf-8'});
  if(blob.size>MAX_BACKUP_BYTES){$('backup-status').textContent='백업 용량이 10MB를 넘어 복원할 수 없습니다. 카드 수나 내용을 줄여 주세요.';return;}
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`five-recall-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('backup-status').textContent=`카드 ${state.cards.length}개와 학습 기록의 백업 다운로드를 요청했습니다.`;
 }catch{$('backup-status').textContent='백업 파일을 만들지 못했습니다. 다시 시도해 주세요.';}
};
$('backup-restore').onclick=()=>$('backup-file').click();
$('recovery-restore').onclick=()=>$('backup-file').click();
$('recovery-download').onclick=()=>{
 if(!recovery||recovery.raw===null)return;
 try{
  const url=URL.createObjectURL(new Blob([recovery.raw],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=`five-recall-original-${Date.now()}.txt`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('recovery-status').textContent='원본 다운로드를 요청했습니다. 이 파일은 복구 분석용 원본이며 일반 백업 파일과 다릅니다.';
 }catch{$('recovery-status').textContent='원본을 내려받지 못했습니다. 원본은 그대로 보존되어 있습니다.';}
};
$('recovery-reset').onclick=()=>{
 if(!recovery||!confirm('기존 저장 기록을 삭제하고 예시 카드로 새로 시작할까요? 먼저 원본을 내려받아 보관하는 것을 권장합니다.'))return;
 const result=commitChange(()=>{state=fresh();state.examplesV2=true;promptKey='';revealed=false;},'recovery-status',true);
 if(result)$('notice').textContent='기록을 초기화하고 예시 카드로 시작했습니다.';
};
$('backup-file').onchange=async()=>{
 const input=$('backup-file'),file=input.files?.[0];if(!file)return;
 const statusId=recovery?'recovery-status':'backup-status';
 $('backup-restore').disabled=true;$('recovery-restore').disabled=true;$('recovery-reset').disabled=true;
 try{
  if(file.size>MAX_BACKUP_BYTES){$(statusId).textContent='10MB 이하의 백업 파일을 선택해 주세요.';return;}
  let restored;
  try{restored=parseBackup(await file.text());}
  catch{$(statusId).textContent='올바른 백업 파일이 아닙니다. 현재 데이터는 유지됩니다.';return;}
  if(!confirm(recovery?'백업으로 기존 저장 기록을 덮어쓰고 복구할까요? 필요하면 취소 후 원본을 먼저 내려받아 주세요.':`백업의 카드 ${restored.cards.length}개와 학습 기록으로 현재 카드 ${state.cards.length}개를 덮어쓸까요? 수정 중인 내용도 사라집니다. 필요하면 취소 후 먼저 백업해 주세요.`)){
   $(statusId).textContent='복원을 취소했습니다. 현재 데이터는 유지됩니다.';return;
  }
  const result=commitChange(()=>{state=restored;promptKey='';revealed=false;},statusId,!!recovery);
  if(!result)return;
  resetEditor();$('card-search').value='';$('editor-status').textContent='';$('notice').textContent='';editorList();
  $(statusId).textContent=`카드 ${state.cards.length}개와 학습 기록을 복원했습니다.`;
  if(statusId==='recovery-status')$('notice').textContent='백업으로 저장 기록을 복구했습니다.';
 }finally{input.value='';$('backup-restore').disabled=false;$('recovery-restore').disabled=false;$('recovery-reset').disabled=false;}
};
window.addEventListener('keydown',e=>{if(recovery||$('editor').open||$('edit-dialog').open||e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.key===' '||e.key==='Enter'){if(e.target.tagName==='BUTTON')return;e.preventDefault();reveal();}else if(e.key.toLowerCase()==='o')grade(true);else if(e.key.toLowerCase()==='x')grade(false);});
window.addEventListener('storage',e=>{
 if(e.key!==KEY||e.newValue===null||recovery)return;
 try{
  const incoming=JSON.parse(e.newValue);if(!valid(incoming))throw Error('invalid');
  state=migrateDecay(incoming);revealed=false;render();
 }catch{
  recovery={raw:e.newValue};
  if($('edit-dialog').open)$('edit-dialog').close();if($('editor').open)$('editor').close();
  render(false,false);
 }
});
setInterval(()=>{if(state.cards.some(c=>c.nextDecayAt))render();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
render();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_learning_progress',description:'현재 암기 카드와 학습 진행도를 조회합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({cards:state.cards.map(c=>({keywords:[...c.keywords],answerOnly:[...c.answerOnly],bold:[...c.bold],matchedKeywords:[...c.matchedKeywords],hits:c.hits,total:c.total,nextDecayAt:c.nextDecayAt}))})})).catch(()=>{});}catch{}}

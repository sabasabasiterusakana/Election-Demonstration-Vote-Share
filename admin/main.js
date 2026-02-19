import { db, ADMIN_PASSCODE } from "../firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COLORS = ['#1a56db','#e03131','#2f9e44','#e67700','#7048e8','#0ca678','#f76707','#c2255c','#1098ad','#6741d9'];
let selColor = COLORS[0];
let candidates = [], votes = [];

const $ = id => document.getElementById(id);
const fmtN = n => (n||0).toLocaleString('ja-JP');
function showToast(msg) {
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600);
}
function fmtTime(ts) {
  if(!ts) return '時刻不明';
  const d=ts.toDate?ts.toDate():new Date(ts);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// ===== PASSCODE =====
window.checkPasscode = function() {
  if ($('passcodeInput').value === ADMIN_PASSCODE) {
    $('gate').style.display='none';
    ['mainUI','sec1','sec2','sec3','sec4','sec5'].forEach(id=>$(id).style.display='');
    initAdmin();
  } else {
    $('gateErr').style.display='block';
    $('passcodeInput').classList.add('err');
    setTimeout(()=>$('passcodeInput').classList.remove('err'),1000);
  }
};

async function initAdmin() {
  try {
    const cfg = await getDoc(doc(db,"election","config"));
    if(cfg.exists()) $('elNameInput').value = cfg.data().name||'';
  } catch(e){}

  initColors();

  onSnapshot(collection(db,"candidates"), snap=>{
    candidates=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderCandList();
  });
  onSnapshot(collection(db,"votes"), snap=>{
    votes=snap.docs.map(d=>({id:d.id,...d.data()}));
    votes.sort((a,b)=>{
      const ta=a.votedAt?.toMillis?a.votedAt.toMillis():0;
      const tb=b.votedAt?.toMillis?b.votedAt.toMillis():0;
      return tb-ta;
    });
    renderVoteLog();
  });
}

function initColors() {
  $('colorGrid').innerHTML=COLORS.map((c,i)=>`
    <div class="cp${i===0?' selected':''}" style="background:${c}" onclick="pickColor('${c}',this)"></div>
  `).join('');
}
window.pickColor=function(c,el){ selColor=c; document.querySelectorAll('.cp').forEach(e=>e.classList.remove('selected')); el.classList.add('selected'); };

window.saveElectionName=async function(){
  const name=$('elNameInput').value.trim(); if(!name) return;
  await setDoc(doc(db,"election","config"),{name});
  showToast('選挙名を保存しました');
};

window.addCandidate=async function(){
  const name=$('fName').value.trim();
  if(!name){showToast('候補者名を入力してください');return;}
  const tags=$('fTags').value.split(',').map(t=>t.trim()).filter(Boolean);
  await setDoc(doc(db,"candidates",'c'+Date.now()),{
    name, votes:0, color:selColor,
    party:$('fParty').value.trim()||'無所属',
    age:parseInt($('fAge').value)||null,
    district:$('fDistrict').value.trim()||'',
    bio:$('fBio').value.trim()||'',
    tags, createdAt:serverTimestamp(),
  });
  ['fName','fParty','fAge','fDistrict','fBio','fTags'].forEach(id=>$(id).value='');
  showToast('追加しました');
};

function renderCandList(){
  const s=[...candidates].sort((a,b)=>(b.votes||0)-(a.votes||0));
  if(!s.length){$('candManageList').innerHTML='<div style="color:var(--muted);font-size:13px">候補者なし</div>';return;}
  $('candManageList').innerHTML=s.map(c=>`
    <div class="cand-row">
      <div class="cand-row-left">
        <div class="cdot" style="background:${c.color}"></div>
        <div>
          <div class="cname">${c.name}</div>
          <div class="cmeta">${c.party}${c.age?` · ${c.age}歳`:''}</div>
          <div class="cvotes" style="color:${c.color}">${fmtN(c.votes||0)} 票</div>
        </div>
      </div>
      <button class="btn-del" onclick="deleteCand('${c.id}','${c.name}')">🗑️</button>
    </div>`).join('');
}

window.deleteCand=async function(id,name){
  if(!confirm(`「${name}」を削除しますか？`)) return;
  await deleteDoc(doc(db,"candidates",id));
  showToast('削除しました');
};

function renderVoteLog(){
  $('logCount').textContent=`${votes.length}件`;
  if(!votes.length){
    $('voteLogList').innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">まだ投票がありません</div>';
    return;
  }
  $('voteLogList').innerHTML=votes.map(v=>{
    const c=candidates.find(x=>x.id===v.candidateId);
    const photoHtml=v.voterPhoto
      ?`<img class="log-photo" src="${v.voterPhoto}" referrerpolicy="no-referrer">`
      :`<div class="log-photo-ph">${(v.voterName||'?')[0]}</div>`;
    return `
    <div class="log-item">
      <div class="log-voter-row">
        ${photoHtml}
        <div>
          <div class="log-vname">${v.voterName||'名前なし'}</div>
          <div class="log-email">${v.voterEmail||''}</div>
        </div>
      </div>
      <div class="log-vote-row">
        <span class="log-arrow">↳</span>
        <div class="log-cdot" style="background:${c?.color||'#ccc'}"></div>
        <span class="log-cname" style="color:${c?.color||'var(--text)'}">${v.candidateName||'不明'}</span>
      </div>
      <div class="log-time">🕐 ${fmtTime(v.votedAt)}</div>
    </div>`;
  }).join('');
}

window.resetVotes=async function(){
  if(!confirm('全投票データを削除しますか？（候補者はそのまま残ります）')) return;
  const vSnap=await getDocs(collection(db,"votes"));
  for(const d of vSnap.docs) await deleteDoc(d.ref);
  const cSnap=await getDocs(collection(db,"candidates"));
  for(const d of cSnap.docs) await setDoc(d.ref,{...d.data(),votes:0});
  showToast('投票データをリセットしました');
};

window.resetAll=async function(){
  if(!confirm('候補者・投票データをすべて削除しますか？\nこの操作は元に戻せません。')) return;
  const vSnap=await getDocs(collection(db,"votes"));
  for(const d of vSnap.docs) await deleteDoc(d.ref);
  const cSnap=await getDocs(collection(db,"candidates"));
  for(const d of cSnap.docs) await deleteDoc(d.ref);
  showToast('全データを削除しました');
};

$('loadingScreen').classList.add('hidden');
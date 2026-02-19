import { db } from "../firebase.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let candidates=[], votes=[];
const $    = id => document.getElementById(id);
const fmtN = n  => (n||0).toLocaleString('ja-JP');
const totalV = () => candidates.reduce((a,c)=>a+(c.votes||0),0);
const pct    = v => { const t=totalV(); return t?(v/t*100).toFixed(1):'0.0'; };
const sorted = () => [...candidates].sort((a,b)=>(b.votes||0)-(a.votes||0));

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} `
       + `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function init() {
  try {
    const cfg = await getDoc(doc(db,"election","config"));
    if(cfg.exists()) $('headerSub').textContent = cfg.data().name||'模擬投票';
  } catch(e){}

  onSnapshot(collection(db,"candidates"), snap => {
    candidates = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });
  onSnapshot(collection(db,"votes"), snap => {
    votes = snap.docs.map(d=>({id:d.id,...d.data()}));
    votes.sort((a,b)=>{
      const ta=a.votedAt?.toMillis?a.votedAt.toMillis():0;
      const tb=b.votedAt?.toMillis?b.votedAt.toMillis():0;
      return tb-ta;
    });
    renderLog();
  });
  $('loadingScreen').classList.add('hidden');
}

function renderAll() {
  $('totalDisplay').textContent  = fmtN(totalV());
  $('candCountSub').textContent  = `候補者 ${candidates.length} 名`;
  renderDonut(); renderRanking();
}

function renderDonut() {
  const s=sorted(), total=totalV();
  const cx=65,cy=65,r=56,ir=32;
  let startA=-Math.PI/2, paths='', legend='';
  s.forEach(c=>{
    const frac=total?(c.votes||0)/total:(1/(s.length||1));
    const angle=frac*2*Math.PI, end=startA+angle;
    const x1=cx+r*Math.cos(startA),y1=cy+r*Math.sin(startA);
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);
    const ix1=cx+ir*Math.cos(startA),iy1=cy+ir*Math.sin(startA);
    const ix2=cx+ir*Math.cos(end),iy2=cy+ir*Math.sin(end);
    const lg=angle>Math.PI?1:0;
    paths+=`<path d="M${x1},${y1} A${r},${r} 0 ${lg} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${lg} 0 ${ix1},${iy1} Z" fill="${c.color}"/>`;
    startA=end;
    legend+=`<div class="leg-row"><div class="leg-dot" style="background:${c.color}"></div><div class="leg-name">${c.name}</div><div class="leg-pct" style="color:${c.color}">${pct(c.votes||0)}%</div></div>`;
  });
  if(!s.length) paths=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--border)"/><circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/>`;
  else paths+=`<circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/>
    <text x="${cx}" y="${cy-4}" text-anchor="middle" font-family="Noto Sans JP,sans-serif" font-size="14" font-weight="900" fill="var(--text)">${fmtN(totalV())}</text>
    <text x="${cx}" y="${cy+12}" text-anchor="middle" font-family="Noto Sans JP,sans-serif" font-size="9" fill="var(--muted)">票</text>`;
  $('donutSvg').innerHTML=paths;
  $('donutLegend').innerHTML=legend||'<div style="color:var(--muted);font-size:12px">候補者なし</div>';
}

function renderRanking() {
  const s=sorted(); const maxV=s[0]?.votes||1;
  $('rankingList').innerHTML=s.map((c,i)=>`
    <div class="rank-row">
      <div class="rn rn${i+1}">${i+1}</div>
      <div class="rank-info">
        <div class="rank-name">${c.name}</div>
        <div class="rank-party">${c.party}</div>
        <div class="rank-bar-wrap">
          <div class="prog-track">
            <div class="prog-fill" style="width:${totalV()?((c.votes||0)/maxV*100).toFixed(1):0}%;background:${c.color}"></div>
          </div>
        </div>
      </div>
      <div class="rank-right">
        <div class="rank-votes" style="color:${c.color}">${fmtN(c.votes||0)}</div>
        <div class="rank-vunit">票</div>
        <div class="rank-vpct" style="color:${c.color}">${pct(c.votes||0)}%</div>
      </div>
    </div>`).join('')||'<div style="color:var(--muted);font-size:13px;padding:10px 0">候補者なし</div>';
}

function renderLog() {
  $('logCount').textContent = `${votes.length}件`;
  if (!votes.length) {
    $('voteLog').innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">まだ投票がありません</div>';
    return;
  }
  $('voteLog').innerHTML = votes.map(v=>{
    const c = candidates.find(x=>x.id===v.candidateId);
    const photoHtml = v.voterPhoto
      ? `<img class="log-photo" src="${v.voterPhoto}" referrerpolicy="no-referrer">`
      : `<div class="log-photo-ph">${(v.voterName||'?')[0]}</div>`;
    return `
    <div class="log-item">
      <div class="log-voter-row">
        ${photoHtml}
        <div>
          <div class="log-voter-name">${v.voterName||'名前なし'}</div>
          <div class="log-voter-email">${v.voterEmail||''}</div>
        </div>
      </div>
      <div class="log-vote-row">
        <span class="log-arrow">↳</span>
        <div class="log-cand-dot" style="background:${c?.color||'#ccc'}"></div>
        <span class="log-cand-name" style="color:${c?.color||'var(--text)'}">${v.candidateName||'不明'}</span>
      </div>
      <div class="log-time">🕐 ${fmtTime(v.votedAt)}</div>
    </div>`;
  }).join('');
}

init();
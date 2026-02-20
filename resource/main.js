import { db } from "../firebase.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let candidates = [],
  votes = [];
const $ = (id) => document.getElementById(id);
const fmtN = (n) => (n || 0).toLocaleString("ja-JP");
const initials = (n) => (n || "?").replace(/\s/g, "").slice(0, 1);
const totalV = () => candidates.reduce((a, c) => a + (c.votes || 0), 0);
const pct = (v) => {
  const t = totalV();
  return t ? ((v / t) * 100).toFixed(1) : "0.0";
};
const sorted = () =>
  [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return (
    `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}

async function init() {
  try {
    const cfg = await getDoc(doc(db, "election", "config"));
    if (cfg.exists())
      $("headerSub").textContent = cfg.data().name || "模擬投票";
  } catch (e) {}

  onSnapshot(collection(db, "candidates"), (snap) => {
    candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  });
  onSnapshot(collection(db, "votes"), (snap) => {
    votes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    votes.sort((a, b) => {
      const ta = a.votedAt?.toMillis ? a.votedAt.toMillis() : 0;
      const tb = b.votedAt?.toMillis ? b.votedAt.toMillis() : 0;
      return tb - ta;
    });
    renderLog();
  });
  $("loadingScreen").classList.add("hidden");
}

function renderAll() {
  $("totalDisplay").textContent = fmtN(totalV());
  $("candCountSub").textContent = `候補者 ${candidates.length} 名`;
  renderDonut();
  renderRanking();
}

function renderDonut() {
  const s = sorted(),
    total = totalV();
  const cx = 65,
    cy = 65,
    r = 56,
    ir = 32;
  let startA = -Math.PI / 2,
    paths = "",
    legend = "";
  s.forEach((c) => {
    const frac = total ? (c.votes || 0) / total : 1 / (s.length || 1);
    const angle = frac * 2 * Math.PI,
      end = startA + angle;
    const x1 = cx + r * Math.cos(startA),
      y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(end),
      y2 = cy + r * Math.sin(end);
    const ix1 = cx + ir * Math.cos(startA),
      iy1 = cy + ir * Math.sin(startA);
    const ix2 = cx + ir * Math.cos(end),
      iy2 = cy + ir * Math.sin(end);
    const lg = angle > Math.PI ? 1 : 0;
    paths += `<path d="M${x1},${y1} A${r},${r} 0 ${lg} 1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${lg} 0 ${ix1},${iy1} Z" fill="${c.color}"/>`;
    startA = end;
    legend += `<div class="leg-row"><div class="leg-dot" style="background:${c.color}"></div><div class="leg-name">${c.name}</div><div class="leg-pct" style="color:${c.color}">${pct(c.votes || 0)}%</div></div>`;
  });
  if (!s.length)
    paths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--border)"/><circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/>`;
  else
    paths += `<circle cx="${cx}" cy="${cy}" r="${ir}" fill="white"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Noto Sans JP,sans-serif" font-size="14" font-weight="900" fill="var(--text)">${fmtN(totalV())}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="Noto Sans JP,sans-serif" font-size="9" fill="var(--muted)">票</text>`;
  $("donutSvg").innerHTML = paths;
  $("donutLegend").innerHTML =
    legend || '<div style="color:var(--muted);font-size:12px">候補者なし</div>';
}

function renderRanking() {
  const s = sorted();
  const maxV = s[0]?.votes || 1;
  $("rankingList").innerHTML =
    s
      .map(
        (c, i) => `
    <div class="rank-row">
      <div class="rn rn${i + 1}">${i + 1}</div>
      <div class="rank-info">
        <div class="rank-name tap-target" onclick="openResultProfile('${c.id}')">${c.name}</div>
        <div class="rank-party">${c.party}</div>
        <div class="rank-bar-wrap">
          <div class="prog-track">
            <div class="prog-fill" style="width:${totalV() ? (((c.votes || 0) / maxV) * 100).toFixed(1) : 0}%;background:${c.color}"></div>
          </div>
        </div>
      </div>
      <div class="rank-right">
        <div class="rank-votes" style="color:${c.color}">${fmtN(c.votes || 0)}</div>
        <div class="rank-vunit">票</div>
        <div class="rank-vpct" style="color:${c.color}">${pct(c.votes || 0)}%</div>
      </div>
    </div>`,
      )
      .join("") ||
    '<div style="color:var(--muted);font-size:13px;padding:10px 0">候補者なし</div>';
}

function renderLog() {
  $("logCount").textContent = `${votes.length}件`;
  if (!votes.length) {
    $("voteLog").innerHTML =
      '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">まだ投票がありません</div>';
    return;
  }
  $("voteLog").innerHTML = votes
    .map((v) => {
      const c = candidates.find((x) => x.id === v.candidateId);
      return `
    <div class="log-item">
      <div class="log-vote-row">
        <span class="log-arrow">→</span>
        <div class="log-cand-dot" style="background:${c?.color || "#ccc"}"></div>
        <span class="log-cand-name" style="color:${c?.color || "var(--text)"}">${v.candidateName || "不明"}</span>
      </div>
      <div class="log-time">🕐 ${fmtTime(v.votedAt)}</div>
    </div>`;
    })
    .join("");
}

window.openResultProfile = function (id) {
  const s = sorted();
  const c = s.find((x) => x.id === id);
  if (!c) return;

  const rank = s.findIndex((x) => x.id === id) + 1;
  const tags = (c.tags || [])
    .map((t) => `<span class="badge badge-blue">${t}</span>`)
    .join("");

  $("resultProfileBody").innerHTML = `
    <div class="result-prof-top">
      <div class="result-prof-ava" style="background:${c.color}">${initials(c.name)}</div>
      <div>
        <div class="result-prof-name">${c.name}</div>
        <div class="result-prof-party">${c.party || "無所属"}${c.status ? " / " + c.status : ""}</div>
      </div>
    </div>
    <div class="prof-stats">
      <div class="ps"><div class="ps-label">得票数</div><div class="ps-val" style="color:${c.color};font-size:15px">${fmtN(c.votes || 0)}</div></div>
      <div class="ps"><div class="ps-label">得票率</div><div class="ps-val" style="color:${c.color}">${pct(c.votes || 0)}<span style="font-size:10px">%</span></div></div>
      <div class="ps"><div class="ps-label">順位</div><div class="ps-val">${rank}<span style="font-size:10px">位</span></div></div>
    </div>
    ${c.bio ? `<div class="result-prof-title">公約</div><div class="result-prof-bio">${c.bio}</div>` : ""}
    ${tags ? `<div class="result-prof-title">公約テーマ</div><div class="prof-tags">${tags}</div>` : ""}
    <button class="btn btn-secondary btn-full" style="margin-top:16px" onclick="closeResultProfile()">閉じる</button>
  `;

  $("resultProfileOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
};

window.closeResultProfile = function () {
  $("resultProfileOverlay").classList.remove("open");
  document.body.style.overflow = "";
};

window.handleResultProfileBg = function (e) {
  if (e.target === $("resultProfileOverlay")) window.closeResultProfile();
};

function attachModalScrollClose(modalId, closeFn) {
  const el = $(modalId);
  if (!el) return;

  const sheet = el.querySelector(".sheet");
  let touchStartY = 0;
  let touchStartedAtTop = false;
  let dragY = 0;
  let isDragging = false;

  function getScrollable(node) {
    let n = node;
    while (n && n !== el && n !== document.body) {
      try {
        const ov = getComputedStyle(n).overflowY;
        if ((ov === "auto" || ov === "scroll") && n.scrollHeight > n.clientHeight) return n;
      } catch (_) {}
      n = n.parentElement;
    }
    return null;
  }

  function checkAtTop(node) {
    const s = getScrollable(node);
    return !s || s.scrollTop <= 0;
  }

  function setDrag(pull) {
    if (!sheet) return;
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${Math.max(0, pull)}px)`;
  }

  function resetDrag() {
    if (!sheet) return;
    sheet.style.transition = "transform 0.3s cubic-bezier(.4,0,.2,1)";
    sheet.style.transform = "translateY(0)";
  }

  el.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartedAtTop = checkAtTop(e.target);
    dragY = 0;
    isDragging = false;
    if (sheet) {
      sheet.style.transition = "none";
      sheet.style.transform = "translateY(0)";
    }
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (!el.contains(e.target)) return;
    const y = e.touches[0].clientY;
    const dy = y - touchStartY;
    touchStartY = y;
    const atTopNow = checkAtTop(e.target);

    if (!isDragging && dy > 0 && touchStartedAtTop && atTopNow) {
      isDragging = true;
    }

    if (isDragging) {
      e.preventDefault();
      dragY = Math.max(0, dragY + dy);
      setDrag(dragY);
      if (dragY === 0) isDragging = false;
    }
  }, { passive: false });

  el.addEventListener("touchend", () => {
    const CLOSE_THRESHOLD = 80;
    if (isDragging && dragY >= CLOSE_THRESHOLD) {
      if (sheet) {
        sheet.style.transition = "transform 0.25s cubic-bezier(.4,0,.2,1)";
        sheet.style.transform = "translateY(100%)";
        setTimeout(() => {
          sheet.style.transition = "";
          sheet.style.transform = "";
          closeFn();
        }, 250);
      } else {
        closeFn();
      }
    } else if (isDragging) {
      resetDrag();
    }
    isDragging = false;
    dragY = 0;
  });

  el.addEventListener("touchcancel", () => {
    resetDrag();
    isDragging = false;
    dragY = 0;
  });
}

attachModalScrollClose("resultProfileOverlay", window.closeResultProfile);
init();

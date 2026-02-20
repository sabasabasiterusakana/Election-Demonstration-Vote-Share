import { db, auth } from "../firebase.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  increment,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ===== STATE =====
let currentUser = null;
let candidates = [];
let myVoteCandId = null;
let pendingCandId = null;
let electionName = "模擬投票";

// ===== UTILS =====
const $ = (id) => document.getElementById(id);
const fmtN = (n) => (n || 0).toLocaleString("ja-JP");
const totalV = () => candidates.reduce((a, c) => a + (c.votes || 0), 0);
const pct = (v) => {
  const t = totalV();
  return t ? ((v / t) * 100).toFixed(1) : "0.0";
};
const initials = (n) => n.replace(/\s/g, "").slice(0, 1);
const sorted = () =>
  [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

// ===== AUTH =====
window.signInWithGoogle = async function () {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    showToast("ログインに失敗しました: " + e.message);
  }
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    // ログイン済み → ゲートを隠す
    $("loginGate").classList.add("hidden");
    renderUserChip(user);
    await checkMyVote(user.uid);
    renderCandList();
  } else {
    $("loginGate").classList.remove("hidden");
    myVoteCandId = null;
    renderCandList();
  }
  $("loadingScreen").classList.add("hidden");
});

function renderUserChip(user) {
  const photoHtml = user.photoURL
    ? `<img class="user-photo" src="${user.photoURL}" referrerpolicy="no-referrer">`
    : `<div class="user-photo-placeholder">${(user.displayName || "?")[0]}</div>`;
  const nameShort = (user.displayName || user.email || "").split(" ")[0];
  $("userChip").innerHTML = `
    <div class="user-chip" onclick="confirmSignOut()">
      ${photoHtml}
      <span class="user-name-chip">${nameShort}</span>
    </div>`;
}

window.confirmSignOut = function () {
  if (confirm("ログアウトしますか？")) signOut(auth);
};

async function checkMyVote(uid) {
  try {
    const snap = await getDoc(doc(db, "votes", uid));
    myVoteCandId = snap.exists() ? snap.data().candidateId : null;
  } catch (e) {
    myVoteCandId = null;
  }
  updateStatusBar();
}

function updateStatusBar() {
  const sb = $("statusBar");
  if (!currentUser) {
    sb.className = "status-bar info";
    sb.textContent = "投票するにはログインが必要です";
    return;
  }
  if (myVoteCandId) {
    const c = candidates.find((x) => x.id === myVoteCandId);
    sb.className = "status-bar done";
    sb.innerHTML = `✅ <strong>${c?.name || "候補者"}</strong> に投票済みです`;
  } else {
    sb.className = "status-bar info";
    sb.textContent = "投票する候補者をタップして選んでください";
  }
}

// ===== INIT DATA =====
async function init() {
  try {
    const cfg = await getDoc(doc(db, "election", "config"));
    if (cfg.exists()) electionName = cfg.data().name || electionName;
  } catch (e) {}
  $("heroElectionName").textContent = electionName;
  $("headerSub").textContent = electionName;
  $("loginElectionName").textContent = electionName;

  onSnapshot(collection(db, "candidates"), (snap) => {
    candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    $("heroTotalCount").textContent = fmtN(totalV());
    updateStatusBar();
    renderCandList();
  });
}

// ===== RENDER CANDIDATES =====
function renderCandList() {
  const s = sorted();
  const maxV = s[0]?.votes || 1;
  const hasUser = !!currentUser;
  const hasVoted = !!myVoteCandId;

  if (!s.length) {
    $("candList").innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">まだ候補者が登録されていません</div>';
    return;
  }

  $("candList").innerHTML = s
    .map((c, i) => {
      const isMyVote = myVoteCandId === c.id;
      let btnClass = "vb-idle",
        btnLabel = "投票する",
        btnDis = "";
      if (isMyVote) {
        btnClass = "vb-done";
        btnLabel = "✓ 投票済み";
        btnDis = "disabled";
      } else if (hasVoted) {
        btnClass = "vb-locked";
        btnLabel = "投票済み";
        btnDis = "disabled";
      } else if (!hasUser) {
        btnClass = "vb-locked";
        btnLabel = "要ログイン";
        btnDis = "disabled";
      }

      return `
    <div class="cand-card${isMyVote ? " my-vote" : ""}" onclick="openProfile('${c.id}')">
      <div class="cand-stripe" style="background:${c.color}"></div>
      <div class="cand-inner">
        <div class="cand-row1">
          <div class="cand-ava" style="background:${c.color}">
            ${initials(c.name)}
            <div class="rank-badge r${i + 1}">${i + 1}</div>
          </div>
          <div class="cand-info">
            <div class="cand-name">${c.name}</div>
            <div class="cand-party">${c.party}</div>
          </div>
          <div class="cand-stat">
            <div class="cand-vnum" style="color:${c.color}">${fmtN(c.votes || 0)}</div>
            <div class="cand-vunit">票</div>
            <div class="cand-vpct" style="color:${c.color}">${pct(c.votes || 0)}%</div>
          </div>
        </div>
        <div class="cand-prog">
          <div class="prog-track">
            <div class="prog-fill" style="width:${totalV() ? (((c.votes || 0) / maxV) * 100).toFixed(1) : 0}%;background:${c.color}"></div>
          </div>
        </div>
      </div>
      <div class="cand-foot">
        <span class="detail-hint">タップで詳細 〉</span>
        <button class="vote-btn ${btnClass}" ${btnDis}
          onclick="event.stopPropagation();selectCand('${c.id}')">
          ${btnLabel}
        </button>
      </div>
    </div>`;
    })
    .join("");
}

// ===== PROFILE =====
window.openProfile = function (id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  const s = sorted();
  const rank = s.findIndex((x) => x.id === id) + 1;
  const isMyVote = myVoteCandId === id;
  const hasVoted = !!myVoteCandId;
  const hasUser = !!currentUser;
  const tags = (c.tags || [])
    .map((t) => `<span class="badge badge-blue">${t}</span>`)
    .join("");
  // aiAnalysis は別タブで表示するためここでは扱わない

  let vBtnLabel = "🗳️ この候補者に投票する",
    vBtnDis = "";
  if (isMyVote) {
    vBtnLabel = "✓ この候補者に投票済み";
    vBtnDis = "disabled";
  } else if (hasVoted) {
    vBtnLabel = "他の候補者に投票済み";
    vBtnDis = "disabled";
  } else if (!hasUser) {
    vBtnLabel = "ログインが必要です";
    vBtnDis = "disabled";
  }

  $("profileBody").innerHTML = `
    <div class="prof-top">
      <div class="prof-ava" style="background:${c.color}">${initials(c.name)}</div>
      <div>
        <div class="prof-name">${c.name}</div>
        <div class="prof-party">${c.party}${c.status ? " / " + c.status : ""}</div>
        ${isMyVote ? '<div style="margin-top:6px"><span class="badge badge-green">✓ あなたの投票先</span></div>' : ""}
      </div>
    </div>
    <div class="prof-stats">
      <div class="ps"><div class="ps-label">得票数</div><div class="ps-val" style="color:${c.color};font-size:15px">${fmtN(c.votes || 0)}</div></div>
      <div class="ps"><div class="ps-label">得票率</div><div class="ps-val" style="color:${c.color}">${pct(c.votes || 0)}<span style="font-size:10px">%</span></div></div>
      <div class="ps"><div class="ps-label">順位</div><div class="ps-val">${rank}<span style="font-size:10px">位</span></div></div>
    </div>
    ${c.bio ? `<div class="prof-section-title">公約</div><div class="prof-bio">${c.bio}</div>` : ""}
    ${tags ? `<div class="prof-section-title">公約テーマ</div><div class="prof-tags">${tags}</div>` : ""}
    <!-- ai分析はAI分析タブで閲覧してください -->
    <button class="btn btn-primary btn-full" ${vBtnDis} onclick="closeProfile();setTimeout(()=>selectCand('${id}'),300)">
      ${vBtnLabel}
    </button>
    <button class="btn btn-secondary btn-full" style="margin-top:8px" onclick="closeProfile()">閉じる</button>
  `;
  $("profileOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
};
window.handleProfBg = (e) => {
  if (e.target === $("profileOverlay")) closeProfile();
};
window.closeProfile = () => {
  $("profileOverlay").classList.remove("open");
  document.body.style.overflow = "";
};

// モーダル上で押しながら上スクロールしたらモーダルを閉じる（タッチ・マウス両対応）
function attachModalScrollClose(modalId, closeFn) {
  const el = document.getElementById(modalId);
  if (!el) return;
  let isPointerDown = false;
  let touchStartY = 0;
  const THRESHOLD = 30;

  el.addEventListener("pointerdown", () => {
    isPointerDown = true;
  });
  window.addEventListener("pointerup", () => {
    isPointerDown = false;
  });

  el.addEventListener("pointerdown", (ev) => {
    isPointerDown = true;
  });
  window.addEventListener("pointerup", () => {
    isPointerDown = false;
  });
  window.addEventListener("pointercancel", () => {
    isPointerDown = false;
  });

  function getScrollableContent(node) {
    let elNode = node;
    while (elNode && elNode !== el && elNode !== document.body) {
      try {
        const cs = getComputedStyle(elNode);
        const overflowY = cs.overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          elNode.scrollHeight > elNode.clientHeight
        ) {
          return elNode;
        }
      } catch (e) {}
      elNode = elNode.parentElement;
    }
    return null;
  }

  function isAtTop(node) {
    const scrollable = getScrollableContent(node);
    return !scrollable || scrollable.scrollTop === 0;
  }

  el.addEventListener(
    "wheel",
    (e) => {
      if (!el.contains(e.target)) return;
      const scrollable = getScrollableContent(e.target);
      // スクロール可能なコンテンツがない場合のみ背景スクロール防止
      if (!scrollable) {
        e.preventDefault();
        if (!isPointerDown) return;
        // トップにある時だけ閉じる
        if (e.deltaY > THRESHOLD && isAtTop(e.target)) closeFn();
      }
    },
    { passive: false },
  );

  el.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.touches[0]?.clientY || 0;
    },
    { passive: true },
  );

  el.addEventListener(
    "touchmove",
    (e) => {
      if (!el.contains(e.target)) return;
      const scrollable = getScrollableContent(e.target);
      // スクロール可能なコンテンツがない場合のみ背景スクロール防止
      if (!scrollable) {
        e.preventDefault();
        if (!isPointerDown) return;
        const y = e.touches[0]?.clientY || 0;
        // トップにある時だけ閉じる
        if (y - touchStartY > THRESHOLD && isAtTop(e.target)) {
          closeFn();
          return;
        }
      }
    },
    { passive: false },
  );
}

attachModalScrollClose("profileOverlay", closeProfile);

window.handleConfirmBg = (e) => {
  if (e.target === $("confirmOverlay")) closeConfirm();
};

// ===== SELECT & CONFIRM =====
window.selectCand = function (id) {
  if (!currentUser) {
    showToast("まずGoogleでログインしてください");
    return;
  }
  if (myVoteCandId) {
    showToast("すでに投票済みです");
    return;
  }
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  pendingCandId = id;

  $("confirmCandBox").innerHTML = `
    <div class="confirm-ava" style="background:${c.color}">${initials(c.name)}</div>
    <div>
      <div style="font-size:17px;font-weight:700">${c.name}</div>
      <div style="font-size:12px;color:var(--muted)">${c.party}</div>
    </div>`;

  const photoHtml = currentUser.photoURL
    ? `<img class="voter-photo" src="${currentUser.photoURL}" referrerpolicy="no-referrer">`
    : `<div class="voter-photo-ph">${(currentUser.displayName || "?")[0]}</div>`;
  $("confirmVoterBox").innerHTML = `
    ${photoHtml}
    <div>
      <div class="voter-info-name">${currentUser.displayName || "名前なし"}</div>
      <div class="voter-info-email">${currentUser.email}</div>
    </div>`;

  $("confirmOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
};
window.closeConfirm = () => {
  $("confirmOverlay").classList.remove("open");
  document.body.style.overflow = "";
  pendingCandId = null;
};

// ===== SUBMIT =====
window.submitVote = async function () {
  if (!pendingCandId || !currentUser) return;
  $("confirmOverlay").classList.remove("open");
  document.body.style.overflow = "";

  try {
    // Double-check in Firestore
    const existing = await getDoc(doc(db, "votes", currentUser.uid));
    if (existing.exists()) {
      myVoteCandId = existing.data().candidateId;
      updateStatusBar();
      renderCandList();
      showToast("このアカウントはすでに投票済みです");
      return;
    }

    const cand = candidates.find((c) => c.id === pendingCandId);

    // Write vote (document ID = uid → 絶対に1回だけ)
    await setDoc(doc(db, "votes", currentUser.uid), {
      candidateId: pendingCandId,
      candidateName: cand?.name || "",
      voterUid: currentUser.uid,
      voterName: currentUser.displayName || "",
      voterEmail: currentUser.email || "",
      voterPhoto: currentUser.photoURL || "",
      votedAt: serverTimestamp(),
    });

    // Increment vote count
    await updateDoc(doc(db, "candidates", pendingCandId), {
      votes: increment(1),
    });

    myVoteCandId = pendingCandId;
    pendingCandId = null;

    $("successCandName").textContent = `${cand?.name}（${cand?.party}）`;
    $("successOverlay").classList.add("show");
    updateStatusBar();
    renderCandList();
  } catch (e) {
    showToast("投票中にエラーが発生しました");
    console.error(e);
  }
};

init();

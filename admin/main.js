import { db, ADMIN_PASSCODE } from "../firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COLORS = [
  "#1a56db",
  "#e03131",
  "#2f9e44",
  "#e67700",
  "#7048e8",
  "#0ca678",
  "#f76707",
  "#c2255c",
  "#1098ad",
  "#6741d9",
];
let selColor = COLORS[0];
let selectedEditColor = COLORS[0];
let editCandId = null;
let selectedAiCandidateId = null;
let candidates = [],
  votes = [];

const $ = (id) => document.getElementById(id);
const fmtN = (n) => (n || 0).toLocaleString("ja-JP");
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
function fmtTime(ts) {
  if (!ts) return "時刻不明";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// ===== PASSCODE =====
window.checkPasscode = function () {
  if ($("passcodeInput").value === ADMIN_PASSCODE) {
    $("gate").style.display = "none";
    ["mainUI", "sec1", "sec2", "sec3", "sec4", "sec5", "sec6"].forEach(
      (id) => ($(id).style.display = ""),
    );
    $("adminNoticeBanner").style.display = "";
    initAdmin();
  } else {
    $("gateErr").style.display = "block";
    $("passcodeInput").classList.add("err");
    setTimeout(() => $("passcodeInput").classList.remove("err"), 1000);
  }
};

async function initAdmin() {
  try {
    const cfg = await getDoc(doc(db, "election", "config"));
    if (cfg.exists()) $("elNameInput").value = cfg.data().name || "";
  } catch (e) {}

  initColors();

  onSnapshot(collection(db, "candidates"), (snap) => {
    candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCandList();
  });
  onSnapshot(collection(db, "votes"), (snap) => {
    votes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    votes.sort((a, b) => {
      const ta = a.votedAt?.toMillis ? a.votedAt.toMillis() : 0;
      const tb = b.votedAt?.toMillis ? b.votedAt.toMillis() : 0;
      return tb - ta;
    });
    renderVoteLog();
  });
}

function initColors() {
  $("colorGrid").innerHTML = COLORS.map(
    (c, i) => `
    <div class="cp${i === 0 ? " selected" : ""}" style="background:${c}" onclick="pickColor('${c}',this)"></div>
  `,
  ).join("");
}
window.pickColor = function (c, el) {
  selColor = c;
  document
    .querySelectorAll(".cp")
    .forEach((e) => e.classList.remove("selected"));
  el.classList.add("selected");
};

function initEditColors() {
  $("editColorGrid").innerHTML = COLORS.map(
    (c, i) => `
    <div class="cp" style="background:${c}" onclick="pickEditColor('${c}',this)"></div>
  `,
  ).join("");
}

window.pickEditColor = function (c, el) {
  selectedEditColor = c;
  document
    .querySelectorAll("#editColorGrid .cp")
    .forEach((e) => e.classList.remove("selected"));
  el.classList.add("selected");
};

window.saveElectionName = async function () {
  const name = $("elNameInput").value.trim();
  if (!name) return;
  try {
    await setDoc(doc(db, "election", "config"), { name });
    showToast("選挙名を保存しました");
  } catch (e) {
    console.error("saveElectionName error", e);
    showToast("保存に失敗しました: " + (e.message || e));
  }
};

window.addCandidate = async function () {
  const name = $("fName").value.trim();
  if (!name) {
    showToast("候補者名を入力してください");
    return;
  }
  const tags = $("fTags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  try {
    await setDoc(doc(db, "candidates", "c" + Date.now()), {
      name,
      votes: 0,
      color: selColor,
      party: $("fParty").value.trim() || "無所属",
      status: $("fStatus").value || "新人",
      bio: $("fBio").value.trim() || "",
      tags,
      createdAt: serverTimestamp(),
    });
    ["fName", "fParty", "fStatus", "fBio", "fTags"].forEach(
      (id) => ($(id).value = ""),
    );
    showToast("追加しました");
  } catch (e) {
    console.error("addCandidate error", e);
    showToast("候補者の追加に失敗しました: " + (e.message || e));
  }
};

function renderCandList() {
  const s = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (!s.length) {
    $("candManageList").innerHTML =
      '<div style="color:var(--muted);font-size:13px">候補者なし</div>';
    return;
  }
  $("candManageList").innerHTML = s
    .map(
      (c) => `
    <div class="cand-row">
      <div class="cand-row-left">
        <div class="cdot" style="background:${c.color}"></div>
        <div>
          <div class="cname">${c.name}</div>
          <div class="cmeta">${c.party}</div>
          <div class="cvotes" style="color:${c.color}">${fmtN(c.votes || 0)} 票</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn-del" onclick="openEditCandidateModal('${c.id}')" style="flex: 1">✏️</button>
        <button class="btn-del" onclick="deleteCand('${c.id}','${c.name}')" style="flex: 1">🗑️</button>
      </div>
    </div>`,
    )
    .join("");
}

window.deleteCand = async function (id, name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  await deleteDoc(doc(db, "candidates", id));
  showToast("削除しました");
};

window.openEditCandidateModal = function (id) {
  const cand = candidates.find((c) => c.id === id);
  if (!cand) return;

  editCandId = id;
  selectedEditColor = cand.color;

  $("editName").value = cand.name || "";
  $("editParty").value = cand.party || "無所属";
  $("editStatus").value = cand.status || "新人";
  $("editBio").value = cand.bio || "";
  $("editTags").value = (cand.tags || []).join(", ");

  initEditColors();
  const colorEls = document.querySelectorAll("#editColorGrid .cp");
  colorEls.forEach((el, i) => {
    if (COLORS[i] === selectedEditColor) {
      el.classList.add("selected");
    }
  });

  $("editModal").classList.add("open");
  document.body.style.overflow = "hidden";
};

window.closeEditModal = function () {
  $("editModal").classList.remove("open");
  document.body.style.overflow = "";
  editCandId = null;
};

window.handleEditingBg = (e) => {
  if (e.target === $("editModal")) closeEditModal();
};

window.updateCandidate = async function () {
  if (!editCandId) return;

  const name = $("editName").value.trim();
  if (!name) {
    showToast("候補者名を入力してください");
    return;
  }

  const tags = $("editTags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    await updateDoc(doc(db, "candidates", editCandId), {
      name,
      party: $("editParty").value.trim() || "無所属",
      status: $("editStatus").value || "新人",
      bio: $("editBio").value.trim() || "",
      color: selectedEditColor,
      tags,
    });
    closeEditModal();
    showToast("編集しました");
  } catch (e) {
    console.error("updateCandidate error", e);
    showToast("編集に失敗しました: " + (e.message || e));
  }
};

function renderVoteLog() {
  $("logCount").textContent = `${votes.length}件`;
  if (!votes.length) {
    $("voteLogList").innerHTML =
      '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">まだ投票がありません</div>';
    return;
  }
  $("voteLogList").innerHTML = votes
    .map((v) => {
      const c = candidates.find((x) => x.id === v.candidateId);
      return `
    <div class="log-item">
      <div class="log-vote-row">
        <span class="log-arrow">→</span>
        <div class="log-cdot" style="background:${c?.color || "#ccc"}"></div>
        <span class="log-cname" style="color:${c?.color || "var(--text)"}">${v.candidateName || "不明"}</span>
      </div>
      <div class="log-time">🕐 ${fmtTime(v.votedAt)}</div>
    </div>`;
    })
    .join("");
}

window.resetVotes = async function () {
  if (!confirm("全投票データを削除しますか？（候補者はそのまま残ります）"))
    return;
  const vSnap = await getDocs(collection(db, "votes"));
  for (const d of vSnap.docs) await deleteDoc(d.ref);
  const cSnap = await getDocs(collection(db, "candidates"));
  for (const d of cSnap.docs) await setDoc(d.ref, { ...d.data(), votes: 0 });
  showToast("投票データをリセットしました");
};

window.resetAll = async function () {
  if (
    !confirm(
      "候補者・投票データをすべて削除しますか？\nこの操作は元に戻せません。",
    )
  )
    return;
  const vSnap = await getDocs(collection(db, "votes"));
  for (const d of vSnap.docs) await deleteDoc(d.ref);
  const cSnap = await getDocs(collection(db, "candidates"));
  for (const d of cSnap.docs) await deleteDoc(d.ref);
  showToast("全データを削除しました");
};

$("loadingScreen").classList.add("hidden");

// モーダル上で上スクロールしたらモーダルを閉じる（タッチ・マウス両対応）
// ★ ジェスチャー開始時点の「最上部かどうか」を1回だけ記録し、
//    スクロール中に最上部に到達しても閉じない
function attachModalScrollClose(modalId, closeFn) {
  const el = $(modalId);
  if (!el) return;

  const sheet = el.querySelector(".sheet");

  // ===== 状態変数 =====
  let touchStartY       = 0;
  let touchStartedAtTop = false;
  let dragY             = 0;
  let isDragging        = false;

  // 慣性用
  let lastY        = 0;
  let lastTime     = 0;
  let velocityY    = 0;   // px/ms（正=下方向、負=上方向）
  let inertiaRAF   = null;

  // ホイール用
  let wheelWasAtTop = false;
  let wheelTimer    = null;

  // ===== ヘルパー =====
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

  function applyDrag(pull) {
    if (!sheet) return;
    sheet.style.transition = "none";
    sheet.style.transform  = `translateY(${Math.max(0, pull)}px)`;
  }

  function resetDrag() {
    if (!sheet) return;
    sheet.style.transition = "transform 0.3s cubic-bezier(.4,0,.2,1)";
    sheet.style.transform  = "translateY(0)";
  }

  function stopInertia() {
    if (inertiaRAF) { cancelAnimationFrame(inertiaRAF); inertiaRAF = null; }
  }

  // 慣性スクロールループ
  function startInertia(scrollable, initVelocity) {
    stopInertia();
    if (!scrollable) return;
    let vel = initVelocity;      // px/ms
    let prevTime = performance.now();
    const FRICTION = 0.94;       // 1フレームごとの減衰率（大きいほど長く続く）
    const MIN_VEL  = 0.05;       // これ以下で停止

    function step(now) {
      const dt  = Math.min(now - prevTime, 32); // max 32ms でクランプ
      prevTime  = now;
      vel      *= Math.pow(FRICTION, dt / 16);  // 60fps基準で減衰

      if (Math.abs(vel) < MIN_VEL) { inertiaRAF = null; return; }

      scrollable.scrollTop += vel * dt;
      inertiaRAF = requestAnimationFrame(step);
    }
    inertiaRAF = requestAnimationFrame(step);
  }

  // ===== wheel =====
  el.addEventListener("wheel", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault();
    stopInertia();
    const scrollable = getScrollable(e.target);

    if (wheelTimer === null) wheelWasAtTop = checkAtTop(e.target);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelTimer = null; }, 150);

    if (e.deltaY < 0) {
      if (wheelWasAtTop) { closeFn(); }
      else if (scrollable) scrollable.scrollBy({ top: e.deltaY, behavior: "auto" });
    } else {
      if (scrollable) scrollable.scrollBy({ top: e.deltaY, behavior: "auto" });
    }
  }, { passive: false });

  // ===== touchstart =====
  el.addEventListener("touchstart", (e) => {
    stopInertia();
    touchStartY       = e.touches[0].clientY;
    lastY             = touchStartY;
    lastTime          = performance.now();
    velocityY         = 0;
    touchStartedAtTop = checkAtTop(e.target);
    dragY             = 0;
    isDragging        = false;
    if (sheet) { sheet.style.transition = "none"; sheet.style.transform = "translateY(0)"; }
  }, { passive: true });

  // ===== touchmove =====
  el.addEventListener("touchmove", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault();

    const touch      = e.touches[0];
    const y          = touch.clientY;
    const now        = performance.now();
    const delta      = touchStartY - y;   // 正=上スクロール
    const dt         = now - lastTime;
    touchStartY      = y;

    // 速度を指数移動平均で更新（px/ms、正=下方向）
    if (dt > 0) {
      const rawVel = -(delta) / dt;       // 上スクロール時は負
      velocityY    = velocityY * 0.6 + rawVel * 0.4;
    }
    lastY    = y;
    lastTime = now;

    const scrollable = getScrollable(e.target);

    if (delta < 0) {
      // 指を下に動かす（上方向）
      if (touchStartedAtTop && checkAtTop(e.target)) {
        isDragging = true;
        dragY      = Math.max(0, dragY + Math.abs(delta));
        applyDrag(dragY);
      } else if (scrollable) {
        scrollable.scrollTop += delta;
      }
    } else if (delta > 0) {
      // 指を上に動かす（下方向）
      if (isDragging) {
        dragY = Math.max(0, dragY - delta);
        applyDrag(dragY);
        if (dragY === 0) isDragging = false;
      } else if (scrollable) {
        scrollable.scrollTop += delta;
      }
    }
  }, { passive: false });

  // ===== touchend =====
  el.addEventListener("touchend", (e) => {
    const CLOSE_THRESHOLD = 80;

    if (isDragging && dragY >= CLOSE_THRESHOLD) {
      if (sheet) {
        sheet.style.transition = "transform 0.25s cubic-bezier(.4,0,.2,1)";
        sheet.style.transform  = "translateY(100%)";
        setTimeout(() => { sheet.style.transition = ""; sheet.style.transform = ""; closeFn(); }, 250);
      } else { closeFn(); }
    } else if (isDragging) {
      resetDrag();
    } else {
      // 慣性スクロール開始：指を離した瞬間の速度を引き継ぐ
      const target     = e.changedTouches[0];
      const scrollable = getScrollable(el.querySelector(".sheet-body") || el);
      // velocityY: 正=下方向
      if (scrollable && Math.abs(velocityY) > 0.1) {
        startInertia(scrollable, velocityY);
      }
    }

    isDragging = false;
    dragY      = 0;
  });

  el.addEventListener("touchcancel", () => {
    stopInertia();
    resetDrag();
    isDragging = false;
    dragY      = 0;
  });
}

attachModalScrollClose("editModal", closeEditModal);

// ===== AI分析（管理タブ用） =====
window.renderAiManageList = function () {
  const el = $("aiCandidateList");
  if (!candidates || !candidates.length) {
    el.innerHTML =
      '<div style="color:var(--muted);font-size:13px">候補者がいません</div>';
    return;
  }
  el.innerHTML = candidates
    .map(
      (c) => `
    <div class="cand-row" style="cursor:pointer" onclick="selectAiCandidate('${c.id}')">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="cdot" style="background:${c.color}"></div>
        <div>
          <div style="font-weight:700">${c.name}</div>
          <div style="font-size:12px;color:var(--muted)">${c.party}</div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
};

window.selectAiCandidate = function (id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  selectedAiCandidateId = id;
  $("aiSelectedName").textContent = `${c.name}（${c.party}）`;
  $("aiEditorSection").style.display = "";

  const analysis = c.aiAnalysis || {};
  $("aiOutline").value = analysis.outline || "";
  $("aiFeasibility").value = analysis.feasibility || "";
  $("aiMerits").value = analysis.merits || "";
  $("aiDemerits").value = analysis.demerits || "";

  // Populate individual number fields for points
  const pointsObj = analysis.points || {};
  const pointsKeys = {
    aiPointImpact: "生徒への影響度",
    aiPointFeasible: "実現可能性",
    aiPointConcrete: "具体性",
    aiPointNeed: "必要性・共感度",
  };
  Object.entries(pointsKeys).forEach(([fieldId, label]) => {
    $(fieldId).value = pointsObj[label] || "";
  });

  $("aiOutline").focus();
};

window.saveAiAnalysis = async function () {
  if (!selectedAiCandidateId) {
    showToast("保存する候補者を選択してください");
    return;
  }
  const c = candidates.find((x) => x.id === selectedAiCandidateId);
  if (!c) return showToast("候補者が見つかりません");

  // Build points object from individual number fields
  let points = {};
  const pointsFields = {
    aiPointImpact: "生徒への影響度",
    aiPointFeasible: "実現可能性",
    aiPointConcrete: "具体性",
    aiPointNeed: "必要性・共感度",
  };

  for (const [fieldId, label] of Object.entries(pointsFields)) {
    const value = $(fieldId).value.trim();
    if (value) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 5) {
        showToast(`${label} には1-5の数値を入力してください`);
        return;
      }
      points[label] = num;
    }
  }

  try {
    await updateDoc(doc(db, "candidates", c.id), {
      aiAnalysis: {
        outline: $("aiOutline").value.trim(),
        feasibility: $("aiFeasibility").value.trim(),
        merits: $("aiMerits").value.trim(),
        demerits: $("aiDemerits").value.trim(),
        points,
      },
    });
    showToast("AI分析を保存しました");
  } catch (e) {
    console.error(e);
    showToast("保存に失敗しました");
  }
};

window.openAiAdminTab = function () {
  ["sec1", "sec2", "sec3", "sec4", "sec5", "sec6"].forEach(
    (id) => ($(id).style.display = "none"),
  );
  $("sec5").style.display = "";
  renderAiManageList();
};
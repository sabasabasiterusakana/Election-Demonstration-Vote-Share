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
let matchingQuestions = [];
let editingQId = null;

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
    ["mainUI", "sec1", "sec2", "sec3", "sec4", "sec5", "sec6", "sec7"].forEach(
      (id) => ($(id).style.display = ""),
    );
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
    renderMqList(); // 候補者が変わったら質問一覧も再描画
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
  onSnapshot(collection(db, "matchingQuestions"), (snap) => {
    matchingQuestions = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    renderMqList();
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

// モーダル上で押しながら上スクロールしたらモーダルを閉じる（タッチ・マウス両対応）
function attachModalScrollClose(modalId, closeFn) {
  const el = document.getElementById(modalId);
  if (!el) return;
  let touchStartY = 0;

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

  function isAtTop(node) {
    const s = getScrollable(node);
    return !s || s.scrollTop <= 0;
  }

  // ===== wheel（PC マウス）=====
  el.addEventListener("wheel", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault(); // 背景スクロール防止

    const scrollable = getScrollable(e.target);

    if (e.deltaY < 0) {
      // 上方向 → 最上部ならモーダルを閉じる / それ以外は通常スクロール
      if (isAtTop(e.target)) {
        closeFn();
      } else if (scrollable) {
        scrollable.scrollTop += e.deltaY;
      }
    } else {
      // 下方向 → 常に通常スクロール
      if (scrollable) scrollable.scrollTop += e.deltaY;
    }
  }, { passive: false });

  // ===== touch（スマートフォン）=====
  el.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0]?.clientY || 0;
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault(); // 背景スクロール防止

    const scrollable = getScrollable(e.target);
    const y = e.touches[0]?.clientY || 0;
    const delta = touchStartY - y; // 正 = 下スクロール（指が上に動く）

    if (delta < 0) {
      // 上方向（指を下に動かす）→ 最上部ならモーダルを閉じる / それ以外は通常スクロール
      if (isAtTop(e.target)) {
        closeFn();
      } else if (scrollable) {
        scrollable.scrollTop += delta;
      }
    } else if (delta > 0) {
      // 下方向（指を上に動かす）→ 常に通常スクロール
      if (scrollable) scrollable.scrollTop += delta;
    }

    touchStartY = y; // 毎フレーム基準点を更新
  }, { passive: false });
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

// ===== マッチング質問管理 =====
const SCORE_OPTS = [
  { val: 2,  label: "+2（非常に賛成）" },
  { val: 1,  label: "+1（やや賛成）"   },
  { val: 0,  label:  "0（ニュートラル）" },
  { val: -1, label: "−1（やや反対）"   },
  { val: -2, label: "−2（強く反対）"   },
];

function renderMqList() {
  const el = $("mqList");
  if (!el) return;
  if (!matchingQuestions.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px 0;font-size:13px;color:var(--muted)">質問がありません</div>';
    return;
  }
  el.innerHTML = matchingQuestions.map((q, i) => {
    const scoreChips = candidates.map(c => {
      const sc = (q.scores || {})[c.id];
      const hasScore = typeof sc === "number";
      const color = hasScore
        ? sc >= 1 ? "#2f9e44" : sc <= -1 ? "#e03131" : "#6b7280"
        : "#adb5bd";
      return `<span style="font-size:10px;font-weight:700;color:${color};background:var(--bg);border-radius:4px;padding:2px 7px;white-space:nowrap">${c.name.slice(0,4)}: ${hasScore ? (sc > 0 ? "+" : "") + sc : "未"}</span>`;
    }).join("");

    return `
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:4px">Q${i + 1}</div>
          <div style="font-size:13px;line-height:1.6;margin-bottom:8px">${q.text}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${scoreChips || '<span style="font-size:11px;color:var(--muted)">候補者なし</span>'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;padding-top:2px">
          <div style="display:flex;gap:4px">
            <button class="btn-del" style="font-size:15px;padding:3px 6px" onclick="moveMq('${q.id}',-1)" ${i === 0 ? 'disabled style="opacity:.3;font-size:15px;padding:3px 6px"' : ""} title="上へ">↑</button>
            <button class="btn-del" style="font-size:15px;padding:3px 6px" onclick="moveMq('${q.id}',1)" ${i === matchingQuestions.length - 1 ? 'disabled style="opacity:.3;font-size:15px;padding:3px 6px"' : ""} title="下へ">↓</button>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn-del" style="font-size:16px;padding:3px 6px" onclick="openEditQModal('${q.id}')" title="編集">✏️</button>
            <button class="btn-del" style="font-size:16px;padding:3px 6px" onclick="deleteMq('${q.id}','${q.text.replace(/'/g,"\\'")}')">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

window.addMatchingQuestion = async function () {
  const text = ($("mqNewText").value || "").trim();
  if (!text) { showToast("質問文を入力してください"); return; }
  const maxOrder = matchingQuestions.length
    ? Math.max(...matchingQuestions.map(q => q.order ?? 0))
    : -1;
  try {
    await setDoc(doc(db, "matchingQuestions", "mq" + Date.now()), {
      text,
      order: maxOrder + 1,
      scores: {},
      createdAt: serverTimestamp(),
    });
    $("mqNewText").value = "";
    showToast("質問を追加しました");
  } catch (e) {
    console.error(e);
    showToast("追加に失敗しました");
  }
};

window.deleteMq = async function (id, previewRaw) {
  const preview = previewRaw.length > 20 ? previewRaw.slice(0, 20) + "…" : previewRaw;
  if (!confirm(`「${preview}」を削除しますか？`)) return;
  try {
    await deleteDoc(doc(db, "matchingQuestions", id));
    showToast("削除しました");
  } catch (e) { showToast("削除に失敗しました"); }
};

window.moveMq = async function (id, dir) {
  const idx = matchingQuestions.findIndex(q => q.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= matchingQuestions.length) return;
  const a = matchingQuestions[idx];
  const b = matchingQuestions[swapIdx];
  try {
    await updateDoc(doc(db, "matchingQuestions", a.id), { order: b.order ?? swapIdx });
    await updateDoc(doc(db, "matchingQuestions", b.id), { order: a.order ?? idx });
  } catch (e) { showToast("並び替えに失敗しました"); }
};

// --- 編集モーダル ---
window.openEditQModal = function (id) {
  const q = matchingQuestions.find(x => x.id === id);
  if (!q) return;
  editingQId = id;
  $("editQText").value = q.text;

  const scoresDiv = $("editQScores");
  if (!candidates.length) {
    scoresDiv.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">候補者が登録されていません</div>';
  } else {
    scoresDiv.innerHTML = candidates.map(c => {
      const cur = typeof (q.scores || {})[c.id] === "number" ? (q.scores || {})[c.id] : 0;
      const opts = SCORE_OPTS.map(o =>
        `<option value="${o.val}" ${cur === o.val ? "selected" : ""}>${o.label}</option>`
      ).join("");
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div class="cdot" style="background:${c.color};flex-shrink:0"></div>
        <div style="flex:1;font-size:13px;font-weight:600">${c.name}
          <div style="font-size:11px;color:var(--muted);font-weight:400">${c.party || ""}</div>
        </div>
        <select id="qscore_${c.id}" style="font-size:12px;border:1.5px solid var(--border);border-radius:6px;padding:5px 6px;background:white;color:var(--text)">
          ${opts}
        </select>
      </div>`;
    }).join("");
  }

  $("editQModal").classList.add("open");
  document.body.style.overflow = "hidden";
};

window.closeEditQModal = function () {
  $("editQModal").classList.remove("open");
  document.body.style.overflow = "";
  editingQId = null;
};

window.handleEditQBg = function (e) {
  if (e.target === $("editQModal")) closeEditQModal();
};

window.saveEditQuestion = async function () {
  if (!editingQId) return;
  const text = ($("editQText").value || "").trim();
  if (!text) { showToast("質問文を入力してください"); return; }
  const scores = {};
  candidates.forEach(c => {
    const el = $(`qscore_${c.id}`);
    if (el) scores[c.id] = Number(el.value);
  });
  try {
    await updateDoc(doc(db, "matchingQuestions", editingQId), { text, scores });
    closeEditQModal();
    showToast("保存しました");
  } catch (e) {
    console.error(e);
    showToast("保存に失敗しました");
  }
};

attachModalScrollClose("editQModal", closeEditQModal); 
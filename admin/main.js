import { db, ADMIN_PASSCODE } from "../firebase.js";
import {
  collection,
  doc,
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
let editQuestionId = null;
let selectedAiCandidateId = null;
let votingEnabled = true;
let candidates = [],
  votes = [],
  matchingQuestions = [],
  inquiries = [];

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
    ["mainUI", "sec1", "sec2", "sec3", "sec4", "sec8", "sec5", "sec7", "sec6"].forEach(
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
  onSnapshot(doc(db, "election", "config"), (cfg) => {
    if (cfg.exists()) {
      const data = cfg.data();
      $("elNameInput").value = data.name || "";
      votingEnabled = data.votingEnabled !== false;
    } else {
      votingEnabled = true;
    }
    renderVotingToggle();
  });

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
  onSnapshot(collection(db, "matchingQuestions"), (snap) => {
    matchingQuestions = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    renderMatchingQuestions();
  });
  onSnapshot(collection(db, "inquiries"), (snap) => {
    inquiries = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
    renderInquiryList();
    renderInquiryBanner();
  });
}

function renderVotingToggle() {
  const state = $("voteStateText");
  const btn = $("voteToggleBtn");
  if (!state || !btn) return;

  state.textContent = votingEnabled ? "現在: 投票可能" : "現在: 投票停止中";
  state.style.color = votingEnabled ? "var(--green)" : "var(--red)";

  btn.textContent = votingEnabled ? "投票を停止する" : "投票を再開する";
  btn.className = votingEnabled
    ? "btn btn-danger btn-full"
    : "btn btn-primary btn-full";
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
    await setDoc(doc(db, "election", "config"), { name }, { merge: true });
    showToast("選挙名を保存しました");
  } catch (e) {
    console.error("saveElectionName error", e);
    showToast("保存に失敗しました: " + (e.message || e));
  }
};

window.toggleVotingEnabled = async function () {
  const next = !votingEnabled;
  try {
    await setDoc(
      doc(db, "election", "config"),
      { votingEnabled: next, updatedAt: serverTimestamp() },
      { merge: true },
    );
    showToast(next ? "投票を再開しました" : "投票を停止しました");
  } catch (e) {
    console.error("toggleVotingEnabled error", e);
    showToast("投票状態の更新に失敗しました");
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
  if (e.target === $("editModal")) window.closeEditModal();
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
    window.closeEditModal();
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

// モーダル上で下方向に引いた分だけシートを追従させ、指を離した時だけ閉じる
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
    const dy = y - touchStartY; // 正: 指が下方向
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

function typeLabel(type) {
  if (type === "bug") return "不具合報告";
  if (type === "feature") return "機能要望";
  if (type === "question") return "質問";
  return "その他";
}

function renderInquiryBanner() {
  const banner = $("inquiryAlertBanner");
  const text = $("inquiryAlertText");
  if (!banner || !text) return;

  if (!inquiries.length) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "flex";
  const latest = inquiries[0];
  text.textContent = `${inquiries.length}件のお問い合わせがあります（最新: ${fmtTime(latest.createdAt)}）`;
}

function renderInquiryList() {
  $("inquiryCount").textContent = `${inquiries.length}件`;
  if (!inquiries.length) {
    $("inquiryList").innerHTML =
      '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">まだお問い合わせがありません</div>';
    return;
  }

  $("inquiryList").innerHTML = inquiries
    .map((inq) => {
      const name = inq.name || "匿名";
      const email = inq.email || "メール未入力";
      const tLabel = typeLabel(inq.type);
      const msg = inq.message || "";
      return `
      <div class="inq-item">
        <div class="inq-head">
          <div class="inq-meta">
            <span class="inq-type">${tLabel}</span>
            <span>🕐 ${fmtTime(inq.createdAt)}</span>
          </div>
          <button class="btn btn-danger inq-del-btn" onclick="deleteInquiry('${inq.id}')">削除</button>
        </div>
        <div class="inq-name">${name} <span style="font-size:11px;color:var(--muted);font-weight:500">(${email})</span></div>
        <div class="inq-msg">${msg}</div>
      </div>`;
    })
    .join("");
}

window.scrollToInquirySection = function () {
  const sec = $("sec8");
  if (!sec) return;
  sec.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteInquiry = async function (id) {
  const target = inquiries.find((x) => x.id === id);
  if (!target) return;
  const preview = (target.message || "").slice(0, 40);
  if (!confirm(`このお問い合わせを削除しますか？\n「${preview}${target.message?.length > 40 ? "..." : ""}」`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "inquiries", id));
    showToast("お問い合わせを削除しました");
  } catch (e) {
    console.error("deleteInquiry error", e);
    showToast("削除に失敗しました");
  }
};

window.deleteAllInquiries = async function () {
  if (!inquiries.length) {
    showToast("削除対象のお問い合わせがありません");
    return;
  }
  if (!confirm(`お問い合わせ ${inquiries.length} 件をすべて削除しますか？`)) return;

  try {
    for (const inq of inquiries) {
      await deleteDoc(doc(db, "inquiries", inq.id));
    }
    showToast("お問い合わせを一括削除しました");
  } catch (e) {
    console.error("deleteAllInquiries error", e);
    showToast("一括削除に失敗しました");
  }
};

function getScoreOptions(selected = 0) {
  const opts = [2, 1, 0, -1, -2];
  return opts
    .map((v) => `<option value="${v}"${v === selected ? " selected" : ""}>${v > 0 ? `+${v}` : v}</option>`)
    .join("");
}

function renderMatchingQuestions() {
  const el = $("mqList");
  if (!el) return;

  if (!matchingQuestions.length) {
    el.innerHTML =
      '<div style="text-align:center;padding:20px 0;font-size:13px;color:var(--muted)">質問がありません</div>';
    return;
  }

  el.innerHTML = matchingQuestions
    .map((q, i) => {
      const scores = q.scores || {};
      const scorePreview = candidates.length
        ? candidates
            .slice(0, 3)
            .map((c) => `${c.name}:${typeof scores[c.id] === "number" ? scores[c.id] : 0}`)
            .join(" / ")
        : "候補者未登録";

      return `
      <div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;background:white">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--muted);font-weight:700">Q${i + 1}</div>
            <div style="font-size:14px;font-weight:700;line-height:1.6">${q.text || "（未設定）"}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:6px">候補者スコア: ${scorePreview}${candidates.length > 3 ? " ..." : ""}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary" style="padding:8px 10px" onclick="openEditQModal('${q.id}')">編集</button>
            <button class="btn btn-danger" style="padding:8px 10px" onclick="deleteMatchingQuestion('${q.id}')">削除</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

window.addMatchingQuestion = async function () {
  const text = $("mqNewText")?.value.trim();
  if (!text) {
    showToast("質問文を入力してください");
    return;
  }
  if (!candidates.length) {
    showToast("候補者を先に登録してください");
    return;
  }

  const scores = {};
  candidates.forEach((c) => {
    scores[c.id] = 0;
  });
  const nextOrder =
    matchingQuestions.length > 0
      ? Math.max(...matchingQuestions.map((q) => q.order ?? 0)) + 1
      : 1;

  try {
    await setDoc(doc(db, "matchingQuestions", `mq_${Date.now()}`), {
      text,
      order: nextOrder,
      scores,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    $("mqNewText").value = "";
    showToast("質問を追加しました");
  } catch (e) {
    console.error("addMatchingQuestion error", e);
    showToast("質問の追加に失敗しました");
  }
};

window.openEditQModal = function (id) {
  const q = matchingQuestions.find((x) => x.id === id);
  if (!q) return;

  editQuestionId = id;
  $("editQText").value = q.text || "";

  const scoreBox = $("editQScores");
  scoreBox.innerHTML = candidates.length
    ? candidates
        .map((c) => {
          const cur = typeof (q.scores || {})[c.id] === "number" ? (q.scores || {})[c.id] : 0;
          return `
          <div style="display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:13px">${c.name}<span style="font-size:11px;color:var(--muted)">（${c.party || "無所属"}）</span></div>
            <select id="eq_score_${c.id}" style="padding:8px 10px">${getScoreOptions(cur)}</select>
          </div>`;
        })
        .join("")
    : '<div style="font-size:12px;color:var(--muted)">候補者が登録されていないためスコア編集できません</div>';

  $("editQModal").classList.add("open");
  document.body.style.overflow = "hidden";
};

window.closeEditQModal = function () {
  $("editQModal").classList.remove("open");
  document.body.style.overflow = "";
  editQuestionId = null;
};

window.handleEditQBg = function (e) {
  if (e.target === $("editQModal")) window.closeEditQModal();
};

window.saveEditQuestion = async function () {
  if (!editQuestionId) return;
  const text = $("editQText").value.trim();
  if (!text) {
    showToast("質問文を入力してください");
    return;
  }

  const scores = {};
  candidates.forEach((c) => {
    const el = $(`eq_score_${c.id}`);
    const raw = el ? Number(el.value) : 0;
    scores[c.id] = Number.isFinite(raw) ? Math.max(-2, Math.min(2, raw)) : 0;
  });

  try {
    await updateDoc(doc(db, "matchingQuestions", editQuestionId), {
      text,
      scores,
      updatedAt: serverTimestamp(),
    });
    window.closeEditQModal();
    showToast("質問を保存しました");
  } catch (e) {
    console.error("saveEditQuestion error", e);
    showToast("保存に失敗しました");
  }
};

window.deleteMatchingQuestion = async function (id) {
  const q = matchingQuestions.find((x) => x.id === id);
  if (!q) return;
  if (!confirm(`この質問を削除しますか？\n「${q.text || "無題"}」`)) return;

  try {
    await deleteDoc(doc(db, "matchingQuestions", id));
    showToast("質問を削除しました");
  } catch (e) {
    console.error("deleteMatchingQuestion error", e);
    showToast("削除に失敗しました");
  }
};

attachModalScrollClose("editModal", window.closeEditModal);
attachModalScrollClose("editQModal", window.closeEditQModal);

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
  ["sec1", "sec2", "sec3", "sec4", "sec8", "sec5", "sec7", "sec6"].forEach(
    (id) => ($(id).style.display = "none"),
  );
  $("sec5").style.display = "";
  renderAiManageList();
};

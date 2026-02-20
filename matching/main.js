import { db } from "../firebase.js";
import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== UTILS =====
const $ = (id) => document.getElementById(id);
const initials = (n) => (n || "?").replace(/\s/g, "").slice(0, 1);

// ===== STATE =====
let candidates  = [];
let questions   = [];
let answers     = [];
let priorityIds = new Set();
let currentQ    = 0;
let dataReady   = { cands: false, qs: false };

const PRIORITY_WEIGHT = 3;

// ===== FIREBASE =====
onSnapshot(collection(db, "candidates"), (snap) => {
  candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  dataReady.cands = true;
  checkReady();
});

onSnapshot(collection(db, "matchingQuestions"), (snap) => {
  questions = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  dataReady.qs = true;
  checkReady();
});

function checkReady() {
  if (!dataReady.cands || !dataReady.qs) return;
  const status = $("candidateLoadStatus");
  const btn    = $("startBtn");

  if (!candidates.length) {
    $("startScreen").style.display  = "none";
    $("noCandScreen").style.display = "";
    return;
  }
  $("noCandScreen").style.display = "none";
  $("startScreen").style.display  = "";

  if (!questions.length) {
    status.textContent = "⚠️ 質問が登録されていません（管理画面で設定してください）";
    status.style.color = "#e03131";
    btn.disabled = true;
    return;
  }

  status.textContent = `${candidates.length}名の候補者 · ${questions.length}問`;
  status.style.color = "#2f9e44";
  btn.disabled = false;
  $("startNoteCount").textContent = `📋 全${questions.length}問`;
  $("startNoteTime").textContent  = `⏱ 所要時間：約${Math.ceil(questions.length * 0.2)}分`;
}

// ===== QUIZ =====
window.startQuiz = function () {
  if (!questions.length || !candidates.length) return;
  answers     = new Array(questions.length).fill(undefined);
  priorityIds = new Set();
  currentQ    = 0;
  show("quizScreen");
  renderQuestion();
};

function show(id) {
  ["startScreen","quizScreen","priorityScreen","resultScreen","noCandScreen"]
    .forEach(s => $(s).style.display = s === id ? "" : "none");
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderQuestion() {
  const q     = questions[currentQ];
  const total = questions.length;

  $("qpFill").style.width    = ((currentQ / total) * 100) + "%";
  $("qpCurrent").textContent = currentQ + 1;
  $("qpTotal").textContent   = total;
  $("quizQNum").textContent  = `Q${currentQ + 1}`;
  $("quizQText").textContent = q.text;

  const current = answers[currentQ];
  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.remove("selected");
    const v    = btn.getAttribute("data-val");
    const bVal = v === "null" ? null : Number(v);
    if (current !== undefined && current === bVal) btn.classList.add("selected");
  });

  $("backBtn").style.display = currentQ > 0 ? "" : "none";
}

window.answer = function (val) {
  answers[currentQ] = val;
  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.remove("selected");
    const v    = btn.getAttribute("data-val");
    const bVal = v === "null" ? null : Number(v);
    if (bVal === val) btn.classList.add("selected");
  });
  setTimeout(() => {
    if (currentQ < questions.length - 1) {
      currentQ++;
      renderQuestion();
    } else {
      showPriorityScreen();
    }
  }, 280);
};

window.goBack = function () {
  if (currentQ > 0) { currentQ--; renderQuestion(); }
};

// ===== PRIORITY SCREEN =====
function showPriorityScreen() {
  const answered = questions.filter((_, i) =>
    answers[i] !== undefined && answers[i] !== null
  );
  if (answered.length === 0) { calcAndShow(); return; }

  show("priorityScreen");
  $("qpFill").style.width = "100%";

  $("priorityList").innerHTML = answered.map((q) => {
    const origIdx = questions.indexOf(q);
    return `
    <div class="priority-q-item" id="pq_${q.id}" onclick="togglePriority('${q.id}')">
      <div class="priority-star">⭐</div>
      <div style="flex:1;min-width:0">
        <div class="priority-q-num">Q${origIdx + 1}</div>
        <div class="priority-q-label">${q.text}</div>
      </div>
    </div>`;
  }).join("");

  updatePriorityUI();
}

window.togglePriority = function (id) {
  if (priorityIds.has(id)) {
    priorityIds.delete(id);
  } else {
    if (priorityIds.size >= 2) return;
    priorityIds.add(id);
  }
  updatePriorityUI();
};

function updatePriorityUI() {
  document.querySelectorAll(".priority-q-item").forEach(el => {
    const elId = el.id.replace("pq_", "");
    el.classList.toggle("selected", priorityIds.has(elId));
    if (!priorityIds.has(elId) && priorityIds.size >= 2) {
      el.classList.add("disabled");
    } else {
      el.classList.remove("disabled");
    }
  });
  $("priorityCount").textContent = priorityIds.size;
}

window.skipPriority = function () {
  priorityIds.clear();
  calcAndShow();
};

// ===== MATCHING ALGORITHM =====
function calcMatchScore(cand) {
  let weightedDiff = 0, weightedMax = 0;
  questions.forEach((q, i) => {
    const userAns = answers[i];
    if (userAns === undefined || userAns === null) return;
    const candPos = typeof (q.scores || {})[cand.id] === "number"
      ? (q.scores || {})[cand.id] : 0;
    const w = priorityIds.has(q.id) ? PRIORITY_WEIGHT : 1;
    weightedDiff += w * Math.abs(userAns - candPos);
    weightedMax  += w * 4;
  });
  if (weightedMax === 0) return 50;
  return Math.max(0, Math.min(100,
    Math.round(((weightedMax - weightedDiff) / weightedMax) * 100)
  ));
}

function getAgreementLabel(diff) {
  if (diff === 0) return { label: "一致",       cls: "agree-yes"  };
  if (diff === 1) return { label: "近い",       cls: "agree-near" };
  if (diff === 2) return { label: "やや差",     cls: "agree-mid"  };
  if (diff === 3) return { label: "差あり",     cls: "agree-no"   };
  return                  { label: "差が大きい", cls: "agree-far"  };
}

// 同率順位を計算する
function assignRanks(scored) {
  // scored は matchScore 降順でソート済み
  return scored.map((c, i, arr) => {
    // 自分より高スコアが何人いるか → それ+1が順位
    const rank = arr.filter(x => x.matchScore > c.matchScore).length + 1;
    return { ...c, rank };
  });
}

// 順位に応じたラベル・色
const RANK_META = {
  1: { emoji: "🥇", color: "#f59e0b" },
  2: { emoji: "🥈", color: "#9ca3af" },
  3: { emoji: "🥉", color: "#b45309" },
};
function getRankMeta(rank) {
  return RANK_META[rank] || { emoji: `${rank}位`, color: "#6b7280" };
}

// ===== RESULT =====
window.calcAndShow = function () {
  const scored = candidates
    .map((c) => ({ ...c, matchScore: calcMatchScore(c) }))
    .sort((a, b) => b.matchScore - a.matchScore);

  const ranked = assignRanks(scored);

  // 重要質問バッジ
  const pArea = $("priorityBadgeArea");
  if (priorityIds.size > 0) {
    const labels = [...priorityIds].map(id => {
      const q   = questions.find(x => x.id === id);
      const idx = questions.indexOf(q);
      return `Q${idx + 1}`;
    }).join("・");
    pArea.innerHTML = `
      <div class="result-priority-badge">
        ⭐ 重視した質問: ${labels}（3倍の重みで計算）
      </div>`;
  } else {
    pArea.innerHTML = "";
  }

  $("resultCards").innerHTML = ranked.map((c) => {
    const color    = c.color || "#1a56db";
    const meta     = getRankMeta(c.rank);
    const isMedal  = c.rank <= 3;
    // 同率の場合は「同率○位」と表示
    const sameRankCount = ranked.filter(x => x.rank === c.rank).length;
    const rankLabel = sameRankCount > 1
      ? `同率${c.rank}位 ${isMedal ? meta.emoji : ""}`
      : `${isMedal ? meta.emoji : c.rank + "位"}`;

    const breakdown = questions.map((q, i) => {
      const userAns = answers[i];
      if (userAns === undefined || userAns === null) return null;
      const candPos = typeof (q.scores || {})[c.id] === "number"
        ? (q.scores || {})[c.id] : 0;
      const ag    = getAgreementLabel(Math.abs(userAns - candPos));
      const isPri = priorityIds.has(q.id);
      return { text: q.text, ag, isPri, qIdx: i };
    }).filter(Boolean);

    const breakdownHtml = breakdown.length
      ? `<div class="match-breakdown-title">回答との比較</div>` +
        breakdown.map(({ text, ag, isPri, qIdx }) => `
          <div class="match-q-row">
            <div class="match-q-text">${isPri ? "⭐ " : ""}<span style="font-size:10px;color:var(--primary);font-weight:700;margin-right:4px">Q${qIdx + 1}</span>${text}</div>
            <div class="match-q-agree ${ag.cls}">${ag.label}</div>
          </div>`).join("")
      : `<div style="font-size:12px;color:var(--muted)">（全問スキップのため比較なし）</div>`;

    return `
      <div class="result-card-wrap" style="margin-bottom:12px">
        <div style="background:${meta.color};display:flex;align-items:center;gap:8px;padding:7px 14px">
          <span style="font-size:14px;font-weight:900;color:white">${rankLabel}</span>
        </div>
        <div class="result-body">
          <div class="result-cand-row">
            <div class="result-ava" style="background:${color}">${initials(c.name)}</div>
            <div style="flex:1;min-width:0">
              <div class="result-cand-name">${c.name}</div>
              <div class="result-cand-party">${c.party || ""}${c.status ? " / " + c.status : ""}</div>
            </div>
            <div style="font-size:26px;font-weight:900;color:${color};flex-shrink:0">${c.matchScore}%</div>
          </div>
          <div class="match-bar-track" style="margin-bottom:14px">
            <div class="match-bar-fill" style="width:${c.matchScore}%;background:${color}"></div>
          </div>
          ${breakdownHtml}
        </div>
      </div>`;
  }).join("");

  // 結果画面を表示してから最上部へ
  show("resultScreen");
};

window.resetQuiz = function () {
  answers     = [];
  priorityIds = new Set();
  currentQ    = 0;
  show("startScreen");
};
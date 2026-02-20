import { db } from "../firebase.js";
import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== UTILS =====
const $ = (id) => document.getElementById(id);
const initials = (n) => (n || "?").replace(/\s/g, "").slice(0, 1);

// ===== STATE =====
let candidates = [];
let questions  = []; // { id, text, order, scores:{candId: number} }
let answers    = []; // undefined | null | number(-2〜2)
let priorityIds = new Set(); // 選択された重要質問IDのSet（最大2）
let currentQ   = 0;
let dataReady  = { cands: false, qs: false };

const PRIORITY_WEIGHT = 3; // 重要質問の重み倍率

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

// ===== QUIZ FLOW =====
window.startQuiz = function () {
  if (!questions.length || !candidates.length) return;
  answers     = new Array(questions.length).fill(undefined);
  priorityIds = new Set();
  currentQ    = 0;
  $("startScreen").style.display    = "none";
  $("quizScreen").style.display     = "";
  $("priorityScreen").style.display = "none";
  $("resultScreen").style.display   = "none";
  renderQuestion();
};

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
  $("quizScreen").style.display     = "none";
  $("priorityScreen").style.display = "";
  $("qpFill").style.width = "100%";

  // 回答した質問のみ表示（スキップ・未回答除く）
  const answered = questions.filter((_, i) =>
    answers[i] !== undefined && answers[i] !== null
  );

  if (answered.length === 0) {
    // 全スキップなら直接結果へ
    calcAndShow();
    return;
  }

  $("priorityList").innerHTML = answered.map((q, _) => {
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

  updatePriorityCount();
}

window.togglePriority = function (id) {
  if (priorityIds.has(id)) {
    priorityIds.delete(id);
  } else {
    if (priorityIds.size >= 2) return; // 上限
    priorityIds.add(id);
  }
  // UI更新
  document.querySelectorAll(".priority-q-item").forEach(el => {
    const elId = el.id.replace("pq_", "");
    el.classList.toggle("selected", priorityIds.has(elId));
  });
  // 未選択かつ2個すでに選択済みはdisabled
  document.querySelectorAll(".priority-q-item").forEach(el => {
    const elId = el.id.replace("pq_", "");
    if (!priorityIds.has(elId) && priorityIds.size >= 2) {
      el.classList.add("disabled");
    } else {
      el.classList.remove("disabled");
    }
  });
  updatePriorityCount();
};

function updatePriorityCount() {
  $("priorityCount").textContent = priorityIds.size;
}

window.skipPriority = function () {
  priorityIds.clear();
  calcAndShow();
};

// ===== MATCHING ALGORITHM =====
function calcMatchScore(cand) {
  let weightedDiff = 0;
  let weightedMax  = 0;

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

// ===== RESULT =====
window.calcAndShow = function () {
  $("priorityScreen").style.display = "none";
  $("resultScreen").style.display   = "";

  const scored = candidates
    .map((c) => ({ ...c, matchScore: calcMatchScore(c) }))
    .sort((a, b) => b.matchScore - a.matchScore);

  // 重要質問バッジ
  const pArea = $("priorityBadgeArea");
  if (priorityIds.size > 0) {
    const labels = [...priorityIds].map(id => {
      const q = questions.find(x => x.id === id);
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

  // ランク色
  const rankColors = ["#f59e0b", "#9ca3af", "#b45309", "#6b7280", "#d1d5db"];
  const rankEmojis = ["🥇", "🥈", "🥉", "4位", "5位"];

  $("resultCards").innerHTML = scored.map((c, ri) => {
    const color     = c.color || "#1a56db";
    const rankColor = rankColors[ri] || "#d1d5db";
    const rankEmoji = ri < 3 ? rankEmojis[ri] : `${ri + 1}位`;

    const breakdown = questions.map((q, i) => {
      const userAns = answers[i];
      if (userAns === undefined || userAns === null) return null;
      const candPos = typeof (q.scores || {})[c.id] === "number"
        ? (q.scores || {})[c.id] : 0;
      const diff = Math.abs(userAns - candPos);
      const ag   = getAgreementLabel(diff);
      const isPri = priorityIds.has(q.id);
      return { text: q.text, ag, isPri, qIdx: i };
    }).filter(Boolean);

    const breakdownHtml = breakdown.length
      ? `<div class="match-breakdown-title">回答との比較</div>` +
        breakdown.map(({ text, ag, isPri, qIdx }) => `
          <div class="match-q-row">
            <div class="match-q-text">${isPri ? "⭐ " : ""}<span style="font-size:10px;color:var(--primary);font-weight:700;margin-right:4px">Q${qIdx+1}</span>${text}</div>
            <div class="match-q-agree ${ag.cls}">${ag.label}</div>
          </div>`).join("")
      : `<div style="font-size:12px;color:var(--muted)">（全問スキップのため比較なし）</div>`;

    return `
      <div class="result-card-wrap" style="margin-bottom:12px">
        <div class="result-rank-badge" style="background:${rankColor};display:flex;align-items:center;gap:8px;padding:7px 14px">
          <span style="font-size:16px">${ri < 3 ? rankEmojis[ri] : ""}</span>
          <span style="font-size:12px;font-weight:700">${ri >= 3 ? (ri+1)+"位" : ""} ${c.name}</span>
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
};

window.resetQuiz = function () {
  answers     = [];
  priorityIds = new Set();
  currentQ    = 0;
  $("resultScreen").style.display   = "none";
  $("priorityScreen").style.display = "none";
  $("startScreen").style.display    = "";
};
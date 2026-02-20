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
let questions  = []; // Firestoreから取得 { id, text, order, scores:{candId: number} }
let answers    = []; // undefined | null | number(-2〜2)
let currentQ   = 0;
let dataReady  = { cands: false, qs: false };

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
    $("startScreen").style.display = "none";
    $("noCandScreen").style.display = "";
    return;
  }
  $("noCandScreen").style.display  = "none";
  $("startScreen").style.display   = "";

  if (!questions.length) {
    status.textContent = "⚠️ 質問が登録されていません（管理画面で設定してください）";
    status.style.color = "var(--red, #e03131)";
    btn.disabled = true;
    return;
  }

  status.textContent = `${candidates.length}名の候補者 · ${questions.length}問`;
  status.style.color = "var(--green, #2f9e44)";
  btn.disabled = false;
}

// ===== QUIZ FLOW =====
window.startQuiz = function () {
  if (!questions.length || !candidates.length) return;
  answers  = new Array(questions.length).fill(undefined);
  currentQ = 0;
  $("startScreen").style.display  = "none";
  $("quizScreen").style.display   = "";
  $("resultScreen").style.display = "none";
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
      showResult();
    }
  }, 280);
};

window.goBack = function () {
  if (currentQ > 0) { currentQ--; renderQuestion(); }
};

// ===== MATCHING ALGORITHM =====
function calcMatchScore(cand) {
  let totalDiff = 0, answered = 0;
  questions.forEach((q, i) => {
    const userAns = answers[i];
    if (userAns === undefined || userAns === null) return;
    const candPos = typeof (q.scores || {})[cand.id] === "number" ? (q.scores || {})[cand.id] : 0;
    totalDiff += Math.abs(userAns - candPos);
    answered++;
  });
  if (answered === 0) return 50;
  return Math.max(0, Math.min(100, Math.round(((4 * answered - totalDiff) / (4 * answered)) * 100)));
}

function getAgreementLabel(diff) {
  if (diff === 0) return { label: "一致",       cls: "agree-yes"  };
  if (diff === 1) return { label: "近い",       cls: "agree-near" };
  if (diff === 2) return { label: "やや差",     cls: "agree-mid"  };
  if (diff === 3) return { label: "差あり",     cls: "agree-no"   };
  return                  { label: "差が大きい", cls: "agree-far"  };
}

function showResult() {
  $("quizScreen").style.display   = "none";
  $("resultScreen").style.display = "";
  $("qpFill").style.width = "100%";

  const scored = candidates
    .map((c) => ({ ...c, matchScore: calcMatchScore(c) }))
    .sort((a, b) => b.matchScore - a.matchScore);

  const top2       = scored.slice(0, 2);
  const rankColors = ["#d97706", "#6b7280"];
  const rankLabels = ["1位", "2位"];
  const rankEmojis = ["🥇", "🥈"];

  $("resultCards").innerHTML = top2.map((c, ri) => {
    const color = c.color || "#1a56db";

    const breakdown = questions.map((q, i) => {
      const userAns = answers[i];
      if (userAns === undefined || userAns === null) return null;
      const candPos = typeof (q.scores || {})[c.id] === "number" ? (q.scores || {})[c.id] : 0;
      const ag = getAgreementLabel(Math.abs(userAns - candPos));
      return { text: q.text, ag };
    }).filter(Boolean);

    const breakdownHtml = breakdown.length
      ? `<div class="match-breakdown-title">回答との比較</div>` +
        breakdown.map(({ text, ag }) => `
          <div class="match-q-row">
            <div class="match-q-text">${text}</div>
            <div class="match-q-agree ${ag.cls}">${ag.label}</div>
          </div>`).join("")
      : `<div style="font-size:12px;color:var(--muted)">（全問スキップのため比較なし）</div>`;

    return `
      <div class="result-card-wrap">
        <div class="result-rank-badge" style="background:${rankColors[ri]}">
          ${rankEmojis[ri]} ${rankLabels[ri]}マッチ
        </div>
        <div class="result-body">
          <div class="result-cand-row">
            <div class="result-ava" style="background:${color}">${initials(c.name)}</div>
            <div>
              <div class="result-cand-name">${c.name}</div>
              <div class="result-cand-party">${c.party || ""}${c.status ? " / " + c.status : ""}</div>
            </div>
          </div>
          <div class="match-meter-label">
            <span>マッチ度</span><span>${c.matchScore}%</span>
          </div>
          <div class="match-bar-track">
            <div class="match-bar-fill" style="width:${c.matchScore}%;background:${color}"></div>
          </div>
          ${breakdownHtml}
        </div>
      </div>`;
  }).join('<div style="height:12px"></div>');
}

window.resetQuiz = function () {
  answers  = [];
  currentQ = 0;
  $("resultScreen").style.display = "none";
  $("startScreen").style.display  = "";
};
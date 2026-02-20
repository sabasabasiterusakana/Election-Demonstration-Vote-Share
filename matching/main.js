import { db } from "../firebase.js";
import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===== UTILS =====
const $ = (id) => document.getElementById(id);
const initials = (n) => (n || "?").replace(/\s/g, "").slice(0, 1);

// ===== QUESTIONS =====
// 各質問に候補者の立場スコアを管理者が設定する想定だが、
// 候補者データに positionScores がなければ全問をニュートラル(0)として扱う。
// scores: { q0: 2, q1: -1, ... } の形でFirestoreに保存可能。

const QUESTIONS = [
  {
    id: "q0",
    text: "学校の設備（教室・トイレ・体育館など）の改善を最優先すべきだと思う",
  },
  {
    id: "q1",
    text: "部活動や放課後の課外活動をもっと充実させるべきだと思う",
  },
  {
    id: "q2",
    text: "学校行事（文化祭・体育祭など）をより自由で個性的なものにすべきだと思う",
  },
  {
    id: "q3",
    text: "生徒が学校のルールを自分たちで決める機会をもっと増やすべきだと思う",
  },
  {
    id: "q4",
    text: "スマートフォンやタブレットなどICT機器を授業や自習にもっと活用すべきだと思う",
  },
  {
    id: "q5",
    text: "困っている生徒が気軽に相談できる場所や仕組みを充実させるべきだと思う",
  },
  {
    id: "q6",
    text: "学校と地域・保護者との連携を強化し、より多くの人が学校に関わるべきだと思う",
  },
  {
    id: "q7",
    text: "環境への配慮（省エネ・ゴミ削減など）を学校全体で積極的に取り組むべきだと思う",
  },
];

// ===== STATE =====
let candidates = [];
let answers = []; // null | number (-2〜2)
let currentQ = 0;

// ===== FIREBASE =====
onSnapshot(collection(db, "candidates"), (snap) => {
  candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const status = $("candidateLoadStatus");
  const btn = $("startBtn");

  if (!candidates.length) {
    // スタート画面を隠してno-cand画面へ
    $("startScreen").style.display = "none";
    $("noCandScreen").style.display = "";
    return;
  }

  status.textContent = `${candidates.length}名の候補者が登録されています`;
  status.style.color = "var(--green)";
  btn.disabled = false;
});

// ===== QUIZ FLOW =====
window.startQuiz = function () {
  answers = new Array(QUESTIONS.length).fill(undefined);
  currentQ = 0;
  $("startScreen").style.display = "none";
  $("quizScreen").style.display = "";
  $("resultScreen").style.display = "none";
  renderQuestion();
};

function renderQuestion() {
  const q = QUESTIONS[currentQ];
  const total = QUESTIONS.length;

  // Progress
  const pct = (currentQ / total) * 100;
  $("qpFill").style.width = pct + "%";
  $("qpCurrent").textContent = currentQ + 1;
  $("qpTotal").textContent = total;

  // Question text
  $("quizQNum").textContent = `Q${currentQ + 1}`;
  $("quizQText").textContent = q.text;

  // Choice states
  const current = answers[currentQ];
  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.remove("selected");
    const v = btn.getAttribute("data-val");
    const bVal = v === "null" ? null : Number(v);
    if (current !== undefined && current === bVal) {
      btn.classList.add("selected");
    }
  });

  // Back button
  $("backBtn").style.display = currentQ > 0 ? "" : "none";
}

window.answer = function (val) {
  // val は number(-2〜2) or null
  answers[currentQ] = val;

  // 選択アニメーション後に次へ
  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.remove("selected");
    const v = btn.getAttribute("data-val");
    const bVal = v === "null" ? null : Number(v);
    if (bVal === val) btn.classList.add("selected");
  });

  setTimeout(() => {
    if (currentQ < QUESTIONS.length - 1) {
      currentQ++;
      renderQuestion();
    } else {
      showResult();
    }
  }, 280);
};

window.goBack = function () {
  if (currentQ > 0) {
    currentQ--;
    renderQuestion();
  }
};

// ===== MATCHING ALGORITHM =====
function calcMatchScore(cand) {
  // 候補者の立場スコア: Firestoreの positionScores フィールドを使う
  // 例: { q0: 2, q1: 1, ... } 未設定の場合は 0（ニュートラル）とする
  const pos = cand.positionScores || {};

  let totalDiff = 0;
  let answeredCount = 0;

  QUESTIONS.forEach((q, i) => {
    const userAns = answers[i];
    if (userAns === undefined || userAns === null) return; // スキップ
    const candPos = typeof pos[q.id] === "number" ? pos[q.id] : 0;
    const diff = Math.abs(userAns - candPos); // 0〜4
    totalDiff += diff;
    answeredCount++;
  });

  if (answeredCount === 0) return 50; // 全スキップなら50%

  const maxDiff = 4 * answeredCount;
  const score = Math.round(((maxDiff - totalDiff) / maxDiff) * 100);
  return Math.max(0, Math.min(100, score));
}

function getAgreementLabel(userAns, candPos) {
  if (userAns === null || userAns === undefined) return null;
  const diff = Math.abs(userAns - candPos);
  if (diff === 0)  return { label: "一致",   cls: "agree-yes"  };
  if (diff === 1)  return { label: "近い",   cls: "agree-near" };
  if (diff === 2)  return { label: "やや差", cls: "agree-mid"  };
  if (diff === 3)  return { label: "差あり", cls: "agree-no"   };
  return            { label: "差が大きい",   cls: "agree-far"  };
}

function showResult() {
  $("quizScreen").style.display = "none";
  $("resultScreen").style.display = "";

  // スコア計算
  const scored = candidates.map((c) => ({
    ...c,
    matchScore: calcMatchScore(c),
  }));
  scored.sort((a, b) => b.matchScore - a.matchScore);

  const top2 = scored.slice(0, 2);

  const rankColors = ["#d97706", "#6b7280"];
  const rankLabels = ["1位", "2位"];
  const rankEmojis = ["🥇", "🥈"];

  $("resultCards").innerHTML = top2
    .map((c, ri) => {
      const color = c.color || "#1a56db";
      const pos = c.positionScores || {};

      // 回答した質問ごとの一致度
      const breakdown = QUESTIONS.map((q, i) => {
        const userAns = answers[i];
        if (userAns === undefined || userAns === null) return null;
        const candPos = typeof pos[q.id] === "number" ? pos[q.id] : 0;
        const ag = getAgreementLabel(userAns, candPos);
        return { text: q.text, ag };
      }).filter(Boolean);

      const breakdownHtml = breakdown.length
        ? `<div class="match-breakdown-title">回答との比較</div>` +
          breakdown
            .map(
              ({ text, ag }) => `
          <div class="match-q-row">
            <div class="match-q-text">${text}</div>
            <div class="match-q-agree ${ag.cls}">${ag.label}</div>
          </div>`
            )
            .join("")
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
            <span>マッチ度</span>
            <span>${c.matchScore}%</span>
          </div>
          <div class="match-bar-track">
            <div class="match-bar-fill" style="width:${c.matchScore}%;background:${color}"></div>
          </div>
          ${breakdownHtml}
        </div>
      </div>`;
    })
    .join('<div style="height:12px"></div>');

  // プログレスバーを100%に
  $("qpFill").style.width = "100%";
}

window.resetQuiz = function () {
  answers = [];
  currentQ = 0;
  $("resultScreen").style.display = "none";
  $("startScreen").style.display = "";
};
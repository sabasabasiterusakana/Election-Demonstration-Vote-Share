import { db } from "../firebase.js";
import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let candidates = [];

function renderList() {
  const el = $("aiCandList");
  if (!candidates.length) {
    el.innerHTML =
      '<div style="color:var(--muted);font-size:13px">候補者がいません</div>';
    $("aiDetail").textContent = "候補者を選択してください";
    return;
  }
  el.innerHTML = candidates
    .map(
      (c) => `
    <div class="cand-row" style="cursor:pointer;margin-bottom:8px" onclick="window.showAiDetail('${c.id}')">
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
}

window.showAiDetail = function (id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  const el = $("aiDetail");
  const analysis = c.aiAnalysis;

  if (!analysis || (typeof analysis === "string" && !analysis.trim())) {
    el.innerHTML = `<div style="font-weight:700;margin-bottom:8px">${c.name}（${c.party}）</div><div style="color:var(--muted)">AI分析は登録されていません</div>`;
    $("aiModal").classList.add("open");
    return;
  }

  let html = `<div style="font-weight:700;margin-bottom:12px">${c.name}（${c.party}）</div>`;

  // 古い形式（文字列）との互換性：文字列の場合はそのまま表示
  if (typeof analysis === "string") {
    html += `<div class="prof-bio">${analysis.replace(/\n/g, "<br>")}</div>`;
  } else {
    // 新形式（オブジェクト）：各フィールドを整形
    const sections = [
      { title: "公約の概要", key: "outline" },
      { title: "実現可能性", key: "feasibility" },
      { title: "メリット", key: "merits" },
      { title: "デメリット・懸念点", key: "demerits" },
    ];

    sections.forEach((sec) => {
      if (analysis[sec.key]) {
        html += `<div style="margin-top:12px"><div style="font-weight:700;color:var(--primary);margin-bottom:4px">${sec.title}</div><div class="prof-bio">${analysis[sec.key].replace(/\n/g, "<br>")}</div></div>`;
      }
    });

    if (analysis.points && typeof analysis.points === "object") {
      const pointsData = analysis.points;
      const pointLabels = [
        "生徒への影響度",
        "実現可能性",
        "具体性",
        "必要性・共感度",
      ];
      const hasAnyPoint = pointLabels.some((label) => pointsData[label]);

      if (hasAnyPoint) {
        html += `<div style="margin-top:12px"><div style="font-weight:700;color:var(--primary);margin-bottom:4px">有権者へのポイント</div>`;
        pointLabels.forEach((label) => {
          const rating = Math.min(5, Math.max(0, pointsData[label] || 0));
          const stars =
            rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) : "未評価";
          html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1">${label}</div><div style="color:#f59e0b;font-weight:700">${stars}</div></div>`;
        });
        html += `</div>`;
      }
    }
  }

  el.innerHTML = html;
  $("aiModal").classList.add("open");
};

onSnapshot(collection(db, "candidates"), (snap) => {
  candidates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderList();
  attachModalScrollClose("aiModal", window.closeAiModal);
});

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
      // 常に背景スクロール防止
      e.preventDefault();
      if (!isPointerDown) return;

      const scrollable = getScrollableContent(e.target);

      // 上方向スクロール
      if (e.deltaY < -THRESHOLD) {
        if (scrollable && scrollable.scrollTop > 0) {
          scrollable.scrollTop -= Math.abs(e.deltaY);
        }
        return;
      }

      // 下方向スクロール
      if (e.deltaY > THRESHOLD) {
        if (isAtTop(e.target)) {
          closeFn();
        } else if (scrollable) {
          scrollable.scrollTop += e.deltaY;
        }
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
      // 常に背景スクロール防止
      e.preventDefault();
      if (!isPointerDown) return;

      const scrollable = getScrollableContent(e.target);
      const y = e.touches[0]?.clientY || 0;
      const delta = touchStartY - y;

      // 上方向スクロール
      if (delta < -THRESHOLD) {
        if (scrollable && scrollable.scrollTop > 0) {
          scrollable.scrollTop -= Math.abs(delta);
        }
        return;
      }

      // 下方向スクロール
      if (delta > THRESHOLD) {
        if (isAtTop(e.target)) {
          closeFn();
        } else if (scrollable) {
          scrollable.scrollTop += delta;
        }
      }
    },
    { passive: false },
  );
}

window.closeAiModal = function (event) {
  if (event && event.target.id !== "aiModal") return;
  $("aiModal").classList.remove("open");
};

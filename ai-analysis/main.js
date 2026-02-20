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

  // .sheet要素（ドラッグで縮む対象）
  const sheet = el.querySelector(".sheet");

  let touchStartY       = 0;
  let touchStartedAtTop = false;
  let dragY             = 0;   // 上方向に引っ張った累積量（px）
  let isDragging        = false;
  let lastTouchTarget   = null;

  // ホイール用
  let wheelWasAtTop = false;
  let wheelTimer    = null;

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

  // sheetを引っ張り量に応じて縮める
  function applyDrag(pull) {
    if (!sheet) return;
    // translateY で下方向にずらす（引っ張り感）
    const t = Math.max(0, pull);
    sheet.style.transition = "none";
    sheet.style.transform  = `translateY(${t}px)`;
  }

  // sheetを元の位置に戻す（アニメーション付き）
  function resetDrag() {
    if (!sheet) return;
    sheet.style.transition = "transform 0.3s cubic-bezier(.4,0,.2,1)";
    sheet.style.transform  = "translateY(0)";
  }

  // ===== wheel =====
  el.addEventListener("wheel", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault();
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

  // ===== touch =====
  el.addEventListener("touchstart", (e) => {
    touchStartY       = e.touches[0]?.clientY || 0;
    touchStartedAtTop = checkAtTop(e.target);
    lastTouchTarget   = e.target;
    dragY             = 0;
    isDragging        = false;
    if (sheet) {
      sheet.style.transition = "none";
      sheet.style.transform  = "translateY(0)";
    }
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault();

    const scrollable = getScrollable(e.target);
    const y     = e.touches[0]?.clientY || 0;
    const delta = touchStartY - y;  // 正=上スクロール、負=下スクロール
    touchStartY = y;

    if (delta < 0) {
      // 上方向（指を下に動かす）
      if (touchStartedAtTop && checkAtTop(e.target)) {
        // 最上部スタート & 今も最上部 → ドラッグでsheetを縮める
        isDragging = true;
        dragY      = Math.max(0, dragY + Math.abs(delta));
        applyDrag(dragY);
      } else if (scrollable) {
        scrollable.scrollBy({ top: delta, behavior: "auto" });
      }
    } else if (delta > 0) {
      if (isDragging) {
        // ドラッグ中に下に戻したらdragYを減らす
        dragY = Math.max(0, dragY - delta);
        applyDrag(dragY);
        if (dragY === 0) isDragging = false;
      } else if (scrollable) {
        scrollable.scrollBy({ top: delta, behavior: "auto" });
      }
    }
  }, { passive: false });

  el.addEventListener("touchend", () => {
    const CLOSE_THRESHOLD = 80; // px：これ以上引っ張ったら閉じる
    if (isDragging && dragY >= CLOSE_THRESHOLD) {
      // 閉じるアニメーション
      if (sheet) {
        sheet.style.transition = "transform 0.25s cubic-bezier(.4,0,.2,1)";
        sheet.style.transform  = "translateY(100%)";
        setTimeout(() => {
          sheet.style.transition = "";
          sheet.style.transform  = "";
          closeFn();
        }, 250);
      } else {
        closeFn();
      }
    } else {
      resetDrag();
    }
    isDragging = false;
    dragY      = 0;
  });

  el.addEventListener("touchcancel", () => {
    resetDrag();
    isDragging = false;
    dragY      = 0;
  });
}

window.closeAiModal = function (event) {
  if (event && event.target.id !== "aiModal") return;
  $("aiModal").classList.remove("open");
};
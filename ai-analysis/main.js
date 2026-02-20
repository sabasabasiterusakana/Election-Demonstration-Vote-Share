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

  const sheet = el.querySelector(".sheet");

  let touchStartY       = 0;
  let touchStartedAtTop = false;
  let dragY             = 0;
  let isDragging        = false;
  let lastTime          = 0;
  let velocityY         = 0;   // px/ms 正=上スクロール（scrollTop増加方向）
  let inertiaRAF        = null;
  let lastScrollable    = null; // touchmoveで使ったscrollableをtouchendに引き継ぐ

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

  function startInertia(scrollable, initVel) {
    stopInertia();
    if (!scrollable || Math.abs(initVel) < 0.1) return;
    let vel      = initVel;
    let prevTime = performance.now();
    const FRICTION = 0.94;
    const MIN_VEL  = 0.05;

    function step(now) {
      const dt = Math.min(now - prevTime, 32);
      prevTime = now;
      vel *= Math.pow(FRICTION, dt / 16);
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
    lastTime          = performance.now();
    velocityY         = 0;
    touchStartedAtTop = checkAtTop(e.target);
    dragY             = 0;
    isDragging        = false;
    lastScrollable    = getScrollable(e.target);
    if (sheet) { sheet.style.transition = "none"; sheet.style.transform = "translateY(0)"; }
  }, { passive: true });

  // ===== touchmove =====
  el.addEventListener("touchmove", (e) => {
    if (!el.contains(e.target)) return;
    e.preventDefault();

    const y   = e.touches[0].clientY;
    const now = performance.now();
    const dt  = now - lastTime;
    // dy: 正=指が上に移動=コンテンツが上にスクロール=scrollTop増加
    const dy  = touchStartY - y;
    touchStartY = y;
    lastTime    = now;

    // 速度：正=scrollTop増加方向（上スクロール）
    if (dt > 0) {
      const rawVel = dy / dt;
      velocityY = velocityY * 0.6 + rawVel * 0.4;
    }

    if (dy < 0) {
      // 指を下に動かす → 上方向スクロール（コンテンツが下に見える）
      if (touchStartedAtTop && checkAtTop(e.target)) {
        isDragging = true;
        dragY      = Math.max(0, dragY + Math.abs(dy));
        applyDrag(dragY);
      } else if (lastScrollable) {
        lastScrollable.scrollTop += dy;
      }
    } else if (dy > 0) {
      // 指を上に動かす → 下方向スクロール（コンテンツが上に見える）
      if (isDragging) {
        dragY = Math.max(0, dragY - dy);
        applyDrag(dragY);
        if (dragY === 0) isDragging = false;
      } else if (lastScrollable) {
        lastScrollable.scrollTop += dy;
      }
    }
  }, { passive: false });

  // ===== touchend =====
  el.addEventListener("touchend", () => {
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
      // 慣性スクロール：velocityY正=scrollTop増加（上スクロール方向）
      startInertia(lastScrollable, velocityY);
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

window.closeAiModal = function (event) {
  if (event && event.target.id !== "aiModal") return;
  $("aiModal").classList.remove("open");
};
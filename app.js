let lastCustomCards = [];
// LuckyStat App
// Data storage keys
const STORAGE_KEY = "luckystat_data_v1";
const AUTO_KEY = "luckystat_auto_sets_v1";

// Sample data used on first run or when data incomplete
const SAMPLE_DATA = {
  weekly_ranges: [
    { range: "1-5", percent: 92, count: 12 },
    { range: "6-10", percent: 85, count: 11 },
    { range: "11-15", percent: 100, count: 13 },
    { range: "16-20", percent: 100, count: 13 },
    { range: "21-25", percent: 100, count: 13 },
    { range: "26-30", percent: 100, count: 13 },
    { range: "31-35", percent: 92, count: 12 },
    { range: "36-40", percent: 100, count: 13 },
    { range: "41-45", percent: 38, count: 5 }
  ],
  missed_numbers: {
    "1-10": [],
    "11-20": [18],
    "21-30": [30],
    "31-40": [],
    "41-45": [43, 44]
  },
  total_stats: (() => {
    // Minimal plausible demo counts; real users should paste full stats
    const base = [
      [34, 204], [27, 202], [12, 202], [7, 200], [3, 198], [1, 194],
      [2, 184], [9, 156]
    ];
    const present = new Set(base.map((b) => b[0]));
    const arr = [];
    for (let n = 1; n <= 45; n++) {
      if (present.has(n)) {
        const found = base.find((b) => b[0] === n);
        arr.push({ num: n, count: found[1] });
      } else {
        // give a mid-low default so weighted logic works
        arr.push({ num: n, count: 160 });
      }
    }
    return arr;
  })()
};

// Helpers
function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomSampleWithoutReplacement(min, max, k) {
  const pool = [];
  for (let i = min; i <= max; i++) pool.push(i);
  return shuffle(pool).slice(0, k).sort((a, b) => a - b);
}

function countConsecutivePairs(numbers) {
  const sorted = numbers.slice().sort((a, b) => a - b);
  let pairs = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) pairs += 1;
  }
  return pairs;
}

function colorClassByNumber(n) {
  if (n >= 1 && n <= 10) return "blue";
  if (n >= 11 && n <= 20) return "green";
  if (n >= 21 && n <= 30) return "orange";
  if (n >= 31 && n <= 40) return "red";
  return "purple";
}

const COLOR_TO_RANGE = {
  blue: [1, 10],
  green: [11, 20],
  orange: [21, 30],
  red: [31, 40],
  purple: [41, 45]
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: SAMPLE_DATA, isSample: true };
    const parsed = JSON.parse(raw);
    // ensure total_stats covers 1..45
    const nums = new Set(parsed?.total_stats?.map((x) => x.num));
    if (!nums || nums.size < 45) return { data: SAMPLE_DATA, isSample: true };
    return { data: parsed, isSample: false };
  } catch {
    return { data: SAMPLE_DATA, isSample: true };
  }
}

function saveData(json) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
  updateLastUpdated();
}

function updateLastUpdated() {
  const el = document.getElementById("lastUpdated");
  if (!el) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    el.textContent = "마지막 업데이트: - (샘플 데이터)";
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const ts = parsed.__updatedAt || null;
    el.textContent = ts
      ? `마지막 업데이트: ${new Date(ts).toISOString().slice(0, 10)}`
      : "마지막 업데이트: -";
  } catch {
    el.textContent = "마지막 업데이트: -";
  }
}

// Weighted sampling without replacement using cumulative weights
function weightedSampleWithoutReplacement(totalStats, k, excludeSet) {
  const picked = new Set();
  const result = [];
  const exclude = excludeSet || new Set();
  for (let take = 0; take < k; take++) {
    let totalWeight = 0;
    for (const item of totalStats) {
      if (!picked.has(item.num) && !exclude.has(item.num)) {
        totalWeight += Math.max(0, item.count);
      }
    }
    if (totalWeight <= 0) break;
    const r = Math.random() * totalWeight;
    let acc = 0;
    let chosen = null;
    for (const item of totalStats) {
      if (picked.has(item.num) || exclude.has(item.num)) continue;
      const w = Math.max(0, item.count);
      acc += w;
      if (r <= acc) {
        chosen = item.num;
        break;
      }
    }
    if (chosen == null) break;
    picked.add(chosen);
    result.push(chosen);
  }
  return result.sort((a, b) => a - b);
}

function bottom10FromTotal(totalStats) {
  const sorted = totalStats.slice().sort((a, b) => a.count - b.count);
  return new Set(sorted.slice(0, 10).map((x) => x.num));
}

// Generators for five conditions (main numbers), bonus handled separately
const MAX_ATTEMPTS = 200;

function gen_pureRandom() {
  return randomSampleWithoutReplacement(1, 45, 6);
}

function gen_weightedRandom(totalStats) {
  return weightedSampleWithoutReplacement(totalStats, 6);
}

function gen_consecutiveRandom() {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const nums = gen_pureRandom();
    const pairs = countConsecutivePairs(nums);
    if (pairs >= 1 && pairs <= 2) return nums;
  }
  // fallback: force adjust last two numbers to be consecutive
  const fallback = gen_pureRandom();
  fallback[5] = Math.min(45, fallback[4] + 1);
  return Array.from(new Set(fallback)).slice(0, 6).sort((a, b) => a - b);
}

function gen_weightedWithConsecutive(totalStats) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const nums = gen_weightedRandom(totalStats);
    const pairs = countConsecutivePairs(nums);
    if (pairs >= 1 && pairs <= 2) return nums;
    // try minor adjustment: pick a high-weight neighbor
    const set = new Set(nums);
    const candidates = totalStats
      .slice()
      .sort((a, b) => b.count - a.count)
      .map((x) => x.num);
    for (const n of nums) {
      for (const d of [-1, 1]) {
        const m = n + d;
        if (m < 1 || m > 45) continue;
        if (set.has(m)) continue;
        // replace the smallest number not helping consecutive
        const replaced = nums.slice();
        replaced[0] = m;
        replaced.sort((a, b) => a - b);
        const p2 = countConsecutivePairs(replaced);
        if (p2 >= 1 && p2 <= 2) return replaced;
      }
    }
  }
  return gen_weightedRandom(totalStats);
}

function gen_weightedExcludeBottom10(totalStats) {
  const excluded = bottom10FromTotal(totalStats);
  return weightedSampleWithoutReplacement(totalStats, 6, excluded);
}

function getSelectedColors() {
  const balls = Array.from(document.querySelectorAll('#colorChips .ball.selectable'));
  const picked = balls.filter(b => b.classList.contains('selected')).map(b => b.getAttribute('data-color'));
  return picked;
}

function gen_colorPreference() {
  const colors = getSelectedColors();
  if (colors.length === 0) {
    alert("색을 하나 이상 선택해 주세요.");
    return null;
  }
  // Build per-color pools
  const pools = {};
  for (const c of colors) {
    const r = COLOR_TO_RANGE[c];
    if (!r) continue;
    const arr = [];
    for (let i = r[0]; i <= r[1]; i++) arr.push(i);
    pools[c] = arr;
  }
  const selectedSet = new Set();
  const result = [];
  // 1) One from each selected color
  for (const c of colors) {
    const candidates = pools[c].filter((n) => !selectedSet.has(n));
    if (candidates.length === 0) continue;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    selectedSet.add(pick);
    result.push(pick);
  }
  // 2) Fill remaining using random colors among selected
  let guard = 0;
  while (result.length < 6 && guard < 200) {
    guard++;
    const c = colors[Math.floor(Math.random() * colors.length)];
    const candidates = pools[c].filter((n) => !selectedSet.has(n));
    if (candidates.length === 0) {
      // if none in this color, try any color
      const any = colors.flatMap((cc) => pools[cc].filter((n) => !selectedSet.has(n)));
      if (any.length === 0) break;
      const pickAny = any[Math.floor(Math.random() * any.length)];
      selectedSet.add(pickAny);
      result.push(pickAny);
      continue;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    selectedSet.add(pick);
    result.push(pick);
  }
  if (result.length < 6) {
    alert("선택한 색에서 6개를 만들 수 없습니다. 색을 더 선택해 주세요.");
    return null;
  }
  return result.sort((a, b) => a - b);
}

// Create bonus number using same rule, excluding main
// 보너스 번호 생성 함수 삭제됨 - 더 이상 사용하지 않음

function renderBallsWithBonus(main, bonus) {
  const mains = main
    .map((n) => `<span class="ball ${colorClassByNumber(n)}">${n}</span>`)
    .join("\n");
  const plusAndBonus = `<span class="inline-flex items-center gap-2 shrink-0"><span class="text-slate-400">+</span><span class="ball bonus">${bonus}</span></span>`;
  return `${mains}${plusAndBonus}`;
}

function renderBallsOnly(main) {
  return main
    .map((n) => `<span class="ball ${colorClassByNumber(n)}">${n}</span>`)
    .join("\n");
}

function renderCard({ id, title, combo, combos, showBonus = true }) {
  const titleHtml = title ? `<div class="card-head"><div class="card-title">${title}</div></div>` : "";
  
  // combos 배열이 있으면 여러 조합을 표시, 없으면 기존 단일 조합 표시
  let contentHtml = "";
  if (combos && combos.length > 0) {
    // 여러 조합을 세로로 나열
    contentHtml = combos.map((c, idx) => {
      const ballsHtml = showBonus ? renderBallsWithBonus(c.main, c.bonus) : renderBallsOnly(c.main);
      return `<div class="flex items-center justify-between gap-2 mb-2 last:mb-0">
        <div class="flex gap-1 items-center flex-wrap">${ballsHtml}</div>
        <div class="card-actions">
          <button class="btn" data-action="copy" data-combo-index="${idx}">복사</button>
        </div>
      </div>`;
    }).join("\n");
  } else {
    // 기존 단일 조합 표시 (기본 자동 생성용)
    const ballsHtml = showBonus ? renderBallsWithBonus(combo.main, combo.bonus) : renderBallsOnly(combo.main);
    contentHtml = `<div class="flex items-center justify-between gap-2">
      <div class="flex gap-1 items-center flex-wrap">${ballsHtml}</div>
      <div class="card-actions">
        <button class="btn" data-action="copy">복사</button>
      </div>
    </div>`;
  }
  
  return `
  <div class="card" data-card-id="${id}">
    ${titleHtml}
    ${contentHtml}
  </div>`;
}

function copyNumbers(combo) {
  if (combo.bonus != null) {
    const text = `${combo.main.join(", ")} + ${combo.bonus}`;
    navigator.clipboard?.writeText(text);
  } else {
    const text = combo.main.join(", ");
    navigator.clipboard?.writeText(text);
  }
}

function saveFavorite(combo) {
  const key = "luckystat_favorites";
  const existing = JSON.parse(localStorage.getItem(key) || "[]");
  existing.push({ combo, savedAt: Date.now() });
  localStorage.setItem(key, JSON.stringify(existing));
}

function getCheckedConditions() {
  const checks = Array.from(document.querySelectorAll(".condition-checkbox"));
  return checks.filter((c) => c.checked).map((c) => c.value);
}

function getConditionCounts() {
  const inputs = Array.from(document.querySelectorAll(".cond-count"));
  const map = {};
  for (const el of inputs) {
    const key = el.getAttribute("data-cond");
    const v = Math.max(1, Math.min(10, Number(el.value || 1)));
    map[key] = v;
  }
  return map;
}

function generateCustom() {
  const { data } = loadData();
  const totalStats = data.total_stats;
  const selected = getCheckedConditions();
  const order = [
    ["pureRandom", "무자비"],
    ["weightedRandom", "통계에 의한"],
    ["consecutiveRandom", "연속 2자리수 1~2쌍"],
    ["weightedWithConsecutive", "통계 + 연속 2자리수"],
    ["weightedExcludeBottom10", "통계 하위 10개 제외"],
    ["colorPreference", "좋아하는 색"]
  ].filter(([k]) => selected.includes(k));

  const makers = {
    pureRandom: () => gen_pureRandom(),
    weightedRandom: () => gen_weightedRandom(totalStats),
    consecutiveRandom: () => gen_consecutiveRandom(),
    weightedWithConsecutive: () => gen_weightedWithConsecutive(totalStats),
    weightedExcludeBottom10: () => gen_weightedExcludeBottom10(totalStats),
    colorPreference: () => gen_colorPreference()
  };

  const cards = [];
  const counts = getConditionCounts();
  for (const [key, label] of order) {
    const loop = counts[key] || 1;
    const combos = [];
    for (let i = 1; i <= loop; i++) {
      const main = makers[key]();
      // 사용자 지정 생성에서도 보너스 번호 생성하지 않음
      combos.push({ main, bonus: null });
    }
    // 각 조건당 하나의 카드만 생성하고, 그 안에 모든 조합을 포함
    cards.push({ id: key, title: `${label}`, combos, showBonus: false });
  }
  const grid = document.getElementById("resultsGrid");
  grid.innerHTML = cards.map((c) => renderCard(c)).join("\n");
  lastCustomCards = cards;
}

function handleCardAction(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const card = e.target.closest(".card");
  if (!card) return;
  const id = card.getAttribute("data-card-id");
  const titleEl = card.querySelector(".card-title");
  const title = titleEl ? titleEl.textContent : "";
  
  // 여러 조합이 있는 경우: 클릭한 버튼과 같은 줄의 번호들을 찾기
  const comboIndex = btn.getAttribute("data-combo-index");
  if (comboIndex !== null) {
    // 여러 조합이 있는 카드: 해당 조합의 부모 div에서 번호 찾기
    const comboRow = btn.closest("div.flex.items-center");
    if (!comboRow) return;
    const balls = Array.from(comboRow.querySelectorAll(".ball"));
    if (balls.length < 6) return;
    const main = balls.slice(0, 6).map((el) => Number(el.textContent));
    const bonus = balls.length >= 7 ? Number(balls[balls.length - 1].textContent) : null;
    const combo = { main, bonus };
    const action = btn.getAttribute("data-action");
    if (action === "copy") copyNumbers(combo);
    return;
  }
  
  // 단일 조합인 경우: 기존 로직
  const balls = Array.from(card.querySelectorAll(".ball"));
  if (balls.length < 6) return; // 메인 6개 최소 필요
  const main = balls.slice(0, 6).map((el) => Number(el.textContent));
  // 보너스 번호가 있으면 (7개 이상) 가져오고, 없으면 null
  const bonus = balls.length >= 7 ? Number(balls[balls.length - 1].textContent) : null;
  const combo = { main, bonus };
  const action = btn.getAttribute("data-action");
  if (action === "copy") copyNumbers(combo);
  // 저장/재생성 버튼 제거됨
}

// Auto corner: weekly refresh (Sunday 07:00)
function getNextSunday7(now = new Date()) {
  const d = new Date(now);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const daysUntilSunday = (7 - day) % 7;
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilSunday, 7, 0, 0, 0);
  if (next <= d) {
    next.setDate(next.getDate() + 7);
  }
  return next;
}

function formatYMDH(dt) {
  const y = String(dt.getFullYear()).slice(-2);
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function generateAuto10() {
  const { data } = loadData();
  const totalStats = data.total_stats;
  const order = [
    ["pureRandom", "무자비"],
    ["weightedRandom", "통계에 의한"],
    ["consecutiveRandom", "연속 2자리수 1~2쌍"],
    ["weightedWithConsecutive", "통계 + 연속 2자리수"],
    ["weightedExcludeBottom10", "통계 하위 10개 제외"]
  ];
  const makers = {
    pureRandom: () => gen_pureRandom(),
    weightedRandom: () => gen_weightedRandom(totalStats),
    consecutiveRandom: () => gen_consecutiveRandom(),
    weightedWithConsecutive: () => gen_weightedWithConsecutive(totalStats),
    weightedExcludeBottom10: () => gen_weightedExcludeBottom10(totalStats)
  };
  const cards = [];
  for (const [key, label] of order) {
    for (let i = 1; i <= 2; i++) {
      const main = makers[key]();
      // 기본 자동 생성에서는 보너스 번호 생성하지 않음
      const combo = { main, bonus: null };
      cards.push({ id: `${key}-${i}`, title: "", combo });
    }
  }
  return cards;
}

function loadAutoAndMaybeRefresh() {
  const raw = localStorage.getItem(AUTO_KEY);
  let state = null;
  if (raw) {
    try { state = JSON.parse(raw); } catch {}
  }
  const now = new Date();
  let next = state?.nextRefresh ? new Date(state.nextRefresh) : null;
  if (!state || !next || now >= next) {
    const cards = generateAuto10();
    next = getNextSunday7(now);
    state = { cards, generatedAt: now.toISOString(), nextRefresh: next.toISOString() };
    localStorage.setItem(AUTO_KEY, JSON.stringify(state));
  }
  renderAuto(state);
  scheduleAutoTimer(state);
}

function renderAuto(state) {
  // 제목 정리: '랜덤' 제거 + 끝의 '#숫자' 제거
  const sanitized = state.cards.map((c) => ({
    ...c,
    // 자동 섹션은 제목을 아예 숨김
    title: "",
    // 보너스 번호 표시 안 함
    showBonus: false
  }));
  const grid = document.getElementById("autoGrid");
  grid.innerHTML = sanitized.map((c) => renderCard(c)).join("\n");
  const info = document.getElementById("autoNextRefresh");
  info.textContent = `갱신: ${formatYMDH(new Date(state.nextRefresh))}`;
}

function scheduleAutoTimer(state) {
  const now = Date.now();
  const due = new Date(state.nextRefresh).getTime();
  const ms = Math.max(0, due - now);
  if (window.__autoTimer) clearTimeout(window.__autoTimer);
  window.__autoTimer = setTimeout(() => {
    const cards = generateAuto10();
    const next = getNextSunday7(new Date());
    const newState = { cards, generatedAt: new Date().toISOString(), nextRefresh: next.toISOString() };
    localStorage.setItem(AUTO_KEY, JSON.stringify(newState));
    renderAuto(newState);
    scheduleAutoTimer(newState);
  }, ms);
}

// Data modal handling and parsing
function openModal() {
  document.getElementById("dataModal").classList.remove("hidden");
  document.getElementById("dataModal").classList.add("flex");
  preloadDataToInputs();
}
function closeModal() {
  document.getElementById("dataModal").classList.add("hidden");
  document.getElementById("dataModal").classList.remove("flex");
}

function preloadDataToInputs() {
  const { data, isSample } = loadData();
  const weekly = data.weekly_ranges
    .map((r) => `${r.range}\t${r.percent}\t${r.count}`)
    .join("\n");
  const missed = [
    `1-10: ${(data.missed_numbers["1-10"] || []).join(",")}`,
    `11-20: ${(data.missed_numbers["11-20"] || []).join(",")}`,
    `21-30: ${(data.missed_numbers["21-30"] || []).join(",")}`,
    `31-40: ${(data.missed_numbers["31-40"] || []).join(",")}`,
    `41-45: ${(data.missed_numbers["41-45"] || []).join(",")}`
  ].join("\n");
  const total = ["num,count"].concat(
    data.total_stats.map((x) => `${x.num},${x.count}`)
  ).join("\n");
  document.getElementById("weeklyRangesInput").value = weekly;
  document.getElementById("missedNumbersInput").value = missed;
  document.getElementById("totalStatsInput").value = total;
  document.getElementById("parseStatus").textContent = isSample ? "샘플 데이터 로드됨" : "저장된 데이터 로드됨";
}

function parseWeeklyRanges(text) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const row of rows) {
    const parts = row.split(/\s*[,\t]\s*/);
    if (parts.length < 3) throw new Error("weekly_ranges 행 형식 오류");
    const [range, percent, count] = parts;
    if (!/^\d+-\d+$/.test(range)) throw new Error("구간 형식 오류");
    out.push({ range, percent: Number(percent), count: Number(count) });
  }
  return out;
}

function parseMissedNumbers(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = { "1-10": [], "11-20": [], "21-30": [], "31-40": [], "41-45": [] };
  for (const line of lines) {
    const m = line.match(/^(\d+-\d+)\s*:\s*(.*)$/);
    if (!m) throw new Error("missed_numbers 행 형식 오류");
    const key = m[1];
    const nums = m[2]
      .split(/\s*,\s*/)
      .filter(Boolean)
      .map((x) => Number(x));
    if (!out.hasOwnProperty(key)) throw new Error("알 수 없는 구간: " + key);
    out[key] = nums;
  }
  return out;
}

function parseTotalStats(csv) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!/^num\s*,\s*count$/i.test(lines[0])) throw new Error("total_stats 헤더 필요: num,count");
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const [numStr, countStr] = lines[i].split(/\s*,\s*/);
    const num = Number(numStr), count = Number(countStr);
    if (!(num >= 1 && num <= 45)) throw new Error("번호 범위 오류: " + num);
    if (!Number.isFinite(count) || count < 0) throw new Error("count 형식 오류: " + countStr);
    items.push({ num, count });
  }
  const set = new Set(items.map((x) => x.num));
  if (set.size !== 45) throw new Error("total_stats는 1~45 전체 포함해야 합니다");
  return items.sort((a, b) => a.num - b.num);
}

function validateAll(json) {
  // Minimal validation per spec
  if (!Array.isArray(json.total_stats) || json.total_stats.length < 45) {
    throw new Error("total_stats가 불완전합니다");
  }
  for (const n of json.total_stats) {
    if (!(n.num >= 1 && n.num <= 45)) throw new Error("번호 범위 오류");
  }
}

function exportData() {
  const raw = localStorage.getItem(STORAGE_KEY) || JSON.stringify(SAMPLE_DATA, null, 2);
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "luckystat_data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// import 기능 제거됨

// Wire up events
window.addEventListener("DOMContentLoaded", () => {
  updateLastUpdated();
  // 기본 자동 코너 로드/갱신
  loadAutoAndMaybeRefresh();

  // 사용자 지정 코너 이벤트
  document.getElementById("generateBtn").addEventListener("click", generateCustom);
  document.getElementById("clearBtn").addEventListener("click", () => {
    document.getElementById("resultsGrid").innerHTML = "";
  });
  document.getElementById("resultsGrid").addEventListener("click", handleCardAction);
  document.getElementById("autoGrid").addEventListener("click", handleCardAction);
  // Toggle color chips by clicking the circle
  document.getElementById("colorChips")?.addEventListener("click", (e) => {
    const ball = e.target.closest('.ball.selectable');
    if (!ball) return;
    ball.classList.toggle('selected');
  });
  // Header latest balls render
  const latestEl = document.getElementById("latestBalls");
  if (latestEl) {
    const combo = { main: [3, 15, 27, 33, 34, 36], bonus: 37 };
    latestEl.innerHTML = renderBallsWithBonus(combo.main, combo.bonus);
  }
  // Copy-all buttons
  const copyAllFromGrid = (gridId) => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.card'));
    const lines = [];
    for (const card of cards) {
      // 여러 조합이 있는 카드인지 확인 (각 조합이 별도 줄로 나뉨)
      const comboRows = Array.from(card.querySelectorAll('.flex.items-center.justify-between'));
      if (comboRows.length > 0) {
        // 여러 조합이 있는 경우: 각 조합마다 별도 줄로 복사
        for (const row of comboRows) {
          const balls = Array.from(row.querySelectorAll('.ball'));
          if (balls.length < 6) continue;
          const main = balls.slice(0, 6).map(el => Number(el.textContent));
          if (balls.length >= 7) {
            const bonus = Number(balls[balls.length - 1].textContent);
            lines.push(`${main.join(', ')} + ${bonus}`);
          } else {
            lines.push(main.join(', '));
          }
        }
      } else {
        // 단일 조합인 경우: 기존 로직
        const balls = Array.from(card.querySelectorAll('.ball'));
        if (balls.length < 6) continue;
        const main = balls.slice(0, 6).map(el => Number(el.textContent));
        if (balls.length >= 7) {
          const bonus = Number(balls[balls.length - 1].textContent);
          lines.push(`${main.join(', ')} + ${bonus}`);
        } else {
          lines.push(main.join(', '));
        }
      }
    }
    if (lines.length === 0) return;
    navigator.clipboard?.writeText(lines.join('\n'));
  };
  document.getElementById('copyAllAutoBtn')?.addEventListener('click', () => copyAllFromGrid('autoGrid'));
  document.getElementById('copyAllCustomBtn')?.addEventListener('click', () => copyAllFromGrid('resultsGrid'));
  document.getElementById("openDataBtn").addEventListener("click", openModal);
  document.getElementById("closeDataBtn").addEventListener("click", closeModal);
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("exportCustomBtn").addEventListener("click", () => {
    exportCustomCSV();
  });
  document.getElementById("parseBtn").addEventListener("click", () => {
    const weeklyTxt = document.getElementById("weeklyRangesInput").value;
    const missedTxt = document.getElementById("missedNumbersInput").value;
    const totalTxt = document.getElementById("totalStatsInput").value;
    try {
      const weekly = parseWeeklyRanges(weeklyTxt);
      const missed = parseMissedNumbers(missedTxt);
      const total = parseTotalStats(totalTxt);
      document.getElementById("parseStatus").textContent = `OK: weekly ${weekly.length}행, total 45개`;
    } catch (e) {
      document.getElementById("parseStatus").textContent = `오류: ${e.message}`;
    }
  });
  document.getElementById("saveBtn").addEventListener("click", () => {
    const weeklyTxt = document.getElementById("weeklyRangesInput").value;
    const missedTxt = document.getElementById("missedNumbersInput").value;
    const totalTxt = document.getElementById("totalStatsInput").value;
    try {
      const weekly = parseWeeklyRanges(weeklyTxt);
      const missed = parseMissedNumbers(missedTxt);
      const total = parseTotalStats(totalTxt);
      const json = { weekly_ranges: weekly, missed_numbers: missed, total_stats: total, __updatedAt: Date.now() };
      validateAll(json);
      saveData(json);
      document.getElementById("parseStatus").textContent = "저장 완료";
      updateLastUpdated();
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
  });
});

function exportCustomCSV() {
  if (!Array.isArray(lastCustomCards) || lastCustomCards.length === 0) {
    alert("먼저 사용자 지정 번호를 생성하세요.");
    return;
  }
  const header = [
    "condition",
    "index",
    "n1","n2","n3","n4","n5","n6"
  ];
  const rows = [header.join(",")];
  for (const c of lastCustomCards) {
    // 여러 조합이 있는 카드인지 확인
    if (c.combos && c.combos.length > 0) {
      // 각 조합마다 별도 행으로 추가
      for (let idx = 0; idx < c.combos.length; idx++) {
        const m = c.combos[idx].main;
        const row = [c.id, idx + 1, m[0], m[1], m[2], m[3], m[4], m[5]];
        rows.push(row.join(","));
      }
    } else {
      // 단일 조합인 경우 (기존 구조)
      const [cond, idxStr] = c.id.split("-");
      const idx = idxStr || "";
      const m = c.combo.main;
      const row = [cond, idx, m[0], m[1], m[2], m[3], m[4], m[5]];
      rows.push(row.join(","));
    }
  }
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "custom_numbers.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}



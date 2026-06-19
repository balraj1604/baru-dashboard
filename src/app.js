// Baru OS — personal command center. Modules: Overview, Repositories, To-dos,
// Email, Finance. Repo data is baked in (window.__REPOS__); to-dos persist in
// localStorage. No framework; DOM built with the safe h() helper (no innerHTML).

const DATA_URL = "repos.json";

const LANG_COLOR = {
  HTML: "#e34c26", CSS: "#563d7c", JavaScript: "#f1e05a", TypeScript: "#3178c6",
  Python: "#3572A5", Shell: "#89e051", Vue: "#41b883", Svelte: "#ff3e00",
  Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", Java: "#b07219",
  "C++": "#f34b7d", C: "#555555", PHP: "#4F5D95", Dart: "#00B4AB",
  Jupyter: "#DA5B0B", Makefile: "#427819", Dockerfile: "#384d54",
};
const langColor = (l) => LANG_COLOR[l] || "#9aa0aa";

// Ventures: the spine of the OS. Each maps to a GitHub owner where one exists.
const VENTURES = [
  { id: "personal", name: "Personal", owner: "balraj1604", color: "#b9603c" },
  { id: "exceed", name: "Exceed Real Estate", owner: "Exceed-Realestate", color: "#c6a24a" },
  { id: "ayuva", name: "AYUVA", owner: "AYUVAUAE", color: "#6f9e6f" },
  { id: "peanut", name: "Peanut eSIM", owner: "peanut-e-sim", color: "#c97b4a" },
  { id: "goody", name: "Goody", owner: "Goody-JP", color: "#7a9ec9" },
  { id: "kemuri", name: "KEMURI", owner: "Kemuri-JP", color: "#8a6fb0" },
  { id: "sung", name: "SUNG1975", owner: "SUNG-1975", color: "#c96f9e" },
  { id: "tqhb", name: "TQHB", owner: "TQHB", color: "#5fa8a0" },
  { id: "kiki", name: "Kiki", owner: "kiki-bot-WA", color: "#b0895f" },
  { id: "bungo", name: "Bungo Matcha", owner: "Bungo-matcha", color: "#5a8a5a" },
  { id: "lombok", name: "Lombok Villa", color: "#5f97a8" },
  { id: "other", name: "Other", color: "#8b94a3" },
];
const ventureById = (id) => VENTURES.find((v) => v.id === id) || VENTURES[VENTURES.length - 1];
const ventureByOwner = (owner) => VENTURES.find((v) => v.owner === owner) || ventureById("other");

const state = {
  data: null, view: "overview",
  q: "", owner: "all", vis: "all", sort: "pushed", liveOnly: false,
  todoFilter: "all",
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// --- safe DOM builder -------------------------------------------------------
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props)
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v);
    }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const ICON_SVG = {
  lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6V4.5a4 4 0 0 1 8 0V6h.5A1.5 1.5 0 0 1 14 7.5v6A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.5 6H4Zm1.5 0h5V4.5a2.5 2.5 0 0 0-5 0V6Z"/></svg>',
  globe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.2"/><path d="M2 8h12M8 1.8c2 2 2 10.4 0 12.4M8 1.8c-2 2-2 10.4 0 12.4"/></svg>',
  arrow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 11 11 5M6 5h5v5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  live: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2"/><path d="M4.3 4.3a5.2 5.2 0 0 0 0 7.4M11.7 4.3a5.2 5.2 0 0 1 0 7.4" stroke-linecap="round"/></svg>',
  code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3.5 8.5 6.5 11.5 12.5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mail: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2.5 4l5.5 4 5.5-4"/></svg>',
  coin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2v12M5 5h4.5a2 2 0 0 1 0 4H5m0 0h5"/></svg>',
};
const _iconCache = {};
function icon(name) {
  if (!_iconCache[name]) _iconCache[name] = new DOMParser().parseFromString(ICON_SVG[name], "image/svg+xml").documentElement;
  return _iconCache[name].cloneNode(true);
}

// --- shared helpers ---------------------------------------------------------
function humanize(name) {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUae\b/g, "UAE").replace(/\bHk\b/g, "HK").replace(/\bIrr\b/g, "IRR")
    .replace(/\bAi\b/g, "AI").replace(/\bMcp\b/g, "MCP").replace(/\bLp\b/g, "LP")
    .replace(/\bQa\b/g, "Q&A").replace(/\bV(\d)/g, "v$1");
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  for (const [l, sec] of [["yr", 31536000], ["mo", 2592000], ["w", 604800], ["d", 86400], ["h", 3600], ["m", 60]]) {
    const v = Math.floor(s / sec); if (v >= 1) return `${v}${l} ago`;
  }
  return "just now";
}
function hashStr(str) { let n = 2166136261; for (let i = 0; i < str.length; i++) { n ^= str.charCodeAt(i); n = Math.imul(n, 16777619); } return n >>> 0; }
function coverStyle(repo) {
  const x = hashStr(repo.full_name || repo.name), a = x % 360, b = (a + 35 + (x % 40)) % 360, lc = langColor(repo.language);
  return "background:" +
    `radial-gradient(130% 150% at 16% 12%, oklch(85% 0.055 ${a}) 0%, transparent 62%),` +
    `radial-gradient(120% 140% at 90% 96%, oklch(80% 0.06 ${b}) 0%, transparent 64%),` +
    `linear-gradient(135deg, ${lc}1c, oklch(88% 0.025 ${a}))`;
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;

// ============================================================ REPOSITORIES ===
function filteredRepos() {
  const q = state.q.toLowerCase();
  return state.data.repos.filter((r) => {
    if (state.liveOnly && !r.liveUrl) return false;
    if (state.owner !== "all" && r.owner !== state.owner) return false;
    if (state.vis === "public" && r.private) return false;
    if (state.vis === "private" && !r.private) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q) || (r.language || "").toLowerCase().includes(q);
  });
}
function sortRepos(list) {
  const s = [...list];
  if (state.sort === "name") s.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === "stars") s.sort((a, b) => b.stars - a.stars || new Date(b.pushedAt) - new Date(a.pushedAt));
  else s.sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));
  return s;
}
function repoCard(r) {
  const desc = r.description || humanize(r.name);
  const target = r.liveUrl || r.url, hasLive = !!r.liveUrl;
  const vis = r.private
    ? h("span", { class: "vis private", title: "Private repository" }, icon("lock"), "private")
    : h("span", { class: "vis public", title: "Public repository" }, icon("globe"), "public");
  const cover = h("div", { class: "cover", style: coverStyle(r) }, vis,
    hasLive ? h("span", { class: "livepill", title: "Opens a live site" }, icon("live"), "live") : null,
    h("span", { class: "sheen" }), h("span", { class: "glyph" }, (r.name[0] || "?").toUpperCase()));
  const meta = [];
  if (r.language) meta.push(h("span", { class: "lang" }, h("span", { class: "ld", style: `background:${langColor(r.language)}` }), r.language));
  if (r.stars > 0) { meta.push(h("span", { class: "sep" }, "·")); meta.push(h("span", null, "★ " + r.stars)); }
  meta.push(h("span", { class: "sep" }, "·"));
  meta.push(h("span", { class: "pushed" }, timeAgo(r.pushedAt)));
  if (r.archived) meta.push(h("span", { class: "archived-flag" }, "archived"));
  if (hasLive) meta.push(h("a", { class: "codelink", href: r.url, target: "_blank", rel: "noopener", title: "View code on GitHub", onclick: (e) => e.stopPropagation() }, icon("code"), "code"));
  const body = h("div", { class: "body" },
    h("div", { class: "name" }, r.name, " ", h("span", { class: "arrow" }, icon("arrow"))),
    h("p", { class: "desc" + (r.description ? "" : " derived") }, desc),
    h("div", { class: "meta" }, ...meta));
  const card = h("article", { class: "card reveal" + (hasLive ? " is-live" : ""), tabindex: "0", role: "link", "aria-label": `${r.name} — open ${hasLive ? "live site" : "on GitHub"}` },
    cover, body, h("a", { class: "hit", href: target, target: "_blank", rel: "noopener", tabindex: "-1", "aria-hidden": "true" }));
  const open = () => window.open(target, "_blank", "noopener");
  card.addEventListener("click", (e) => { if (!e.target.closest(".codelink")) open(); });
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  attachTilt(card);
  return card;
}
function renderRepos() {
  const mount = $("#sections");
  mount.replaceChildren();
  const list = sortRepos(filteredRepos());
  if (!list.length) { mount.append(h("div", { class: "empty" }, h("h3", null, "Nothing matches."), h("div", null, "Try clearing the search or filters."))); return; }
  const order = state.data.owners.map((o) => o.login);
  const groups = new Map();
  for (const r of list) { if (!groups.has(r.owner)) groups.set(r.owner, []); groups.get(r.owner).push(r); }
  for (const owner of [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
    const repos = groups.get(owner), m = state.data.owners.find((o) => o.login === owner) || {};
    const head = h("div", { class: "section-head" },
      m.avatar ? h("img", { src: m.avatar, alt: "", loading: "lazy" }) : h("span", { class: "ph" }),
      h("h2", null, owner + (m.isUser ? " · personal" : "")),
      h("span", { class: "count" }, `${repos.length} repo${repos.length > 1 ? "s" : ""}`),
      h("span", { class: "rule" }));
    mount.append(h("section", { class: "section" }, head, h("div", { class: "grid" }, repos.map(repoCard))));
  }
  observeReveals();
}
function attachTilt(card) {
  if (reduceMotion || coarse) return;
  let raf = null;
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    if (raf) return;
    raf = requestAnimationFrame(() => { card.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-4px)`; raf = null; });
  });
  card.addEventListener("pointerleave", () => { card.style.transform = ""; });
}
function observeReveals() {
  const cards = $$(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) { cards.forEach((c) => c.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) { if (!e.isIntersecting) continue; const c = e.target; const i = Math.min([...c.parentNode.children].indexOf(c), 8); c.style.animationDelay = `${i * 45}ms`; c.classList.add("in"); io.unobserve(c); }
  }, { root: $(".os-main"), rootMargin: "200px 0px 200px 0px" });
  cards.forEach((c) => io.observe(c));
  setTimeout(() => $$(".reveal:not(.in)").forEach((c) => c.classList.add("in")), 1400);
}
function countUp(node, target) {
  if (reduceMotion) { node.textContent = target; return; }
  const dur = 900, start = performance.now();
  (function step(now) { const t = Math.min(1, (now - start) / dur); node.textContent = Math.round((1 - Math.pow(1 - t, 3)) * target); if (t < 1) requestAnimationFrame(step); })(performance.now());
}
function stat(n, label, cls) { return h("div", { class: "stat" + (cls ? " " + cls : "") }, h("div", { class: "num", "data-n": n }, "0"), h("div", { class: "lbl" }, label)); }
function renderRepoHeader() {
  const d = state.data, stats = $("#stats");
  stats.replaceChildren(stat(d.totals.repos, "repositories"), stat(d.totals.owners, "organizations"),
    stat(d.totals.private, "private", "is-private"), stat(d.totals.public, "public"));
  stats.querySelectorAll(".num").forEach((n) => countUp(n, +n.dataset.n));
  $("#liveCount").textContent = d.repos.filter((r) => r.liveUrl).length;
}
function renderChips() {
  const box = $("#chips");
  const make = (owner, label, count, isAll) => {
    const c = h("button", { class: "chip", "data-owner": owner, "aria-pressed": String(state.owner === owner) });
    if (isAll) c.append(h("span", { class: "dot" }, "∗")); else c.append(h("img", { src: count.avatar, alt: "", loading: "lazy" }));
    c.append(" " + label + " ", h("span", { class: "ct" }, isAll ? count : count.count));
    c.addEventListener("click", () => { state.owner = owner; renderChips(); renderRepos(); });
    return c;
  };
  box.replaceChildren(make("all", "all", state.data.totals.repos, true), ...state.data.owners.map((o) => make(o.login, o.login, o)));
}

// ================================================================= TO-DOS ====
const TODO_KEY = "baru.todos.v1";
const loadTodos = () => { try { return JSON.parse(localStorage.getItem(TODO_KEY)) || []; } catch { return []; } };
const saveTodos = (t) => localStorage.setItem(TODO_KEY, JSON.stringify(t));
let todos = loadTodos();
function addTodo(text, venture) { todos = [{ id: hashStr(text + Date.now()) + "" + todos.length, text, venture, done: false, ts: Date.now() }, ...todos]; saveTodos(todos); }
function toggleTodo(id) { todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)); saveTodos(todos); }
function delTodo(id) { todos = todos.filter((t) => t.id !== id); saveTodos(todos); }
const openTodoCount = () => todos.filter((t) => !t.done).length;

function todoRow(t) {
  const box = h("span", { class: "box", role: "checkbox", "aria-checked": String(t.done), title: "Toggle done" }, icon("check"));
  const row = h("div", { class: "todo" + (t.done ? " done" : "") }, box,
    h("span", { class: "txt" }, t.text),
    h("button", { class: "del", title: "Delete", "aria-label": "Delete to-do" }, "✕"));
  box.addEventListener("click", () => { toggleTodo(t.id); renderTodos(); updateNavCounts(); });
  row.querySelector(".del").addEventListener("click", () => { delTodo(t.id); renderTodos(); updateNavCounts(); });
  return row;
}
function renderTodos() {
  const mount = $("#view-todos");
  // compose form
  const input = h("input", { id: "todoText", type: "text", placeholder: "Add a to-do…", "aria-label": "New to-do" });
  const select = h("select", { id: "todoVenture", "aria-label": "Venture" },
    ...VENTURES.filter((v) => v.id !== "other").map((v) => h("option", { value: v.id }, v.name)), h("option", { value: "other" }, "Other"));
  const form = h("form", { class: "todo-compose" }, input, select, h("button", { class: "todo-add", type: "submit" }, "Add"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    addTodo(text, select.value); input.value = ""; renderTodos(); updateNavCounts(); $("#todoText")?.focus();
  });

  // filter chips
  const present = [...new Set(todos.map((t) => t.venture))];
  const filterChips = h("div", { class: "todo-filters" },
    filterChip("all", "All", todos.length),
    ...VENTURES.filter((v) => present.includes(v.id)).map((v) => filterChip(v.id, v.name, todos.filter((t) => t.venture === v.id).length, v.color)));

  const sections = [h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "To-dos")), form, filterChips];

  const shown = todos.filter((t) => state.todoFilter === "all" || t.venture === state.todoFilter);
  if (!shown.length) {
    sections.push(h("div", { class: "empty" }, h("h3", null, todos.length ? "Nothing here." : "No to-dos yet."), h("div", null, todos.length ? "Switch filter or add one above." : "Add your first above — tag it to a venture.")));
  } else {
    // group by venture, open first
    const byV = new Map();
    for (const t of shown) { if (!byV.has(t.venture)) byV.set(t.venture, []); byV.get(t.venture).push(t); }
    const orderIds = VENTURES.map((v) => v.id);
    for (const vid of [...byV.keys()].sort((a, b) => orderIds.indexOf(a) - orderIds.indexOf(b))) {
      const v = ventureById(vid), items = byV.get(vid).sort((a, b) => a.done - b.done || b.ts - a.ts);
      const grp = h("div", { class: "todo-group" },
        h("div", { class: "todo-group-head" }, h("span", { class: "dot", style: `background:${v.color}` }),
          h("h3", null, v.name), h("span", { class: "gc" }, `${items.filter((t) => !t.done).length} open · ${items.length}`), h("span", { class: "rule" })),
        ...items.map(todoRow));
      sections.push(grp);
    }
  }
  mount.replaceChildren(...sections);
}
function filterChip(id, label, count, color) {
  const c = h("button", { class: "chip", "aria-pressed": String(state.todoFilter === id) },
    color ? h("span", { class: "swatch", style: `background:${color}` }) : h("span", { class: "dot" }, "∗"),
    " " + label + " ", h("span", { class: "ct" }, count));
  c.addEventListener("click", () => { state.todoFilter = id; renderTodos(); });
  return c;
}

// =============================================================== OVERVIEW ====
function renderOverview() {
  const mount = $("#view-overview"), d = state.data;
  const head = h("div", { class: "view-head" }, h("h1", { class: "view-title" }, greeting()));
  const kpis = h("div", { class: "ov-kpis" },
    stat(d.totals.repos, "repositories"), stat(openTodoCount(), "open to-dos"),
    stat(d.repos.filter((r) => r.liveUrl).length, "live sites"), stat(VENTURES.filter((v) => v.owner).length, "ventures"));

  // venture cards
  const cards = [];
  for (const v of VENTURES) {
    if (!v.owner && !todos.some((t) => t.venture === v.id)) continue;
    const repos = v.owner ? d.repos.filter((r) => r.owner === v.owner) : [];
    const vt = todos.filter((t) => t.venture === v.id);
    const open = vt.filter((t) => !t.done).length, doneR = vt.length ? (vt.length - open) / vt.length : 0;
    const card = h("div", { class: "venture-card", style: `--vc:${v.color}`, tabindex: "0", role: "button" },
      h("h3", null, v.name),
      h("div", { class: "vc-stats" }, h("span", null, h("b", null, repos.length), " repos"), h("span", null, h("b", null, open), " open todos")),
      vt.length ? h("div", { class: "vc-bar" }, h("span", { style: `width:${Math.round(doneR * 100)}%` })) : null);
    const goRepos = () => { state.owner = v.owner || "all"; renderChips(); renderRepos(); showView("repos"); };
    if (v.owner) { card.addEventListener("click", goRepos); card.addEventListener("keydown", (e) => { if (e.key === "Enter") goRepos(); }); }
    cards.push(card);
  }

  const openList = todos.filter((t) => !t.done).slice(0, 6);
  const todoPreview = openList.length
    ? h("div", null, ...openList.map((t) => {
        const v = ventureById(t.venture);
        return h("div", { class: "todo" }, h("span", { class: "box", style: `border-color:${v.color}` }),
          h("span", { class: "txt" }, t.text), h("span", { class: "gc", style: "font:11px var(--font-mono);color:var(--muted)" }, v.name));
      }))
    : h("div", { class: "empty" }, h("h3", null, "Inbox zero."), h("div", null, "No open to-dos."));

  mount.replaceChildren(head, kpis,
    h("div", { class: "ov-section-label" }, "Ventures"), h("div", { class: "ov-grid" }, ...cards),
    h("div", { class: "ov-section-label" }, "Open to-dos"), todoPreview);
  kpis.querySelectorAll(".num").forEach((n) => countUp(n, +n.dataset.n));
}
function greeting() {
  const hr = new Date().getHours();
  return (hr < 5 ? "Still up" : hr < 12 ? "Good morning" : hr < 18 ? "Afternoon" : "Evening") + ", Baru";
}

// ===================================================== EMAIL / FINANCE =======
function moduleEmpty(iconName, title, lines, note) {
  return h("div", { class: "module-empty" }, h("div", { class: "me-ic" }, icon(iconName)),
    h("h2", null, title), ...lines.map((l) => h("p", null, l)), note ? h("div", { class: "me-note" }, note) : null);
}
function renderEmail() {
  $("#view-email").replaceChildren(h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Email")),
    moduleEmpty("mail", "Email digest", [
      "A triage of your important emails — what each thread is about and the action it needs — pulled across your accounts.",
      "Not connected yet: choose which inboxes to include, then I bake an encrypted digest into the dashboard.",
    ], "waiting on source setup"));
}
function renderFinance() {
  $("#view-finance").replaceChildren(h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Finance")),
    moduleEmpty("coin", "Finance", [
      "Cash position, burn, and per-venture spend — your money view.",
      "Reserved for the finance section you'll build later.",
    ], "coming later"));
}

// ================================================================ ROUTER =====
const RENDER = { overview: renderOverview, repos: renderRepos, todos: renderTodos, email: renderEmail, finance: renderFinance };
function showView(name) {
  if (!RENDER[name]) name = "overview";
  state.view = name;
  $$(".nav-item").forEach((b) => b.setAttribute("aria-current", String(b.dataset.view === name)));
  $$(".view").forEach((v) => v.classList.toggle("view-active", v.id === "view-" + name));
  RENDER[name]();
  $(".os-main").scrollTo({ top: 0 });
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
}
function updateNavCounts() {
  if (state.data) $("#nav-repos").textContent = state.data.totals.repos;
  const open = openTodoCount();
  $("#nav-todos").textContent = open || "";
}

// =============================================================== BOOTSTRAP ===
async function loadData() {
  const btn = $("#sync"); btn?.classList.add("spinning");
  try {
    if (window.__REPOS__) state.data = window.__REPOS__;
    else { const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" }); if (!res.ok) throw new Error("HTTP " + res.status); state.data = await res.json(); }
    $("#syncAgo").textContent = `synced ${timeAgo(state.data.generatedAt)}`;
    renderRepoHeader(); renderChips();
    updateNavCounts();
    RENDER[state.view](); // re-render current view with fresh data
  } catch (e) {
    $("#view-overview").replaceChildren(h("div", { class: "empty" }, h("h3", null, "Couldn't load data"), h("div", null, String(e))));
  } finally { setTimeout(() => btn?.classList.remove("spinning"), 500); }
}
function wire() {
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#sync").addEventListener("click", loadData);
  $("#search").addEventListener("input", (e) => { state.q = e.target.value; renderRepos(); });
  const visSeg = $("#visSeg");
  visSeg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    state.vis = b.dataset.vis; visSeg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderRepos();
  }));
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderRepos(); });
  const lt = $("#liveToggle");
  lt.addEventListener("click", () => { state.liveOnly = !state.liveOnly; lt.setAttribute("aria-pressed", String(state.liveOnly)); renderRepos(); });
}

wire();
loadData().then(() => showView((location.hash || "#overview").slice(1)));

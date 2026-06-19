// Baru's Dashboard — renders repos.json into grouped, filterable repo cards.
// No framework, no build step. Data is produced by sync.mjs and committed as
// repos.json; this only reads it.
//
// Safety: the DOM is built exclusively with createElement + textContent via the
// h() helper below — no innerHTML / insertAdjacentHTML — so repo metadata can
// never be parsed as markup. Icons are static trusted SVG, parsed once.

const DATA_URL = "repos.json";

// Official-ish GitHub language colors (subset covering this account).
const LANG_COLOR = {
  HTML: "#e34c26", CSS: "#563d7c", JavaScript: "#f1e05a", TypeScript: "#3178c6",
  Python: "#3572A5", Shell: "#89e051", Vue: "#41b883", Svelte: "#ff3e00",
  Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", Java: "#b07219",
  "C++": "#f34b7d", C: "#555555", PHP: "#4F5D95", Dart: "#00B4AB",
  Jupyter: "#DA5B0B", Makefile: "#427819", Dockerfile: "#384d54",
};
const langColor = (l) => LANG_COLOR[l] || "#9aa0aa";

const state = { data: null, q: "", owner: "all", vis: "all", sort: "pushed", liveOnly: false };

const $ = (s, r = document) => r.querySelector(s);

// --- safe DOM builder -------------------------------------------------------
// h("div", {class:"x", onclick:fn}, child, "text", [more]) -> HTMLElement
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

// Static, trusted SVG icons — parsed once, cloned per use (no innerHTML).
const ICON_SVG = {
  lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6V4.5a4 4 0 0 1 8 0V6h.5A1.5 1.5 0 0 1 14 7.5v6A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.5 6H4Zm1.5 0h5V4.5a2.5 2.5 0 0 0-5 0V6Z"/></svg>',
  globe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6.2"/><path d="M2 8h12M8 1.8c2 2 2 10.4 0 12.4M8 1.8c-2 2-2 10.4 0 12.4"/></svg>',
  arrow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 11 11 5M6 5h5v5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  live: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2"/><path d="M4.3 4.3a5.2 5.2 0 0 0 0 7.4M11.7 4.3a5.2 5.2 0 0 1 0 7.4" stroke-linecap="round"/></svg>',
  code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const _iconCache = {};
function icon(name) {
  if (!_iconCache[name])
    _iconCache[name] = new DOMParser().parseFromString(ICON_SVG[name], "image/svg+xml").documentElement;
  return _iconCache[name].cloneNode(true);
}

// --- helpers ----------------------------------------------------------------

// "ayuva-calculator" -> "Ayuva Calculator" as a last-resort description.
function humanize(name) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUae\b/g, "UAE").replace(/\bHk\b/g, "HK")
    .replace(/\bIrr\b/g, "IRR").replace(/\bAi\b/g, "AI").replace(/\bMcp\b/g, "MCP")
    .replace(/\bLp\b/g, "LP").replace(/\bQa\b/g, "Q&A").replace(/\bV(\d)/g, "v$1");
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const u = [["yr", 31536000], ["mo", 2592000], ["w", 604800], ["d", 86400], ["h", 3600], ["m", 60]];
  for (const [label, secs] of u) { const v = Math.floor(s / secs); if (v >= 1) return `${v}${label} ago`; }
  return "just now";
}

function hashStr(str) {
  let n = 2166136261;
  for (let i = 0; i < str.length; i++) { n ^= str.charCodeAt(i); n = Math.imul(n, 16777619); }
  return n >>> 0;
}

// Soft, repo-specific cover tint — low chroma + warm bias so it reads as
// editorial risograph paper, not a saturated "AI" gradient. The language
// color appears only as a faint corner accent.
function coverStyle(repo) {
  const x = hashStr(repo.full_name || repo.name);
  const a = x % 360;
  const b = (a + 35 + (x % 40)) % 360;
  const lc = langColor(repo.language);
  return (
    "background:" +
    `radial-gradient(130% 150% at 16% 12%, oklch(85% 0.055 ${a}) 0%, transparent 62%),` +
    `radial-gradient(120% 140% at 90% 96%, oklch(80% 0.06 ${b}) 0%, transparent 64%),` +
    `linear-gradient(135deg, ${lc}1c, oklch(88% 0.025 ${a}))`
  );
}

// --- filtering / sorting ----------------------------------------------------

function filteredRepos() {
  const q = state.q.toLowerCase();
  return state.data.repos.filter((r) => {
    if (state.liveOnly && !r.liveUrl) return false;
    if (state.owner !== "all" && r.owner !== state.owner) return false;
    if (state.vis === "public" && r.private) return false;
    if (state.vis === "private" && !r.private) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.owner.toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q) ||
      (r.language || "").toLowerCase().includes(q)
    );
  });
}

function sortRepos(list) {
  const s = [...list];
  if (state.sort === "name") s.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === "stars") s.sort((a, b) => b.stars - a.stars || new Date(b.pushedAt) - new Date(a.pushedAt));
  else s.sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));
  return s;
}

// --- card -------------------------------------------------------------------

function repoCard(r) {
  const desc = r.description || humanize(r.name);
  // The card's primary destination is the live site when one exists, else the
  // GitHub repo. The small "code" link below always reaches the repo.
  const target = r.liveUrl || r.url;
  const hasLive = !!r.liveUrl;

  const vis = r.private
    ? h("span", { class: "vis private", title: "Private repository" }, icon("lock"), "private")
    : h("span", { class: "vis public", title: "Public repository" }, icon("globe"), "public");

  const cover = h("div", { class: "cover", style: coverStyle(r) },
    vis,
    hasLive ? h("span", { class: "livepill", title: "This card opens a live site" }, icon("live"), "live") : null,
    h("span", { class: "sheen" }),
    h("span", { class: "glyph" }, (r.name[0] || "?").toUpperCase()),
  );

  const meta = [];
  if (r.language)
    meta.push(h("span", { class: "lang" }, h("span", { class: "ld", style: `background:${langColor(r.language)}` }), r.language));
  if (r.stars > 0) { meta.push(h("span", { class: "sep" }, "·")); meta.push(h("span", null, "★ " + r.stars)); }
  meta.push(h("span", { class: "sep" }, "·"));
  meta.push(h("span", { class: "pushed" }, timeAgo(r.pushedAt)));
  if (r.archived) meta.push(h("span", { class: "archived-flag" }, "archived"));
  // When the card opens the live site, offer a secondary link to the code.
  if (hasLive)
    meta.push(h("a", {
      class: "codelink", href: r.url, target: "_blank", rel: "noopener", title: "View code on GitHub",
      onclick: (e) => e.stopPropagation(),
    }, icon("code"), "code"));

  const body = h("div", { class: "body" },
    h("div", { class: "name" }, r.name, " ", h("span", { class: "arrow" }, icon("arrow"))),
    h("p", { class: "desc" + (r.description ? "" : " derived") }, desc),
    h("div", { class: "meta" }, ...meta),
  );

  const card = h("article", {
    class: "card reveal" + (hasLive ? " is-live" : ""), tabindex: "0", role: "link",
    "aria-label": `${r.name} — open ${hasLive ? "live site" : "on GitHub"}`,
  }, cover, body, h("a", { class: "hit", href: target, target: "_blank", rel: "noopener", tabindex: "-1", "aria-hidden": "true" }));

  const open = () => window.open(target, "_blank", "noopener");
  card.addEventListener("click", (e) => { if (!e.target.closest(".codelink")) open(); });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });
  attachTilt(card);
  return card;
}

// --- render -----------------------------------------------------------------

function render() {
  const mount = $("#sections");
  mount.replaceChildren();
  const list = sortRepos(filteredRepos());

  if (!list.length) {
    mount.append(h("div", { class: "empty" },
      h("h3", null, "Nothing matches."),
      h("div", null, "Try clearing the search or filters.")));
    return;
  }

  const order = state.data.owners.map((o) => o.login);
  const groups = new Map();
  for (const r of list) { if (!groups.has(r.owner)) groups.set(r.owner, []); groups.get(r.owner).push(r); }
  const owners = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

  for (const owner of owners) {
    const repos = groups.get(owner);
    const m = state.data.owners.find((o) => o.login === owner) || {};
    const head = h("div", { class: "section-head" },
      m.avatar ? h("img", { src: m.avatar, alt: "", loading: "lazy" }) : h("span", { class: "ph" }),
      h("h2", null, owner + (m.isUser ? " · personal" : "")),
      h("span", { class: "count" }, `${repos.length} repo${repos.length > 1 ? "s" : ""}`),
      h("span", { class: "rule" }),
    );
    const grid = h("div", { class: "grid" }, repos.map(repoCard));
    mount.append(h("section", { class: "section" }, head, grid));
  }
  observeReveals();
}

// Cursor-following 3D tilt (off under reduced-motion / touch).
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;
function attachTilt(card) {
  if (reduceMotion || coarse) return;
  let raf = null;
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      card.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-4px)`;
      raf = null;
    });
  });
  card.addEventListener("pointerleave", () => { card.style.transform = ""; });
}

function observeReveals() {
  const cards = document.querySelectorAll(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) {
    cards.forEach((c) => c.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target;
      const i = Math.min(Array.prototype.indexOf.call(card.parentNode.children, card), 8);
      card.style.animationDelay = `${i * 45}ms`;
      card.classList.add("in");
      io.unobserve(card);
    }
  }, { rootMargin: "200px 0px 200px 0px" });
  cards.forEach((c) => io.observe(c));
  // Safety net: nothing should ever stay invisible (failed observer, full-page
  // capture, print). Force-reveal any stragglers shortly after paint.
  setTimeout(() => document.querySelectorAll(".reveal:not(.in)").forEach((c) => c.classList.add("in")), 1400);
}

// --- header / chips ---------------------------------------------------------

function countUp(node, target) {
  if (reduceMotion) { node.textContent = target; return; }
  const dur = 900, start = performance.now();
  (function step(now) {
    const t = Math.min(1, (now - start) / dur);
    node.textContent = Math.round((1 - Math.pow(1 - t, 3)) * target);
    if (t < 1) requestAnimationFrame(step);
  })(performance.now());
}

function stat(n, label, cls) {
  return h("div", { class: "stat" + (cls ? " " + cls : "") },
    h("div", { class: "num", "data-n": n }, "0"), h("div", { class: "lbl" }, label));
}

function renderHeader() {
  const d = state.data;
  $("#avatar").src = d.avatar;
  const stats = $("#stats");
  stats.replaceChildren(
    stat(d.totals.repos, "repositories"),
    stat(d.totals.owners, "organizations"),
    stat(d.totals.private, "private", "is-private"),
    stat(d.totals.public, "public"),
  );
  stats.querySelectorAll(".num").forEach((n) => countUp(n, +n.dataset.n));
  $("#syncAgo").textContent = `synced ${timeAgo(d.generatedAt)}`;
  $("#liveCount").textContent = d.repos.filter((r) => r.liveUrl).length;
}

function renderChips() {
  const box = $("#chips");
  const make = (owner, label, count, isAll) => {
    const c = h("button", { class: "chip", "data-owner": owner, "aria-pressed": String(state.owner === owner) });
    if (isAll) c.append(h("span", { class: "dot" }, "∗"));
    else c.append(h("img", { src: count.avatar, alt: "", loading: "lazy" }));
    c.append(" " + label + " ", h("span", { class: "ct" }, isAll ? count : count.count));
    c.addEventListener("click", () => { state.owner = owner; renderChips(); render(); });
    return c;
  };
  box.replaceChildren(
    make("all", "all", state.data.totals.repos, true),
    ...state.data.owners.map((o) => make(o.login, o.login, o)),
  );
}

// --- load / sync ------------------------------------------------------------

async function loadData() {
  const btn = $("#sync");
  btn?.classList.add("spinning");
  try {
    // Baked build (encrypted page): data is inlined as window.__REPOS__.
    // Local preview / unencrypted: fall back to fetching repos.json.
    if (window.__REPOS__) {
      state.data = window.__REPOS__;
    } else {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.data = await res.json();
    }
    renderHeader();
    renderChips();
    render();
  } catch (e) {
    $("#sections").replaceChildren(h("div", { class: "empty" },
      h("h3", null, "Couldn't load repos.json"), h("div", null, String(e))));
  } finally {
    setTimeout(() => btn?.classList.remove("spinning"), 500);
  }
}

function wire() {
  $("#search").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  const visSeg = $("#visSeg");
  visSeg.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      state.vis = b.dataset.vis;
      visSeg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    }));
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  const live = $("#liveToggle");
  live.addEventListener("click", () => {
    state.liveOnly = !state.liveOnly;
    live.setAttribute("aria-pressed", String(state.liveOnly));
    render();
  });
  $("#sync").addEventListener("click", loadData);
}

wire();
loadData();

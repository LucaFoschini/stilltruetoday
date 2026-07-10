"use strict";

const SVGNS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) n.append(kid);
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const monthVal = (s) => {
  if (!s) return 0;
  const [y, m] = s.split("-").map(Number);
  return y * 12 + (m || 1);
};
const fmtDate = (s) => {
  if (!s) return "";
  const [y, m] = s.split("-");
  const mo = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) || 0];
  return mo ? `${mo} ${y}` : y;
};

async function main() {
  const app = document.getElementById("app");
  let index;
  try {
    index = await (await fetch("data/index.json", {cache: "no-store"})).json();
  } catch (e) {
    app.innerHTML = "<p class='loading'>Could not load data index.</p>";
    return;
  }
  const id = new URLSearchParams(location.search).get("id");
  app.innerHTML = "";
  if (id) return renderDetail(app, index, id);
  return renderIndex(app, index);
}

const SEAL_LABELS = {
  "still-true": "STILL TRUE",
  "closing-in": "CLOSING IN",
  "caught-up": "CAUGHT UP",
  "re-testing": "RE-TESTING",
  "coming-soon": "COMING SOON",
};

// Verdict on the paper's claim, ON THE PAPER'S OWN BAR. Explicit verdict wins;
// otherwise computed from a named protocol vs. a threshold (auto, self-updating).
function computeClaimStatus(data) {
  const cs = data.paper.claim_status;
  if (!cs) return null;
  const asOf = cs.as_of || "";
  if (cs.verdict) return { verdict: cs.verdict, asOf, basis: cs.basis || "" };
  if (cs.auto) {
    const proto = (data.protocols || []).find((p) => p.id === cs.auto.protocol);
    const runs = proto ? proto.runs.filter((r) => typeof r.score === "number") : [];
    if (!runs.length) return { verdict: "re-testing", asOf, basis: cs.basis_pending || "Not yet re-run." };
    // Use only real capability reads for the verdict (exclude format-artifact runs).
    const usable = runs.filter((r) => !r.approximate);
    const best = (usable.length ? usable : runs).reduce((a, b) => (b.score > a.score ? b : a));
    const th = cs.auto.threshold, margin = cs.auto.close_margin || 0, bias = cs.auto.bias_buffer || 0;
    const bar = cs.bar_label || String(th);
    // "Caught up" only if it clears the bar even after removing our judge's known leniency.
    if (best.score - bias >= th)
      return { verdict: "caught-up", asOf, basis: `${best.model} reaches ${best.score.toFixed(1)}% Top-1, clears ${bar} even after adjusting for our judge's leniency.` };
    if (best.score >= th - margin) {
      const near = best.score >= th
        ? `${best.model} nominally reaches ${best.score.toFixed(1)}%, level with ${bar}, but that is within our judge's ~${bias}-pt leniency vs. the paper's grounding, so not a clear pass yet.`
        : `Best so far: ${best.model} at ${best.score.toFixed(1)}% Top-1, closing on ${bar}.`;
      return { verdict: "closing-in", asOf, basis: near };
    }
    return { verdict: "still-true", asOf, basis: `Best so far: ${best.model} at ${best.score.toFixed(1)}% Top-1, still under ${bar}.` };
  }
  return null;
}

function sealEl(cs) {
  if (!cs) return null;
  return el("span", { class: "seal " + cs.verdict, title: cs.basis || "" },
    el("span", { class: "seal-verdict" }, SEAL_LABELS[cs.verdict] || cs.verdict),
    cs.asOf ? el("span", { class: "seal-date" }, "as of " + fmtDate(cs.asOf)) : null);
}

function statusBadge(status) {
  const map = {
    live: ["live", "Live, re-run in progress"],
    seeded: ["seeded", "Seeded from published + community numbers"],
    curated: ["curated", "Curated, not yet re-run"],
  };
  const [cls, label] = map[status] || ["curated", status || "curated"];
  return el("span", { class: "badge " + cls, title: label }, cls);
}

async function renderIndex(app, index) {
  if (index.collection) {
    const cp = el("p", { class: "collection" });
    index.collection.split(/(?<=\.)\s+/).forEach((s) => cp.append(el("span", { class: "cl-s" }, s)));
    app.append(cp);
  }
  const list = el("div", { class: "paper-list" });
  app.append(list);
  for (const e of index.papers) {
    let cs = null;
    try {
      const data = await (await fetch("data/" + e.file, { cache: "no-store" })).json();
      cs = computeClaimStatus(data);
    } catch (_) { /* seal simply omitted if data unavailable */ }
    const card = el("a", { class: "paper-card", href: `paper.html?id=${encodeURIComponent(e.id)}` },
      el("div", { class: "card-top" }, sealEl(cs) || el("span", { class: "topic" }, ""), el("span", { class: "topic" }, e.topic || "")),
      el("h2", {}, e.short_title),
      el("p", { class: "card-meta" }, `${e.authors_short} · ${e.venue} ${e.year}`),
      el("p", { class: "card-claim" }, e.claim_short || ""),
      cs && cs.basis ? el("p", { class: "card-basis" }, cs.basis) : null);
    list.append(card);
  }
  if (index.submit_url) {
    const configured = !/REPLACE_WITH/.test(index.submit_url);
    app.append(el("div", { class: "submit-cta" },
      el("p", {}, index.submit_cta || "Nominate a paper for a re-run."),
      el("a", {
        class: "submit-btn", href: configured ? index.submit_url : "#",
        target: configured ? "_blank" : "_self", rel: "noopener",
      }, "Nominate a paper →"),
      configured ? null : el("span", { class: "cta-hint" }, "(set submit_url in data/index.json)")));
    if (index.submit_note) app.append(el("p", { class: "submit-note" }, index.submit_note));
  }
}

async function renderDetail(app, index, id) {
  const entry = index.papers.find((p) => p.id === id);
  if (!entry) { app.append(el("p", { class: "loading" }, "Unknown paper.")); return; }
  app.append(el("p", {}, el("a", { class: "back", href: "index.html" }, "← All papers")));
  try {
    const data = await (await fetch("data/" + entry.file, {cache: "no-store"})).json();
    app.append(renderPaper(data));
  } catch (e) {
    app.append(el("p", { class: "loading" }, `Could not load ${entry.file}`));
  }
}

function renderPaper(data) {
  const p = data.paper;
  const card = el("section", { class: "paper" });

  card.append(el("h2", {}, p.title));
  const meta = el("p", { class: "meta" });
  meta.append(`${p.authors_short} · ${p.venue} ${p.year}   `);
  if (p.url) meta.append(el("a", { href: p.url, target: "_blank", rel: "noopener" }, "Nature"));
  if (p.arxiv) meta.append(el("a", { href: `https://arxiv.org/abs/${p.arxiv}`, target: "_blank", rel: "noopener" }, "arXiv"));
  if (p.authors_repo) meta.append(el("a", { href: p.authors_repo, target: "_blank", rel: "noopener" }, "Authors' harness"));
  card.append(meta);

  const cs = computeClaimStatus(data);
  if (cs) card.append(el("div", { class: "seal-banner" },
    sealEl(cs), el("p", { class: "seal-basis" }, cs.basis || "")));

  if (p.claim) card.append(callout("claim", "What the paper found", p.claim));
  if (p.framing) card.append(callout("framing", "What this page is", p.framing));

  const protocols = data.protocols || [];
  if (!protocols.length) {
    card.append(callout("curatednote", "Status: curated, not yet re-run",
      p.status_note || "This paper is queued. No numbers are shown until we have a faithful, provenance-tagged protocol."));
  }

  // Then → Now summary from accuracy protocols
  const accProtos = protocols.filter((pr) => pr.metric === "accuracy");
  if (accProtos.length) card.append(summaryStrip(accProtos));

  // Charts, one per protocol
  for (const proto of protocols) {
    if (proto.metric === "accuracy") card.append(accuracyChart(proto));
    else if (proto.metric === "robustness") card.append(heatmap(proto));
  }

  if (p.readiness_caveat) card.append(callout("caveat", "Important: accuracy is not readiness", p.readiness_caveat));
  if (p.version_drift_note) card.append(callout("drift", "Even the paper's own baseline moved", p.version_drift_note));

  if (data.contributors && data.contributors.length) {
    const box = el("div", { class: "contributors" }, el("h3", {}, "Built on the work of"));
    for (const c of data.contributors) {
      box.append(el("div", { class: "contributor" },
        el("div", { class: "name" }, c.link ? el("a", { href: c.link, target: "_blank", rel: "noopener" }, c.name) : c.name),
        el("div", { class: "role" }, c.role)));
    }
    card.append(box);
  }
  return card;
}

function callout(kind, k, text) {
  return el("div", { class: "callout " + kind },
    el("span", { class: "k" }, k), el("p", {}, text));
}

function summaryStrip(accProtos) {
  const strip = el("div", { class: "summary" });
  for (const proto of accProtos) {
    const runs = [...proto.runs].sort((a, b) => monthVal(a.model_release_date) - monthVal(b.model_release_date));
    const pool = runs.filter((r) => !r.approximate && typeof r.score === "number");
    const usable = pool.length ? pool : runs;
    const u = proto.unit;
    const barNote = proto.reference_line ? ` <span class="bar-note">· bar ${proto.reference_line.value}${u}</span>` : "";
    const currents = usable.filter((r) => r.era === "current");
    let html;
    if (currents.length) {
      // StillTrueToday-style series: paper-era baseline → best CURRENT model
      const baseline = usable[0];
      const bestNow = currents.reduce((a, b) => (b.score > a.score ? b : a));
      const delta = bestNow.score - baseline.score;
      html = `<b>${baseline.model}</b> ${baseline.score.toFixed(1)}${u} &rarr; best now <b>${bestNow.model}</b> ${bestNow.score.toFixed(1)}${u} ` +
        `<span class="delta">${delta >= 0 ? "+" : ""}${delta.toFixed(1)}</span>${barNote}`;
    } else {
      // single-era snapshot (e.g. the paper's own numbers): best model vs the bar
      const best = usable.reduce((a, b) => (b.score > a.score ? b : a));
      html = `best: <b>${best.model}</b> ${best.score.toFixed(1)}${u}${proto.reference_line ? ` <span class="bar-note">vs ${proto.reference_line.value}${u} bar</span>` : ""}`;
    }
    strip.append(el("div", { class: "stat" },
      el("div", { class: "label" }, proto.label),
      el("div", { class: "then-now", html })));
  }
  return strip;
}

function accuracyChart(proto) {
  const box = el("div", { class: "protocol" });
  box.append(el("h3", {}, proto.label));
  box.append(el("span", { class: "by" }, "run by " + proto.contributor));
  if (proto.scoring_method) box.append(el("p", { class: "sub" }, proto.scoring_method));

  const runs = [...proto.runs].sort((a, b) => monthVal(a.model_release_date) - monthVal(b.model_release_date));
  const hasCurrent = runs.some((r) => r.era === "current");
  if (hasCurrent) {
    box.append(el("div", { class: "legend" },
      el("span", {}, swatch("var(--paper)"), "paper-era model"),
      el("span", {}, swatch("var(--current)"), "current model"),
      el("span", {}, swatch("transparent", true), "hatched = approximate")));
  }

  // layout
  const n = runs.length;
  const bw = 46, gap = 26, padL = 40, padR = 12, padT = 18, padB = 46;
  const plotH = 220;
  const W = padL + padR + n * bw + (n - 1) * gap;
  const H = plotH + padT + padB;
  const yMax = 100;
  const y = (v) => padT + plotH * (1 - v / yMax);

  const scroll = el("div", { class: "chartscroll" });
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  scroll.append(svg);

  // defs: hatch
  const defs = svgEl("defs");
  const pat = svgEl("pattern", { id: `h-${proto.id}`, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  pat.append(svgEl("rect", { width: 5, height: 5, fill: "var(--paper)" }));
  pat.append(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 5, stroke: "var(--panel)", "stroke-width": 2 }));
  defs.append(pat);
  svg.append(defs);

  // y gridlines
  const gY = svgEl("g", { class: "axis" });
  for (let v = 0; v <= yMax; v += 20) {
    gY.append(svgEl("line", { x1: padL, y1: y(v), x2: W - padR, y2: y(v) }));
    const t = svgEl("text", { x: padL - 6, y: y(v) + 3, "text-anchor": "end" }); t.textContent = v;
    gY.append(t);
  }
  svg.append(gY);

  // reference line (only if paper gave one)
  if (proto.reference_line) {
    const ry = y(proto.reference_line.value);
    svg.append(svgEl("line", { class: "refline", x1: padL, y1: ry, x2: W - padR, y2: ry }));
    const rt = svgEl("text", { class: "refline-label", x: W - padR, y: ry - 4, "text-anchor": "end" });
    rt.textContent = proto.reference_line.label; svg.append(rt);
  }

  // bars
  runs.forEach((r, i) => {
    const x = padL + i * (bw + gap);
    const barY = y(r.score), barH = plotH + padT - barY;
    const fill = r.approximate ? `url(#h-${proto.id})` : (r.era === "current" ? "var(--current)" : "var(--paper)");
    svg.append(svgEl("rect", { x, y: barY, width: bw, height: barH, rx: 3, fill }));
    const val = svgEl("text", { class: "bar-label", x: x + bw / 2, y: barY - 5, "text-anchor": "middle" });
    val.textContent = r.score.toFixed(1) + (r.approximate ? "*" : ""); svg.append(val);
    // model label (wrap into <=2 lines)
    const words = r.model.split(" ");
    const line1 = words.slice(0, Math.ceil(words.length / 2)).join(" ");
    const line2 = words.slice(Math.ceil(words.length / 2)).join(" ");
    const ml = svgEl("text", { class: "model-label", x: x + bw / 2, y: padT + plotH + 14, "text-anchor": "middle" });
    ml.append(tspan(line1, x + bw / 2, 0));
    if (line2) ml.append(tspan(line2, x + bw / 2, 11));
    svg.append(ml);
    const dl = svgEl("text", { class: "date-label", x: x + bw / 2, y: padT + plotH + (line2 ? 36 : 25), "text-anchor": "middle" });
    dl.textContent = fmtDate(r.model_release_date); svg.append(dl);
  });

  box.append(scroll);
  if (proto.provenance) box.append(el("p", { class: "prov" }, "Provenance: " + proto.provenance));
  return box;
}

function tspan(text, x, dy) {
  const t = svgEl("tspan", { x, dy }); t.textContent = text; return t;
}
function swatch(color, hatch) {
  const s = el("span", { class: "swatch" });
  s.style.background = hatch ? "repeating-linear-gradient(45deg,var(--paper),var(--paper) 2px,var(--panel) 2px,var(--panel) 4px)" : color;
  if (hatch) s.style.border = "1px solid var(--line)";
  return s;
}

// Robustness heatmap (models x stress dimensions). Redder = less robust.
function heatmap(proto) {
  const box = el("div", { class: "protocol" });
  box.append(el("h3", {}, proto.label));
  box.append(el("span", { class: "by" }, "run by " + proto.contributor));
  box.append(el("p", { class: "sub" }, proto.scoring_method + " · " + (proto.reference_line ? proto.reference_line.label : "")));

  const dims = proto.dimensions;
  const table = el("table", { class: "heat" });
  const head = el("tr", {}, el("th", { class: "row" }, "Model"));
  for (const d of dims) head.append(el("th", {}, d));
  table.append(head);

  const color = (v) => {
    // 0.6 -> deep red, 1.0 -> pale. matches the paper's palette direction.
    const t = Math.max(0, Math.min(1, (v - 0.6) / 0.4));
    const r = 178 + (255 - 178) * t;
    const g = 34 + (245 - 34) * t;
    const b = 34 + (240 - 34) * t;
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  };
  const runs = [...proto.runs].sort((a, b) => monthVal(a.model_release_date) - monthVal(b.model_release_date));
  for (const r of runs) {
    const tr = el("tr", {}, el("td", { class: "rowh" }, `${r.model}`));
    for (const d of dims) {
      const v = r.scores[d];
      const td = el("td", {}, v == null ? ", " : v.toFixed(2));
      if (v != null) td.style.background = color(v);
      tr.append(td);
    }
    table.append(tr);
  }
  box.append(table);
  if (proto.provenance) box.append(el("p", { class: "prov" }, "Provenance: " + proto.provenance));
  return box;
}

main();

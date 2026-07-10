# StillTrueToday

**Peer review is slow. Models are fast.** By the time a paper concludes "frontier models can't do X,"
the models it tested are often obsolete. StillTrueToday re-runs the benchmarks from those papers on
today's models — **on each paper's own axes, using its own methods** — and keeps the chart current as
new models ship.

It is **not** a verdict on any paper. Findings about fast-moving technology have a shelf life; this
just tracks the shelf life honestly, and celebrates that the technology moved.

## Core idea (the data model)

A score is not a property of `(model, benchmark)`. It's a property of
`(model, benchmark, protocol, who-ran-it, when)`. Numbers are only comparable *within a protocol*
(one benchmark + one dataset slice + one scoring method). This makes the apples-to-oranges error
impossible and makes attribution intrinsic — **no contributor's run is ever overwritten.** New model →
append a bar. New method → new series alongside the old one. See [`data/schema.md`](data/schema.md).

## First paper

[*The Illusion of Readiness*](https://www.nature.com/articles/s41591-026-04501-8) (Gu et al.,
Nature Medicine 2026). We stand on two open, MIT-licensed repos rather than rebuilding a harness:

- **Authors' own eval framework** — [`aiden-ygu/health-ai-readiness-eval`](https://github.com/aiden-ygu/health-ai-readiness-eval) (the paper authors open-sourced it — reproduction is faithful by construction).
- **Yishan Wong's reproduce-then-extend** — [`ywong137/health-ai-readiness-vqarad-addendum`](https://github.com/ywong137/health-ai-readiness-vqarad-addendum) (first independent re-run on public VQA-RAD; his results seed the site).

## Architecture

Three separable layers:

| Layer | What | Where |
|---|---|---|
| **Data** | provenance-tagged results as JSON | this repo (`data/`) — owned, portable, forkable |
| **Compute** | wrap each paper's harness, call models via OpenRouter | `harness/` + GitHub Actions (only runs on *new* models) |
| **Presentation** | static dashboard renders the JSON | GitHub Pages (this repo root) → later mirror to a Hugging Face Space for reach |

The site is dependency-free static HTML/JS — it renders `data/*.json` with no build step.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Status

v0: dashboard + data model live, seeded with the paper's published numbers and Yishan's run as
separate coexisting series. Next: wire `harness/` to run the authors' framework on the public sets
ourselves (full-set exact-match) and auto-append new models. See `harness/README.md`.

## Credit

Built on the work of the paper's authors (Gu et al.) and Yishan Wong. If you contributed a run and
want attribution changed, open an issue.

## License

Code: MIT. Data: CC-BY-4.0. Benchmark datasets retain their original licenses; JAMA/NEJM items are
copyrighted and are **not** redistributed here.

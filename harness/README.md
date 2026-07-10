# harness/ — wrap, don't rebuild

StillTrueToday does **not** write its own eval harness per paper. Wherever a paper open-sourced its
evaluation code, we wrap it. For *The Illusion of Readiness*, that's the authors' own MIT-licensed
framework, plus Yishan Wong's OpenRouter adapter for running arbitrary current models.

## Sources we wrap

- `aiden-ygu/health-ai-readiness-eval` (v1.0.0) — canonical harness.
  Entry point: `python src/test_runner.py <dataset> <model> <exp_id> <mode> <reasoning>`.
  Public datasets ship download scripts: VQA-RAD, OmniMedVQA, PMC-VQA, PathVQA, SLAKE, MMMU-CM,
  MIMIC-CXR-VQA. JAMA / NEJM / PX-60 are copyright-gated (index only) — **not reproducible publicly**.
- `ywong137/health-ai-readiness-vqarad-addendum` — VQA-RAD 100-item subset via OpenRouter,
  temp 0, semantic adjudication by `gpt-4o-2024-08-06`.

## The StillTrueToday layer (to build)

1. **Vendor the harness** as a git submodule under `harness/vendor/` (keep upstream intact + attributed).
2. **OpenRouter model adapter** — one function `run(model_id, dataset_slice) -> predictions`, so any
   OpenRouter model id drops in. Reuse Yishan's approach.
3. **Reproduce-then-extend runner**:
   - re-run the paper's original models → confirm we land near the published numbers (drift check),
   - then run current models → append runs to the protocol JSON in `data/papers/*.json`.
   - Every appended run carries `contributor`, `source_repo`, `run_date`, `model_release_date`.
4. **New-model detector** (the "continuous" part): diff OpenRouter's model list against models already
   present in the protocol; run only the new ones. This is what the scheduled Action calls.

## Cost control

Cache per `(model, benchmark, item)`. A model's score on a fixed slice is stable, so we never re-run
an existing model — the x-axis is *models over time*, not wall-clock. Budget scales with (new models ×
public items), not with time.

## Fidelity levels (both are valid; they are different protocols, not replacements)

- **A — adopt a contributor's run** (e.g. Yishan's 100-item/LLM-judge). Real today, zero compute.
- **B — full-set exact-match** via the authors' harness, reproducing published numbers first.

A and B live as **separate protocols** in the data — see `data/schema.md`. Upgrading fidelity adds a
series; it never erases one.

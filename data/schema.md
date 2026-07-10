# StillTrueToday data model

The core insight: **a score is not a property of `(model, benchmark)`. It is a property of
`(model, benchmark, protocol, who-ran-it, when)`.** Two numbers can only be compared if they
share a *protocol*. This makes the apples-to-oranges error structurally impossible and makes
attribution intrinsic — nobody's run is ever overwritten or erased.

## Entities

### `paper`
Identity + framing of the paper being tracked.
- `claim` — the paper's central "frontier models can't do X" claim, in the authors' terms.
- `framing` — the non-conflictual headline. We track progress on the paper's own axes; we do **not** issue a verdict on the paper.
- `readiness_caveat` — why a higher accuracy number does **not** mean "ready". Carried forward on every view.
- `version_drift_note` — where the paper's own numbers/models changed between versions (preprint vs published). On-theme, always surfaced.

### `contributors[]`
Everyone whose work a page stands on — paper authors, independent reproducers, us. Credited
site-wide **and** on every run they produced (`run.contributor`). Add, never remove.

### `protocols[]`
A protocol is **one benchmark + one dataset slice + one scoring method**. Scores are only
comparable *within* a protocol. Fields:
- `benchmark`, `dataset_slice`, `scoring_method`, `metric` (`accuracy` | `robustness` | …), `unit`, `higher_is_better`
- `contributor`, `source_repo`, `provenance` — provenance is mandatory and human-readable.
- `reference_line` — `{value, label}` **only if the paper itself provides one** (human/expert baseline or stated threshold). Otherwise `null`; we never invent a "good/bad" line.
- `runs[]` — one per model.

### `run`
One model measured under one protocol.
- Standard runs: `{model, score, model_release_date, run_date, approximate?, notes?}`
- Multi-dimensional runs (e.g. the stress-test heatmap) use `scores: {dimension: value}` plus a protocol-level `dimensions[]`.
- `model_release_date` orders the x-axis (models over time). `run_date` = when *we/the contributor* measured it. `approximate: true` renders the bar hatched and flagged.

## Rules
1. **Never overwrite a run.** New model → append a run to its protocol. New method → new protocol.
2. **Never mix protocols in one bar group.** The renderer plots one protocol per chart.
3. **Provenance or it doesn't ship.** Every protocol states who ran it, how, from what source.
4. **Reference lines come only from the paper.** No line is better than an invented line.
5. **Accuracy ≠ readiness.** The `readiness_caveat` travels with every accuracy view.

## Adding a paper
1. Wrap the paper's harness (ideally the authors' own open-sourced one) behind the run interface.
2. Reproduce the paper's original-model numbers first (drift check) → seed the anchor protocol.
3. Append current models. Add a `contributors[]` entry for whoever did the run.
4. Register the paper in `data/index.json`.

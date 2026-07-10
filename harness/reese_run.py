#!/usr/bin/env python3
"""
StillTrueToday — reproduce-then-extend runner for Reese et al. (rare-disease dx).

Data (CC-BY) from the paper's Zenodo record 15324355: ready-made prompts + gold
diagnoses + the authors' own model responses. We therefore skip prompt generation
and either (a) SCORE the authors' stored responses to validate our scoring against
their published numbers, or (b) RUN a live OpenRouter model on the same prompts.

Scoring: an LLM judge (default gpt-4o-2024-08-06) reads the model's ranked list and
returns the 1-based rank of the first diagnosis matching the gold disease (0 if
absent). This is a semantic-grounding stand-in for the paper's PhEval programmatic
grounding — comparable-but-not-identical, so results are kept as their own protocol.
Headline metric: Top-1 (rank==1), reported next to Exomiser's 35.5% Top-1.

Usage:
  # validate scoring against the authors' o1-preview responses (expect ~23.6% Top-1):
  python harness/reese_run.py --responses harness/.cache/reese/all_resp/all_models_responses/gpt-01-preview.jsonl --n 100 --label "o1-preview (authors' stored responses)"
  # run a live model on the same first-N cases:
  python harness/reese_run.py --model google/gemini-3.5-flash --n 50
"""
import argparse, json, os, re, sys
from pathlib import Path
from datetime import date
from dotenv import load_dotenv
from openai import OpenAI

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
BASE_JSONL = ROOT / ".cache/reese/all_resp/all_models_responses/gpt-4o.jsonl"  # source of id/prompt/gold

def load_cases(n):
    cases = []
    with open(BASE_JSONL) as f:
        for line in f:
            d = json.loads(line)
            cases.append({"id": d["id"], "prompt": d["prompt"], "gold": d["gold"]})
            if len(cases) >= n:
                break
    return cases

def load_responses(path):
    out = {}
    with open(path) as f:
        for line in f:
            d = json.loads(line)
            out[d["id"]] = d["response"]
    return out

def judge_rank(client, judge_model, gold, response_text):
    prompt = (
        "You are grading a ranked differential-diagnosis list against the known correct diagnosis.\n"
        f"Correct diagnosis: {gold['disease_name']} ({gold.get('disease_id','')}).\n\n"
        f"Model's ranked list:\n{response_text}\n\n"
        "At what 1-based rank does the FIRST entry that refers to the correct diagnosis appear? "
        "Count a match for the same disease including close synonyms or the same OMIM/Mondo entity "
        "(not merely the same organ system). Reply with ONLY the integer rank, or 0 if it is absent."
    )
    r = client.chat.completions.create(model=judge_model, temperature=0, max_tokens=4,
                                       messages=[{"role": "user", "content": prompt}])
    m = re.search(r"\d+", r.choices[0].message.content or "0")
    return int(m.group()) if m else 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", help="OpenRouter model id to run live")
    ap.add_argument("--responses", help="path to a stored responses .jsonl to score instead of running")
    ap.add_argument("--n", type=int, default=50)
    ap.add_argument("--judge", default="openai/gpt-4o-2024-08-06")
    ap.add_argument("--label", default=None)
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("Set OPENROUTER_API_KEY in harness/.env")
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)

    cases = load_cases(args.n)
    stored = load_responses(args.responses) if args.responses else None
    label = args.label or args.model or args.responses

    ranks, results = [], []
    for i, c in enumerate(cases):
        try:
            if stored is not None:
                resp = stored.get(c["id"], "")
            else:
                r = client.chat.completions.create(
                    model=args.model, temperature=0, max_tokens=1200,
                    messages=[{"role": "user", "content": c["prompt"]}])
                resp = r.choices[0].message.content or ""
            rank = judge_rank(client, args.judge, c["gold"], resp)
        except Exception as e:
            print(f"  item {i} ERROR: {e}", file=sys.stderr)
            continue
        ranks.append(rank)
        hit1 = rank == 1
        results.append({"id": c["id"], "gold": c["gold"]["disease_name"], "rank": rank})
        print(f"  [{i+1}/{len(cases)}] {c['gold']['disease_name'][:40]!r} rank={rank} "
              f"top1={sum(1 for x in ranks if x==1)}/{len(ranks)}", file=sys.stderr)

    n = len(ranks)
    top1 = 100.0 * sum(1 for x in ranks if x == 1) / n if n else 0
    top3 = 100.0 * sum(1 for x in ranks if 1 <= x <= 3) / n if n else 0
    top10 = 100.0 * sum(1 for x in ranks if 1 <= x <= 10) / n if n else 0

    outdir = ROOT / "outputs"; outdir.mkdir(exist_ok=True)
    stamp = re.sub(r"[^a-zA-Z0-9]+", "_", str(label))[:60]
    (outdir / f"reese_{stamp}.json").write_text(json.dumps(
        {"label": label, "n": n, "top1": top1, "top3": top3, "top10": top10, "results": results}, indent=2))

    print("\n=== RESULT ===")
    print(f"{label}: Top-1 {top1:.1f}%  Top-3 {top3:.1f}%  Top-10 {top10:.1f}%  (n={n})")
    if not stored:
        print(json.dumps({"model": args.model, "score": round(top1, 1),
                          "run_date": date.today().strftime("%Y-%m"), "n_items": n,
                          "contributor": "StillTrueToday", "source_repo": "this repo · harness/reese_run.py",
                          "top3": round(top3, 1), "top10": round(top10, 1)}, indent=2))

if __name__ == "__main__":
    main()

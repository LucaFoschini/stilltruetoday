#!/usr/bin/env python3
"""
StillTrueToday — minimal reproduce-then-extend runner for VQA-RAD.

Faithful to Gu et al.'s VQA-RAD protocol (their exact prompt, from
harness/vendor/health-ai-readiness-eval/src/prompts.py) and to Yishan Wong's
scoring choice (semantic LLM-judge), because VQA-RAD answers are free text.

- Data: VQA-RAD test split via the HuggingFace datasets-server rows API (no auth).
- Inference: any OpenRouter model id, temperature 0.
- Scoring: semantic adjudication by a judge model (default gpt-4o-2024-08-06).
- Output: per-item JSON in harness/outputs/ (gitignored) + a provenance-tagged
  `run` object printed for pasting into data/papers/*.json.

Usage:
  python harness/run.py --model openai/gpt-5.6 --n 30
  python harness/run.py --model anthropic/claude-3.5-sonnet --n 30   # paper-era drift check
"""
import argparse, base64, json, os, re, sys, time
from pathlib import Path
from datetime import date

import requests
from dotenv import load_dotenv
from openai import OpenAI

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

ROWS_API = "https://datasets-server.huggingface.co/rows"
DATASET = "flaviagiammarino/vqa-rad"

SYSTEM_VQARAD = ("You are a radiology expert. Please analyze the following medical image "
                 "and answer the question based on the image and your medical knowledge.")

def build_query(question, answer):
    # Mirrors build_query_vqarad(): CLOSED (yes/no) -> single word; else concise.
    closed = answer.strip().lower() in {"yes", "no"}
    q = "Question: " + question
    if closed:
        q += "\n Answer the question using a single word or phrase. Enclose your answer within <answer></answer> tags."
    else:
        q += "\n Answer the question concisely. Enclose your answer within <answer></answer> tags."
    return q

def fetch_rows(n):
    rows, offset = [], 0
    while len(rows) < n:
        length = min(100, n - len(rows))
        r = requests.get(ROWS_API, params={"dataset": DATASET, "config": "default",
                                            "split": "test", "offset": offset, "length": length}, timeout=60)
        r.raise_for_status()
        batch = r.json().get("rows", [])
        if not batch:
            break
        rows.extend(x["row"] for x in batch)
        offset += length
    return rows[:n]

def img_data_url(src):
    b = requests.get(src, timeout=60).content
    mime = "image/png" if b[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(b).decode()

def extract_answer(text):
    m = re.search(r"<answer>(.*?)</answer>", text or "", re.S | re.I)
    return (m.group(1) if m else (text or "")).strip()

def judge(client, judge_model, question, gold, pred):
    prompt = (f"You grade a medical visual-question-answering answer for semantic correctness.\n"
              f"Question: {question}\nReference (correct) answer: {gold}\nModel answer: {pred}\n\n"
              f"Does the model answer convey the same clinical meaning as the reference? "
              f"Reply with exactly one word: YES or NO.")
    r = client.chat.completions.create(model=judge_model, temperature=0, max_tokens=3,
                                       messages=[{"role": "user", "content": prompt}])
    return r.choices[0].message.content.strip().upper().startswith("Y")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, help="OpenRouter model id, e.g. openai/gpt-5.6")
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--judge", default="openai/gpt-4o-2024-08-06")
    ap.add_argument("--sleep", type=float, default=0.0)
    args = ap.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("Set OPENROUTER_API_KEY in harness/.env")
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)

    print(f"Loading {args.n} VQA-RAD test items…", file=sys.stderr)
    rows = fetch_rows(args.n)

    results, correct = [], 0
    for i, row in enumerate(rows):
        q, gold = row["question"], str(row["answer"])
        try:
            content = [{"type": "text", "text": build_query(q, gold)},
                       {"type": "image_url", "image_url": {"url": img_data_url(row["image"]["src"])}}]
            resp = client.chat.completions.create(
                model=args.model, temperature=0, max_tokens=4000,
                messages=[{"role": "system", "content": SYSTEM_VQARAD},
                          {"role": "user", "content": content}])
            raw = resp.choices[0].message.content or ""
            pred = extract_answer(raw)
            ok = judge(client, args.judge, q, gold, pred)
        except Exception as e:
            print(f"  item {i} ERROR: {e}", file=sys.stderr)
            results.append({"i": i, "question": q, "gold": gold, "error": str(e)})
            continue
        correct += int(ok)
        results.append({"i": i, "question": q, "gold": gold, "pred": pred, "correct": ok})
        print(f"  [{i+1}/{len(rows)}] gold={gold!r} pred={pred!r} -> {'✓' if ok else '✗'}  running={correct}/{len(results)}", file=sys.stderr)
        if args.sleep:
            time.sleep(args.sleep)

    scored = [r for r in results if "correct" in r]
    acc = 100.0 * correct / len(scored) if scored else 0.0

    outdir = ROOT / "outputs"; outdir.mkdir(exist_ok=True)
    stamp = args.model.replace("/", "_")
    (outdir / f"vqarad_{stamp}.json").write_text(json.dumps(
        {"model": args.model, "n_scored": len(scored), "accuracy": acc, "judge": args.judge, "results": results}, indent=2))

    run_obj = {"model": args.model, "score": round(acc, 1),
               "run_date": date.today().strftime("%Y-%m"),
               "n_items": len(scored), "contributor": "StillTrueToday",
               "source_repo": "this repo · harness/run.py",
               "judge": args.judge}
    print("\n=== RESULT ===")
    print(f"{args.model}: {acc:.1f}%  ({correct}/{len(scored)} judged correct)")
    print("Paste into the appropriate protocol's runs[]:")
    print(json.dumps(run_obj, indent=2))

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
query.py — Semantic search over the Mavis knowledge base.

Usage:
  python3 query.py "how do I deploy to k8s?"
  python3 query.py "kilo autonomy" --k 10 --type mavis-skill,plugin
  python3 query.py "github integration" --json
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastembed import TextEmbedding
from qdrant_client import QdrantClient


COLLECTION = "mavis_kb"


def main() -> int:
    ap = argparse.ArgumentParser(description="Query the Mavis knowledge base (Qdrant + BGE-small)")
    ap.add_argument("query", help="Natural-language query")
    ap.add_argument("--k", type=int, default=5, help="Top-k results (default 5)")
    ap.add_argument("--type", help="Filter by type (comma-separated, e.g. mavis-skill,plugin,tool)")
    ap.add_argument("--json", action="store_true", help="JSON output")
    ap.add_argument("--threshold", type=float, default=0.0, help="Min similarity score (default 0)")
    args = ap.parse_args()

    client = QdrantClient(host="127.0.0.1", port=6333, timeout=30, prefer_grpc=False)
    model = TextEmbedding("BAAI/bge-small-en-v1.5")

    t0 = time.time()
    vec = list(model.embed([args.query]))[0].tolist()
    embed_ms = (time.time() - t0) * 1000

    flt = None
    if args.type:
        types = [t.strip() for t in args.type.split(",")]
        flt = {"must": [{"key": "type", "match": {"any": types}}]}

    t0 = time.time()
    hits = client.query_points(
        collection_name=COLLECTION,
        query=vec,
        limit=args.k,
        with_payload=True,
        query_filter=flt,
    )
    search_ms = (time.time() - t0) * 1000

    results = []
    for h in hits.points:
        if h.score < args.threshold:
            continue
        results.append({
            "score": round(h.score, 3),
            "id": h.payload.get("_id"),
            "name": h.payload.get("name"),
            "type": h.payload.get("type"),
            "category": h.payload.get("category"),
            "version": h.payload.get("version"),
            "status": h.payload.get("status"),
        })

    if args.json:
        print(json.dumps({
            "query": args.query,
            "embed_ms": round(embed_ms, 1),
            "search_ms": round(search_ms, 1),
            "hits": results,
        }, indent=2))
    else:
        print(f"\nQuery: {args.query!r}")
        print(f"  embed {embed_ms:.0f}ms, search {search_ms:.0f}ms, {len(results)} hits")
        for r in results:
            line = f"  {r['score']:>5} | {r['type']:15s} | {r['name']}"
            if r.get("category"):
                line += f"  ({r['category']})"
            if r.get("version"):
                line += f"  v{r['version']}"
            if r.get("status"):
                line += f"  [{r['status']}]"
            print(line)
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())

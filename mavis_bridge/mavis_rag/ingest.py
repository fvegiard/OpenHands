#!/usr/bin/env python3
"""
ingest.py — Embed all 187 entries and upload to Qdrant.

Uses fastembed (local BGE-small) for 384-dim dense vectors. No API key needed.
Collection: `mavis_kb` on localhost:6333.

Idempotent: re-running wipes + re-ingests.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from fastembed import TextEmbedding

from corpus import ALL_ENTRIES


COLLECTION = "mavis_kb"
DIM = 384  # bge-small-en-v1.5


def main() -> int:
    client = QdrantClient(
        host="127.0.0.1",
        port=6333,
        timeout=60,
        prefer_grpc=False,  # force REST — gRPC needs extra deps
    )

    # Recreate collection (idempotent)
    if client.collection_exists(COLLECTION):
        print(f"deleting existing collection: {COLLECTION}")
        client.delete_collection(COLLECTION)
    print(f"creating collection: {COLLECTION} (dim={DIM}, cosine)")
    client.create_collection(
        collection_name=COLLECTION,
        vectors_config=VectorParams(size=DIM, distance=Distance.COSINE),
    )

    # Load embedder
    print("loading embedder: BAAI/bge-small-en-v1.5")
    t0 = time.time()
    model = TextEmbedding("BAAI/bge-small-en-v1.5")
    print(f"  loaded in {time.time()-t0:.1f}s")

    # Embed in batches
    texts = [e["text"] for e in ALL_ENTRIES]
    print(f"embedding {len(texts)} entries...")
    t0 = time.time()
    embeddings = list(model.embed(texts, batch_size=32, show_progress=True))
    print(f"  embedded in {time.time()-t0:.1f}s ({len(texts)/(time.time()-t0):.0f}/s)")

    # Upload in batches of 50, async (no wait) — faster, recovers from timeout
    print("uploading to Qdrant...")
    BATCH = 50
    import time as _t
    for i in range(0, len(ALL_ENTRIES), BATCH):
        points = [
            PointStruct(
                id=hash(e["id"]) & 0x7FFFFFFFFFFFFFFF,  # positive i64
                vector=emb.tolist(),
                payload={**e["payload"], "_id": e["id"]},
            )
            for e, emb in zip(ALL_ENTRIES[i : i + BATCH], embeddings[i : i + BATCH])
        ]
        for attempt in range(3):
            try:
                client.upsert(collection_name=COLLECTION, points=points, wait=False, timeout=30)
                break
            except Exception as e:
                print(f"  attempt {attempt+1} failed: {e}; retrying...")
                _t.sleep(2)
        else:
            print(f"  FAILED batch {i}")
            return 1
        print(f"  upserted {i+len(points)}/{len(ALL_ENTRIES)}")
        _t.sleep(0.2)

    # Wait for indexing
    print("waiting for indexing...")
    for _ in range(20):
        info = client.get_collection(COLLECTION)
        if info.vectors_count and info.vectors_count >= len(ALL_ENTRIES):
            break
        _t.sleep(0.5)
    info = client.get_collection(COLLECTION)
    print(f"  indexed: {info.vectors_count}/{len(ALL_ENTRIES)}")

    # Stats
    info = client.get_collection(COLLECTION)
    print(f"\ncollection ready: {info.vectors_count} vectors, {info.points_count} points")
    return 0


if __name__ == "__main__":
    sys.exit(main())

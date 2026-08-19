#!/usr/bin/env python3
"""
serve.py — tiny HTTP server exposing /search and /ask.

POST /search  {"query": "...", "k": 5, "type": "..."} → JSON hits
GET  /healthz → "ok"
GET  /stats   → collection info
"""

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, "/workspace/mavis-rag")
from fastembed import TextEmbedding
from qdrant_client import QdrantClient

COLLECTION = "mavis_kb"
client = QdrantClient(host="127.0.0.1", port=6333, timeout=30, prefer_grpc=False)
model = TextEmbedding("BAAI/bge-small-en-v1.5")


class H(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # quieter
        sys.stderr.write(f"[{time.strftime('%H:%M:%S')}] {self.address_string()} {fmt % args}\n")

    def do_GET(self):
        if self.path == "/healthz":
            self._send(200, {"ok": True})
        elif self.path == "/stats":
            info = client.get_collection(COLLECTION)
            self._send(200, {
                "name": COLLECTION,
                "points": info.points_count,
                "segments": info.segments_count,
                "status": info.status,
            })
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/search":
            self._send(404, {"error": "not found"})
            return
        n = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(n) or "{}")
        query = body.get("query", "").strip()
        if not query:
            self._send(400, {"error": "missing 'query'"})
            return
        k = int(body.get("k", 5))
        flt = None
        if body.get("type"):
            types = [t.strip() for t in body["type"].split(",")]
            flt = {"must": [{"key": "type", "match": {"any": types}}]}

        t0 = time.time()
        vec = list(model.embed([query]))[0].tolist()
        embed_ms = (time.time() - t0) * 1000
        t0 = time.time()
        hits = client.query_points(COLLECTION, query=vec, limit=k, with_payload=True, query_filter=flt)
        search_ms = (time.time() - t0) * 1000

        out = []
        for h in hits.points:
            out.append({
                "score": round(h.score, 3),
                "name": h.payload.get("name"),
                "type": h.payload.get("type"),
                "category": h.payload.get("category"),
                "version": h.payload.get("version"),
                "status": h.payload.get("status"),
            })
        self._send(200, {
            "query": query,
            "embed_ms": round(embed_ms, 1),
            "search_ms": round(search_ms, 1),
            "hits": out,
        })


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
    print(f"Mavis RAG HTTP server on :{port}")
    print(f"  POST /search  {{'query': '...', 'k': 5, 'type': 'optional'}}")
    print(f"  GET  /healthz")
    print(f"  GET  /stats")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()

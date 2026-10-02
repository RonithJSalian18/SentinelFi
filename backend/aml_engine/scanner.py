"""Loads the transaction ledger from PostgreSQL into the graph engine and hydrates the evidence."""
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
from . import ENGINE, find_cycles

LOAD_BATCH_SIZE = 50_000


@dataclass
class ScanOptions:
    max_hops: int = 4
    min_amount: float = 10_000
    window_days: int = 0
    chronological: bool = False
    max_results: int = 500


def _load_ledger(db: Session, min_amount: float) -> dict:
    """Stream qualifying transactions into flat NumPy columns (no ORM objects per row)."""
    ledger = models.TransactionLedger
    query = (
        select(ledger.id, ledger.sender_id, ledger.receiver_id, ledger.amount, ledger.transaction_date)
        .where(ledger.amount >= min_amount)
        .execution_options(stream_results=True, yield_per=LOAD_BATCH_SIZE)
    )

    chunks = []
    for rows in db.execute(query).partitions():
        chunks.append((
            np.fromiter((r[0] for r in rows), dtype=np.int64, count=len(rows)),
            np.fromiter((r[1] for r in rows), dtype=np.int64, count=len(rows)),
            np.fromiter((r[2] for r in rows), dtype=np.int64, count=len(rows)),
            np.fromiter((r[3] for r in rows), dtype=np.float64, count=len(rows)),
            np.fromiter((int(r[4].timestamp()) if r[4] else 0 for r in rows), dtype=np.int64, count=len(rows)),
        ))

    if not chunks:
        empty_i, empty_f = np.empty(0, np.int64), np.empty(0, np.float64)
        return {"ids": empty_i, "src": empty_i, "dst": empty_i, "amount": empty_f, "ts": empty_i}

    ids, src, dst, amount, ts = (np.concatenate(cols) for cols in zip(*chunks))
    return {"ids": ids, "src": src, "dst": dst, "amount": amount, "ts": ts}


def _rotate_to_earliest(cycle: list, ts: np.ndarray, ids: np.ndarray) -> list:
    first = min(range(len(cycle)), key=lambda i: (ts[cycle[i]], ids[cycle[i]]))
    return cycle[first:] + cycle[:first]


def scan_circular_trading(db: Session, opts: Optional[ScanOptions] = None) -> dict:
    opts = opts or ScanOptions()

    t0 = time.perf_counter()
    ledger = _load_ledger(db, opts.min_amount)
    num_edges = len(ledger["ids"])

    # Remap sparse entity ids to dense 0..n-1 node indices for the CSR graph
    entity_ids, inverse = np.unique(np.concatenate([ledger["src"], ledger["dst"]]), return_inverse=True)
    src_idx, dst_idx = inverse[:num_edges].astype(np.int64), inverse[num_edges:].astype(np.int64)
    load_ms = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    cycles, truncated = find_cycles(
        len(entity_ids), src_idx, dst_idx, ledger["ts"],
        max_length=opts.max_hops,
        chronological=opts.chronological,
        max_window=opts.window_days * 86_400,
        max_cycles=opts.max_results,
    )
    scan_ms = (time.perf_counter() - t1) * 1000

    stats = {
        "engine": ENGINE,
        "transactions_scanned": num_edges,
        "entities_in_graph": len(entity_ids),
        "cycles_found": len(cycles),
        "truncated": truncated,
        "load_ms": round(load_ms, 2),
        "scan_ms": round(scan_ms, 2),
    }

    if not cycles:
        return {"status": "clean", "message": "No circular trading detected across transaction ledgers.", "stats": stats}

    involved = {int(entity_ids[src_idx[e]]) for cycle in cycles for e in cycle}
    names = dict(db.execute(
        select(models.CorporateEntity.id, models.CorporateEntity.company_name)
        .where(models.CorporateEntity.id.in_(involved))
    ).all())

    evidence = []
    for cycle in cycles:
        if not opts.chronological:
            cycle = _rotate_to_earliest(cycle, ledger["ts"], ledger["ids"])
        transactions = [
            {
                "transaction_id": int(ledger["ids"][e]),
                "sender": names.get(int(ledger["src"][e]), f"Entity #{int(ledger['src'][e])}"),
                "receiver": names.get(int(ledger["dst"][e]), f"Entity #{int(ledger['dst'][e])}"),
                "amount": float(ledger["amount"][e]),
                "timestamp": int(ledger["ts"][e]),
            }
            for e in cycle
        ]
        initial, returned = transactions[0]["amount"], transactions[-1]["amount"]
        evidence.append({
            "path": [t["sender"] for t in transactions],
            "hops": len(transactions),
            "initial_amount": initial,
            "return_amount": returned,
            "retention_pct": round(returned / initial * 100, 2) if initial else 0.0,
            "total_volume": sum(t["amount"] for t in transactions),
            "transactions": transactions,
        })

    evidence.sort(key=lambda loop: loop["total_volume"], reverse=True)
    return {
        "status": "threat_detected",
        "alert": f"{len(evidence)} Circular Trading Loop{'s' if len(evidence) != 1 else ''} Identified",
        "evidence": evidence,
        "stats": stats,
    }

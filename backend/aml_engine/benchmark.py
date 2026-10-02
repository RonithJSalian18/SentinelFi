"""
Benchmark the native vs pure-Python cycle detectors on a synthetic ledger.

    python -m aml_engine.benchmark --entities 20000 --transactions 100000 --max-hops 4
"""
import argparse
import time

import numpy as np

from . import _graph_engine, python_engine


def synthetic_ledger(entities: int, transactions: int, planted_loops: int, seed: int):
    rng = np.random.default_rng(seed)
    src = rng.integers(0, entities, transactions, dtype=np.int64)
    dst = rng.integers(0, entities, transactions, dtype=np.int64)
    ts = rng.integers(1_700_000_000, 1_730_000_000, transactions, dtype=np.int64)

    # Plant explicit A -> B -> C -> A laundering loops on top of the random traffic
    loops = rng.choice(entities, size=(planted_loops, 3), replace=False)
    loop_src = loops.ravel()
    loop_dst = np.roll(loops, -1, axis=1).ravel()
    loop_ts = np.repeat(rng.integers(1_700_000_000, 1_730_000_000, planted_loops), 3) + np.tile([0, 3600, 7200], planted_loops)
    return (np.concatenate([src, loop_src]), np.concatenate([dst, loop_dst]), np.concatenate([ts, loop_ts]))


def timed(fn, *args, **kwargs):
    start = time.perf_counter()
    cycles, truncated = fn(*args, **kwargs)
    return time.perf_counter() - start, cycles, truncated


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--entities", type=int, default=20_000)
    parser.add_argument("--transactions", type=int, default=100_000)
    parser.add_argument("--planted-loops", type=int, default=50)
    parser.add_argument("--max-hops", type=int, default=4)
    parser.add_argument("--chronological", action="store_true")
    parser.add_argument("--max-cycles", type=int, default=10_000_000)
    parser.add_argument("--skip-python", action="store_true", help="only time the native engine")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    src, dst, ts = synthetic_ledger(args.entities, args.transactions, args.planted_loops, args.seed)
    opts = dict(max_length=args.max_hops, chronological=args.chronological, max_cycles=args.max_cycles)
    print(f"Ledger: {args.entities:,} entities, {len(src):,} transactions, loops of 2..{args.max_hops} hops")

    if _graph_engine is None:
        print("Native engine not built (run: python setup.py build_ext --inplace)")
        native_s = None
    else:
        native_s, native_cycles, _ = timed(_graph_engine.find_cycles, args.entities, src, dst, ts, **opts)
        print(f"  C++ engine:    {native_s * 1000:10.1f} ms  ({len(native_cycles):,} loops)")

    if not args.skip_python:
        py_s, py_cycles, _ = timed(python_engine.find_cycles, args.entities, src, dst, ts, **opts)
        print(f"  Python engine: {py_s * 1000:10.1f} ms  ({len(py_cycles):,} loops)")
        if native_s:
            print(f"  Speed-up:      {py_s / native_s:10.1f}x")
            assert native_cycles == py_cycles, "engines disagree!"
            print("  Results identical across engines.")


if __name__ == "__main__":
    main()

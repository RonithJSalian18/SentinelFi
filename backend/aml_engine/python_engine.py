"""
Pure-Python reference implementation of the native cycle detector (cpp/cycle_detector.hpp).

Used automatically when the C++ extension has not been compiled. Semantics must stay
identical to the C++ version (same loops, same order).
"""
import sys
from typing import List, Sequence, Tuple

_INT64_MIN = -(2 ** 63)
_INT64_MAX = 2 ** 63 - 1


def find_cycles(
    num_nodes: int,
    src: Sequence[int],
    dst: Sequence[int],
    ts: Sequence[int],
    max_length: int = 3,
    chronological: bool = False,
    max_window: int = 0,
    max_cycles: int = 1000,
    num_threads: int = 0,  # accepted for API parity with the native engine; unused
) -> Tuple[List[List[int]], bool]:
    if not (len(src) == len(dst) == len(ts)):
        raise ValueError("src, dst and ts must have the same length")
    if max_length < 2:
        raise ValueError("max_length must be >= 2")
    if max_cycles < 1:
        raise ValueError("max_cycles must be >= 1")

    src = [int(x) for x in src]
    dst = [int(x) for x in dst]
    ts = [int(x) for x in ts]
    for e, (s, d) in enumerate(zip(src, dst)):
        if not (0 <= s < num_nodes and 0 <= d < num_nodes):
            raise IndexError(f"node index out of range at edge {e}")

    # Adjacency lists in edge order (stable, like the C++ counting sort)
    adj: List[List[int]] = [[] for _ in range(num_nodes)]
    for e, s in enumerate(src):
        adj[s].append(e)
    if chronological:
        for edges in adj:
            edges.sort(key=lambda e: ts[e])

    cycles: List[List[int]] = []
    on_path = [False] * num_nodes
    path: List[int] = []
    truncated = False

    def is_canonical_rotation(cycle: List[int]) -> bool:
        # A loop with tied timestamps can be time-ordered from several starting hops;
        # report it only from the valid starting hop with the smallest edge id.
        n = len(cycle)
        for j in range(1, n):
            if cycle[j] > cycle[0]:
                continue
            if all(ts[cycle[(j + k) % n]] <= ts[cycle[(j + k + 1) % n]] for k in range(n - 1)):
                return False
        return True

    def record(closing_edge: int) -> None:
        nonlocal truncated
        cycle = path + [closing_edge]
        if chronological and not is_canonical_rotation(cycle):
            return
        cycles.append(cycle)
        if len(cycles) >= max_cycles:
            truncated = True

    def dfs(start: int, node: int, prev_time: int, min_time: int, max_time: int) -> None:
        depth = len(path)
        for e in adj[node]:
            if truncated:
                return
            t = ts[e]
            if chronological and t < prev_time:
                continue
            lo, hi = min(min_time, t), max(max_time, t)
            if max_window > 0 and hi - lo > max_window:
                if chronological:
                    break
                continue

            nxt = dst[e]
            if nxt == start:
                if depth + 1 >= 2:
                    record(e)
            elif not on_path[nxt] and depth + 1 < max_length and (chronological or nxt > start):
                path.append(e)
                on_path[nxt] = True
                dfs(start, nxt, t, lo, hi)
                on_path[nxt] = False
                path.pop()

    sys.setrecursionlimit(max(sys.getrecursionlimit(), max_length + 100))
    for start in range(num_nodes):
        if truncated:
            break
        on_path[start] = True
        dfs(start, start, _INT64_MIN, _INT64_MAX, _INT64_MIN)
        on_path[start] = False

    return cycles, truncated

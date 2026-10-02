"""
AML graph engine: known-answer tests for both engines, plus randomized parity between the
native C++ engine and the pure-Python reference implementation.
"""
import os

import numpy as np
import pytest

import aml_engine
from aml_engine import _graph_engine, python_engine

ENGINES = [pytest.param(python_engine, id="python")]
if _graph_engine is not None:
    ENGINES.append(pytest.param(_graph_engine, id="cpp"))

needs_native = pytest.mark.skipif(_graph_engine is None, reason="native engine not built")


def arrays(*cols):
    return [np.asarray(c, dtype=np.int64) for c in cols]


def test_native_engine_is_built_when_required():
    """CI sets REQUIRE_NATIVE_ENGINE=1 so a broken C++ build fails loudly instead of falling back."""
    if os.getenv("REQUIRE_NATIVE_ENGINE") == "1":
        assert _graph_engine is not None, "C++ extension failed to build or import"
        assert aml_engine.ENGINE == "cpp"


@pytest.mark.parametrize("engine", ENGINES)
class TestKnownGraphs:
    # 0->1->2->0 (triangle), 3<->4 (round trip), 5->6->7->8->5 (4-hop), 9->9 (self-loop), 0->9 (dead end)
    SRC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
    DST = [1, 2, 0, 4, 3, 6, 7, 8, 5, 9, 9]
    TS = [10, 20, 30, 5, 6, 1, 2, 3, 4, 0, 0]

    def run(self, engine, **kw):
        return engine.find_cycles(10, *arrays(self.SRC, self.DST, self.TS), **kw)

    def test_respects_max_length(self, engine):
        assert self.run(engine, max_length=3) == ([[0, 1, 2], [3, 4]], False)
        assert self.run(engine, max_length=4) == ([[0, 1, 2], [3, 4], [5, 6, 7, 8]], False)
        assert self.run(engine, max_length=2) == ([[3, 4]], False)

    def test_truncates_at_max_cycles(self, engine):
        assert self.run(engine, max_length=4, max_cycles=2) == ([[0, 1, 2], [3, 4]], True)

    def test_chronological_order(self, engine):
        src, dst = [0, 1, 2], [1, 2, 0]
        assert engine.find_cycles(3, *arrays(src, dst, [10, 5, 20]), chronological=True)[0] == []
        # only the rotation starting at edge 1 (t=5) is in time order
        assert engine.find_cycles(3, *arrays(src, dst, [20, 5, 10]), chronological=True)[0] == [[1, 2, 0]]

    def test_tied_timestamps_report_each_loop_once(self, engine):
        # Two parallel edges per hop -> 2^3 distinct loops, each reported exactly once
        cycles, _ = engine.find_cycles(3, *arrays([0, 1, 2, 0, 1, 2], [1, 2, 0, 1, 2, 0], [7] * 6), chronological=True)
        assert len(cycles) == 8
        assert len({tuple(sorted(c)) for c in cycles}) == 8

    def test_time_window(self, engine):
        args = arrays([0, 1, 2], [1, 2, 0], [0, 100, 200])
        assert engine.find_cycles(3, *args, max_window=150)[0] == []
        assert engine.find_cycles(3, *args, max_window=200)[0] == [[0, 1, 2]]

    def test_rejects_invalid_input(self, engine):
        with pytest.raises(IndexError):
            engine.find_cycles(2, *arrays([0], [5], [0]))
        with pytest.raises(ValueError):
            engine.find_cycles(2, *arrays([0, 1], [1, 0], [0, 0]), max_length=1)

    def test_empty_graph(self, engine):
        assert engine.find_cycles(0, *arrays([], [], [])) == ([], False)


def random_graph(rng, big):
    n = int(rng.integers(1100, 3000)) if big else int(rng.integers(2, 25))  # big graphs span several work chunks
    m = int(n * rng.uniform(1.0, 2.2)) if big else int(rng.integers(1, 70))
    ts_range = int(rng.choice([3, 50, 10**6]))  # small ranges force many timestamp ties
    return n, rng.integers(0, n, m), rng.integers(0, n, m), rng.integers(0, ts_range, m)


@needs_native
@pytest.mark.parametrize("seed", range(12))
def test_native_matches_python_reference(seed):
    rng = np.random.default_rng(seed)
    for trial in range(10):
        n, src, dst, ts = random_graph(rng, big=trial == 0)
        for max_length in (2, 3, 5):
            for chronological in (False, True):
                for max_window, max_cycles in ((0, 10**6), (20, 7)):
                    kw = dict(max_length=max_length, chronological=chronological,
                              max_window=max_window, max_cycles=max_cycles)
                    expected = python_engine.find_cycles(n, src, dst, ts, **kw)
                    for threads in (1, 4):
                        assert _graph_engine.find_cycles(n, src, dst, ts, num_threads=threads, **kw) == expected, kw


@needs_native
def test_native_engine_finds_planted_loops_at_scale():
    from aml_engine.benchmark import synthetic_ledger
    src, dst, ts = synthetic_ledger(entities=50_000, transactions=100_000, planted_loops=25, seed=3)
    cycles, truncated = _graph_engine.find_cycles(50_000, src, dst, ts, max_length=3, max_cycles=10**6)
    planted = {tuple(sorted((int(src[e]), int(dst[e])) for e in c)) for c in cycles}
    # every planted A->B->C->A loop (the last 75 edges) must be among the results
    loop_edges = range(len(src) - 75, len(src))
    for start in range(0, 75, 3):
        loop = tuple(sorted((int(src[e]), int(dst[e])) for e in loop_edges[start:start + 3]))
        assert loop in planted
    assert not truncated

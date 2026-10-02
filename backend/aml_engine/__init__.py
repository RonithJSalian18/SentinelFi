"""
SentinelFi AML graph engine.

Circular-trading detection runs in-memory on a CSR graph built from the transaction ledger.
The native C++ engine (aml_engine/_graph_engine, built with `python setup.py build_ext --inplace`)
is used when available; otherwise an identical pure-Python implementation takes over.
Set AML_ENGINE=python to force the fallback.
"""
import os

from . import python_engine

try:
    from . import _graph_engine
except ImportError:
    _graph_engine = None

ENGINE = "cpp" if _graph_engine is not None and os.getenv("AML_ENGINE", "").lower() != "python" else "python"


def find_cycles(num_nodes, src, dst, ts, max_length=3, chronological=False, max_window=0, max_cycles=1000, num_threads=0):
    """Return (cycles, truncated). Each cycle is a list of edge indices in traversal order."""
    impl = _graph_engine if ENGINE == "cpp" else python_engine
    return impl.find_cycles(
        num_nodes, src, dst, ts,
        max_length=max_length, chronological=chronological,
        max_window=max_window, max_cycles=max_cycles, num_threads=num_threads,
    )

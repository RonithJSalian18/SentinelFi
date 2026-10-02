// pybind11 bridge: exposes sentinelfi::find_cycles as aml_engine._graph_engine.find_cycles
#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <stdexcept>
#include <string>

#include "cycle_detector.hpp"

namespace py = pybind11;

using Int64Array = py::array_t<int64_t, py::array::c_style | py::array::forcecast>;

static py::tuple find_cycles_py(int64_t num_nodes, Int64Array src, Int64Array dst, Int64Array ts,
                                int max_length, bool chronological, int64_t max_window,
                                std::size_t max_cycles, unsigned num_threads) {
    if (src.ndim() != 1 || dst.ndim() != 1 || ts.ndim() != 1)
        throw std::invalid_argument("src, dst and ts must be 1-D arrays");
    const auto num_edges = static_cast<std::size_t>(src.shape(0));
    if (static_cast<std::size_t>(dst.shape(0)) != num_edges ||
        static_cast<std::size_t>(ts.shape(0)) != num_edges)
        throw std::invalid_argument("src, dst and ts must have the same length");
    if (max_length < 2) throw std::invalid_argument("max_length must be >= 2");
    if (max_cycles == 0) throw std::invalid_argument("max_cycles must be >= 1");

    const int64_t* s = src.data();
    const int64_t* d = dst.data();
    for (std::size_t e = 0; e < num_edges; ++e) {
        if (s[e] < 0 || s[e] >= num_nodes || d[e] < 0 || d[e] >= num_nodes)
            throw std::out_of_range("node index out of range at edge " + std::to_string(e));
    }

    sentinelfi::CycleSearchOptions opt;
    opt.max_length = max_length;
    opt.chronological = chronological;
    opt.max_window = max_window;
    opt.max_cycles = max_cycles;
    opt.num_threads = num_threads;

    sentinelfi::CycleSearchResult result;
    {
        // Pure C++ from here on: let other Python threads (API requests) keep running
        py::gil_scoped_release release;
        result = sentinelfi::find_cycles(num_nodes, s, d, ts.data(), num_edges, opt);
    }
    return py::make_tuple(result.cycles, result.truncated);
}

PYBIND11_MODULE(_graph_engine, m) {
    m.doc() = "SentinelFi native AML graph engine (circular trading detection)";
    m.def("find_cycles", &find_cycles_py, py::arg("num_nodes"), py::arg("src"), py::arg("dst"),
          py::arg("ts"), py::arg("max_length") = 3, py::arg("chronological") = false,
          py::arg("max_window") = 0, py::arg("max_cycles") = 1000, py::arg("num_threads") = 0,
          "Return (cycles, truncated): every simple directed loop of 2..max_length hops, "
          "each as a list of edge indices in traversal order.");
}

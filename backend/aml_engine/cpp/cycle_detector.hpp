// High-performance circular-trading detector.
//
// Finds every simple directed cycle (A -> B -> ... -> A) of 2..max_length hops in an
// in-memory transaction graph. Node ids must be dense in [0, num_nodes). Kept free of
// Python headers so it can be unit-tested and benchmarked as plain C++.
//
// Pipeline:
//   1. CSR adjacency via counting sort (O(V + E)).
//   2. Tarjan SCC decomposition: a cycle never leaves its strongly connected component,
//      so every edge between components (and every self-loop) is discarded up front.
//   3. Depth-bounded DFS from every start node, spread across worker threads in chunks.
//      Chunk results are merged in start order, so output is identical to a serial run.
//   4. Meet-in-the-middle pruning: before each DFS, a reverse BFS of radius ~max_length/2
//      marks which nodes can still get back to the start in time; the forward search
//      abandons any branch that could not close the loop within the remaining hops.
#pragma once

#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <numeric>
#include <thread>
#include <utility>
#include <vector>

namespace sentinelfi {

struct CycleSearchOptions {
    int max_length = 3;            // maximum hops in a loop (>= 2)
    bool chronological = false;    // each hop must not precede the previous one
    int64_t max_window = 0;        // max seconds between earliest and latest hop; 0 disables
    std::size_t max_cycles = 1000; // stop after this many loops
    unsigned num_threads = 0;      // 0 = one per hardware thread
};

struct CycleSearchResult {
    std::vector<std::vector<int64_t>> cycles;  // edge indices, in traversal order
    bool truncated = false;
};

namespace detail {

constexpr int64_t kChunkSize = 1024;

// Neighbour record packed so one adjacency scan touches contiguous memory
struct Arc {
    int64_t dst;
    int64_t ts;
    int64_t edge;
};

// Iterative Tarjan (no recursion, safe for millions of nodes). Returns a component id per node.
inline std::vector<int64_t> strongly_connected_components(int64_t n, const std::vector<int64_t>& offsets,
                                                          const std::vector<int64_t>& targets) {
    const int64_t kUnvisited = -1;
    std::vector<int64_t> index(n, kUnvisited), low(n, 0), comp(n, -1);
    std::vector<char> on_stack(n, 0);
    std::vector<int64_t> stack;
    std::vector<std::pair<int64_t, int64_t>> calls;  // (node, next adjacency position)
    int64_t next_index = 0, next_comp = 0;

    for (int64_t root = 0; root < n; ++root) {
        if (index[root] != kUnvisited) continue;
        index[root] = low[root] = next_index++;
        stack.push_back(root);
        on_stack[root] = 1;
        calls.emplace_back(root, offsets[root]);

        while (!calls.empty()) {
            const int64_t v = calls.back().first;
            const int64_t pos = calls.back().second;
            if (pos < offsets[v + 1]) {
                calls.back().second = pos + 1;
                const int64_t w = targets[pos];
                if (index[w] == kUnvisited) {
                    index[w] = low[w] = next_index++;
                    stack.push_back(w);
                    on_stack[w] = 1;
                    calls.emplace_back(w, offsets[w]);
                } else if (on_stack[w]) {
                    low[v] = std::min(low[v], index[w]);
                }
                continue;
            }
            if (low[v] == index[v]) {
                int64_t w;
                do {
                    w = stack.back();
                    stack.pop_back();
                    on_stack[w] = 0;
                    comp[w] = next_comp;
                } while (w != v);
                ++next_comp;
            }
            calls.pop_back();
            if (!calls.empty()) {
                const int64_t parent = calls.back().first;
                low[parent] = std::min(low[parent], low[v]);
            }
        }
    }
    return comp;
}

// Read-only graph shared by all worker threads: intra-SCC arcs only, in CSR order
struct Graph {
    int64_t num_nodes = 0;
    std::vector<int64_t> offsets;
    std::vector<Arc> arcs;
    std::vector<int64_t> rev_offsets;  // reverse adjacency (predecessors) for pruning
    std::vector<int64_t> rev_src;
};

inline Graph build_graph(int64_t n, const int64_t* src, const int64_t* dst, const int64_t* ts,
                         std::size_t num_edges, bool chronological) {
    // Full CSR (edge ids, stable by edge index) -> SCC ids
    std::vector<int64_t> offsets(static_cast<std::size_t>(n) + 1, 0);
    for (std::size_t e = 0; e < num_edges; ++e) ++offsets[src[e] + 1];
    std::partial_sum(offsets.begin(), offsets.end(), offsets.begin());
    std::vector<int64_t> order(num_edges), targets(num_edges);
    {
        std::vector<int64_t> cursor(offsets.begin(), offsets.end() - 1);
        for (std::size_t e = 0; e < num_edges; ++e) order[cursor[src[e]]++] = static_cast<int64_t>(e);
    }
    for (std::size_t i = 0; i < num_edges; ++i) targets[i] = dst[order[i]];
    const std::vector<int64_t> comp = strongly_connected_components(n, offsets, targets);

    Graph g;
    g.num_nodes = n;
    g.offsets.assign(static_cast<std::size_t>(n) + 1, 0);
    g.rev_offsets.assign(static_cast<std::size_t>(n) + 1, 0);
    for (int64_t v = 0; v < n; ++v) {
        int64_t kept = 0;
        for (int64_t i = offsets[v]; i < offsets[v + 1]; ++i) {
            const int64_t w = targets[i];
            if (w != v && comp[w] == comp[v]) {
                ++kept;
                ++g.rev_offsets[w + 1];
            }
        }
        g.offsets[v + 1] = g.offsets[v] + kept;
    }
    std::partial_sum(g.rev_offsets.begin(), g.rev_offsets.end(), g.rev_offsets.begin());
    g.arcs.reserve(static_cast<std::size_t>(g.offsets[n]));
    g.rev_src.resize(static_cast<std::size_t>(g.offsets[n]));
    std::vector<int64_t> rev_cursor(g.rev_offsets.begin(), g.rev_offsets.end() - 1);
    for (int64_t v = 0; v < n; ++v) {
        for (int64_t i = offsets[v]; i < offsets[v + 1]; ++i) {
            const int64_t w = targets[i];
            if (w != v && comp[w] == comp[v]) {
                const int64_t e = order[i];
                g.arcs.push_back({w, ts[e], e});
                g.rev_src[rev_cursor[w]++] = v;
            }
        }
        if (chronological) {
            // Stable: equal timestamps keep edge order, matching the Python engine exactly
            std::stable_sort(g.arcs.begin() + g.offsets[v], g.arcs.begin() + g.offsets[v + 1],
                             [](const Arc& a, const Arc& b) { return a.ts < b.ts; });
        }
    }
    return g;
}

// Per-thread DFS state
class Searcher {
public:
    Searcher(const Graph& g, const int64_t* ts, const CycleSearchOptions& opt)
        : g_(g), ts_(ts), opt_(opt), radius_(opt.max_length / 2),
          on_path_(static_cast<std::size_t>(g.num_nodes), 0),
          back_dist_(static_cast<std::size_t>(g.num_nodes), kFar) {}

    // Appends loops found from `start` to `out`; returns false once `out` holds `cap` loops
    bool search(int64_t start, std::vector<std::vector<int64_t>>& out, std::size_t cap) {
        if (g_.offsets[start] == g_.offsets[start + 1]) return true;
        start_ = start;
        out_ = &out;
        cap_ = cap;
        mark_back_distances();
        on_path_[start] = 1;
        dfs(start, std::numeric_limits<int64_t>::min(), std::numeric_limits<int64_t>::max(),
            std::numeric_limits<int64_t>::min());
        on_path_[start] = 0;
        for (int64_t v : touched_) back_dist_[v] = kFar;
        touched_.clear();
        return out.size() < cap;
    }

private:
    static constexpr int8_t kFar = -1;  // farther than radius_ hops from the start

    bool eligible(int64_t v) const { return opt_.chronological || v > start_; }

    // Reverse BFS: shortest hop count from each nearby node back to the start, using only
    // nodes the DFS may visit. A lower bound on any real return path, so pruning is safe.
    void mark_back_distances() {
        back_dist_[start_] = 0;
        touched_.push_back(start_);
        std::size_t level_begin = 0;
        for (int level = 0; level < radius_; ++level) {
            const std::size_t level_end = touched_.size();
            for (std::size_t k = level_begin; k < level_end; ++k) {
                const int64_t u = touched_[k];
                for (int64_t i = g_.rev_offsets[u]; i < g_.rev_offsets[u + 1]; ++i) {
                    const int64_t p = g_.rev_src[i];
                    if (back_dist_[p] != kFar || !eligible(p)) continue;
                    back_dist_[p] = static_cast<int8_t>(level + 1);
                    touched_.push_back(p);
                }
            }
            level_begin = level_end;
        }
    }

    // Can `v`, reached with `remaining` hops left, still close the loop?
    bool can_return(int64_t v, int remaining) const {
        const int8_t d = back_dist_[v];
        return d == kFar ? remaining > radius_ : d <= remaining;
    }

    bool full() const { return out_->size() >= cap_; }

    void dfs(int64_t node, int64_t prev_time, int64_t min_time, int64_t max_time) {
        const int depth = static_cast<int>(path_.size());
        for (int64_t i = g_.offsets[node]; i < g_.offsets[node + 1]; ++i) {
            if (full()) return;
            const Arc& arc = g_.arcs[i];
            if (opt_.chronological && arc.ts < prev_time) continue;
            const int64_t lo = std::min(min_time, arc.ts);
            const int64_t hi = std::max(max_time, arc.ts);
            if (opt_.max_window > 0 && hi - lo > opt_.max_window) {
                // Arcs are time-sorted in chronological mode, so later ones only widen the window
                if (opt_.chronological) break;
                continue;
            }

            if (arc.dst == start_) {
                if (depth + 1 >= 2) record(arc.edge);
            } else if (!on_path_[arc.dst] && depth + 1 < opt_.max_length && eligible(arc.dst) &&
                       can_return(arc.dst, opt_.max_length - depth - 1)) {
                // In unordered mode each loop is reported once, from its lowest node id
                path_.push_back(arc.edge);
                on_path_[arc.dst] = 1;
                dfs(arc.dst, arc.ts, lo, hi);
                on_path_[arc.dst] = 0;
                path_.pop_back();
            }
        }
    }

    // In chronological mode, a loop with tied timestamps can be time-ordered from several
    // starting hops. Report it only from the valid starting hop with the smallest edge id.
    bool is_canonical_rotation(const std::vector<int64_t>& cycle) const {
        const std::size_t len = cycle.size();
        for (std::size_t j = 1; j < len; ++j) {
            if (cycle[j] > cycle[0]) continue;
            bool ordered = true;
            for (std::size_t k = 0; k + 1 < len && ordered; ++k)
                ordered = ts_[cycle[(j + k) % len]] <= ts_[cycle[(j + k + 1) % len]];
            if (ordered) return false;
        }
        return true;
    }

    void record(int64_t closing_edge) {
        std::vector<int64_t> cycle(path_);
        cycle.push_back(closing_edge);
        if (opt_.chronological && !is_canonical_rotation(cycle)) return;
        out_->push_back(std::move(cycle));
    }

    const Graph& g_;
    const int64_t* ts_;
    const CycleSearchOptions& opt_;
    const int radius_;
    std::vector<char> on_path_;
    std::vector<int8_t> back_dist_;
    std::vector<int64_t> touched_;
    std::vector<int64_t> path_;
    std::vector<std::vector<int64_t>>* out_ = nullptr;
    std::size_t cap_ = 0;
    int64_t start_ = 0;
};

}  // namespace detail

inline CycleSearchResult find_cycles(int64_t num_nodes, const int64_t* src, const int64_t* dst,
                                     const int64_t* ts, std::size_t num_edges,
                                     const CycleSearchOptions& opt) {
    CycleSearchResult result;
    if (num_nodes <= 0) return result;
    const detail::Graph g = detail::build_graph(num_nodes, src, dst, ts, num_edges, opt.chronological);

    const int64_t num_chunks = (num_nodes + detail::kChunkSize - 1) / detail::kChunkSize;
    std::vector<std::vector<std::vector<int64_t>>> chunk_results(static_cast<std::size_t>(num_chunks));
    std::atomic<int64_t> next_chunk{0};
    std::atomic<std::size_t> total_found{0};

    // Chunks are claimed in increasing order and always run to completion (each capped at
    // max_cycles), so once the claimed prefix holds max_cycles loops, no later chunk can
    // contribute to the first max_cycles in start order.
    auto worker = [&]() {
        detail::Searcher searcher(g, ts, opt);
        while (total_found.load(std::memory_order_relaxed) < opt.max_cycles) {
            const int64_t chunk = next_chunk.fetch_add(1);
            if (chunk >= num_chunks) break;
            auto& out = chunk_results[static_cast<std::size_t>(chunk)];
            const int64_t end = std::min(num_nodes, (chunk + 1) * detail::kChunkSize);
            for (int64_t start = chunk * detail::kChunkSize; start < end; ++start) {
                if (!searcher.search(start, out, opt.max_cycles)) break;
            }
            total_found.fetch_add(out.size(), std::memory_order_relaxed);
        }
    };

    unsigned threads = opt.num_threads ? opt.num_threads : std::thread::hardware_concurrency();
    threads = static_cast<unsigned>(std::max<int64_t>(1, std::min<int64_t>(threads ? threads : 1, num_chunks)));
    if (threads == 1) {
        worker();
    } else {
        std::vector<std::thread> pool;
        pool.reserve(threads);
        for (unsigned t = 0; t < threads; ++t) pool.emplace_back(worker);
        for (auto& th : pool) th.join();
    }

    for (auto& chunk : chunk_results) {
        for (auto& cycle : chunk) {
            if (result.cycles.size() >= opt.max_cycles) break;
            result.cycles.push_back(std::move(cycle));
        }
    }
    result.truncated = result.cycles.size() >= opt.max_cycles;
    return result;
}

}  // namespace sentinelfi

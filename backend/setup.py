"""
Builds the native AML graph engine:

    pip install pybind11 setuptools
    python setup.py build_ext --inplace

Requires a C++17 compiler (MSVC Build Tools on Windows, g++/clang elsewhere).
Without it, SentinelFi falls back to the pure-Python engine automatically.
"""
from pybind11.setup_helpers import Pybind11Extension, build_ext
from setuptools import setup

setup(
    name="sentinelfi-aml-engine",
    version="1.0.0",
    ext_modules=[
        Pybind11Extension(
            "aml_engine._graph_engine",
            ["aml_engine/cpp/bindings.cpp"],
            include_dirs=["aml_engine/cpp"],
            cxx_std=17,
        )
    ],
    cmdclass={"build_ext": build_ext},
    packages=[],
)

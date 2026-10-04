"""Runs the real-infrastructure scripts (real redis-server, real PostgreSQL, real multi-process uvicorn).
Skipped (never faked) when the binaries are not installed.  Deselect with: pytest -m "not infra"
"""
import glob, os, shutil, subprocess, sys, pathlib
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _run(script):
    r = subprocess.run([sys.executable, str(ROOT / "tests" / "integration" / script)], cwd=ROOT, capture_output=True, text=True, timeout=600)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-1500:]


@pytest.mark.infra
@pytest.mark.skipif(not shutil.which("redis-server"), reason="redis-server not installed")
def test_real_redis_failure_and_recovery():
    _run("redis_failover.py")


@pytest.mark.infra
@pytest.mark.skipif(not glob.glob("/usr/lib/postgresql/*/bin/initdb"), reason="PostgreSQL binaries not installed")
def test_real_postgres_multiprocess_concurrency_and_db_failure():
    _run("pg_concurrency.py")


@pytest.mark.infra
def test_e2e_backend_demo_runs_clean():
    r = subprocess.run([sys.executable, str(ROOT / "demo" / "e2e_backend_demo.py")], cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-1500:]

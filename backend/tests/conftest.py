"""Every pytest session runs against its own throw-away SQLite file (set before the app is imported), so stale rows never leak between runs."""
import os
import tempfile

_dir = tempfile.mkdtemp(prefix="fairdrop-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_dir}/test.db")
os.environ.setdefault("ENABLE_EXPIRY_WORKER", "false")

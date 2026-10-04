import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Iterable

import joblib

RUNTIME_MARKER = ".runtime"
PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = Path(os.environ.get("ARTIFACT_RUNTIME_ROOT", str(PROJECT_ROOT / ".artifact-runtime")))
STAGING_ROOT = Path(os.environ.get("ARTIFACT_STAGING_ROOT", str(PROJECT_ROOT / ".artifact-staging")))


def _legacy_runtime_artifact_path(path: Path) -> Path:
    return path.with_name(f"{path.stem}{RUNTIME_MARKER}{path.suffix}")


def runtime_artifact_path(path: Path) -> Path:
    try:
        relative_path = path.resolve().relative_to(PROJECT_ROOT.resolve())
        return RUNTIME_ROOT / relative_path
    except ValueError:
        return _legacy_runtime_artifact_path(path)


def _runtime_candidates(path: Path) -> list[Path]:
    candidates = [runtime_artifact_path(path), _legacy_runtime_artifact_path(path)]
    deduped = []
    seen = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def _artifact_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def resolve_artifact_path(path: Path) -> Path:
    candidates = [path] + _runtime_candidates(path)
    existing = [candidate for candidate in candidates if candidate.exists()]
    if not existing:
        return path
    return max(existing, key=_artifact_mtime)


def remove_artifact_variants(paths: Iterable[Path]) -> None:
    for path in paths:
        for candidate in [path] + _runtime_candidates(path):
            try:
                candidate.unlink(missing_ok=True)
            except PermissionError:
                continue


def _staging_path(target_path: Path) -> Path:
    STAGING_ROOT.mkdir(parents=True, exist_ok=True)
    return STAGING_ROOT / f"{target_path.name}.{uuid.uuid4().hex}.tmp"


def _promote_staged_file(temp_path: Path, target_path: Path) -> Path:
    for attempt in range(3):
        try:
            os.replace(temp_path, target_path)
            for runtime_path in _runtime_candidates(target_path):
                runtime_path.unlink(missing_ok=True)
            return target_path
        except PermissionError:
            if attempt == 2:
                break
            time.sleep(0.15 * (attempt + 1))

    last_error = None
    for runtime_path in _runtime_candidates(target_path):
        try:
            runtime_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(temp_path, runtime_path)
            return runtime_path
        except PermissionError as exc:
            last_error = exc

    if last_error is not None:
        raise last_error

    raise PermissionError(f"Unable to promote staged artifact for {target_path}")


def write_bytes_artifact(data: bytes, target_path: Path) -> Path:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = _staging_path(target_path)
    temp_path.write_bytes(data)
    try:
        return _promote_staged_file(temp_path, target_path)
    finally:
        temp_path.unlink(missing_ok=True)


def write_text_artifact(text: str, target_path: Path, encoding: str = "utf-8") -> Path:
    return write_bytes_artifact(text.encode(encoding), target_path)


def write_json_artifact(payload: Any, target_path: Path, *, indent: int = 2) -> Path:
    return write_text_artifact(json.dumps(payload, indent=indent), target_path)


def write_dataframe_artifact(frame, target_path: Path, *, index: bool = False) -> Path:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = _staging_path(target_path)
    frame.to_csv(temp_path, index=index)
    try:
        return _promote_staged_file(temp_path, target_path)
    finally:
        temp_path.unlink(missing_ok=True)


def write_joblib_artifact(obj: Any, target_path: Path) -> Path:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = _staging_path(target_path)
    joblib.dump(obj, temp_path)
    try:
        return _promote_staged_file(temp_path, target_path)
    finally:
        temp_path.unlink(missing_ok=True)


def write_matplotlib_figure(figure, target_path: Path, **savefig_kwargs) -> Path:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = _staging_path(target_path)
    options = dict(savefig_kwargs)
    if target_path.suffix:
        options.setdefault("format", target_path.suffix.lstrip("."))
    figure.savefig(temp_path, **options)
    try:
        return _promote_staged_file(temp_path, target_path)
    finally:
        temp_path.unlink(missing_ok=True)

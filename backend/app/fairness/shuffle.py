"""Verifiable randomisation: commitment -> seed -> deterministic shuffle -> reveal -> verify.

Byte-for-byte compatible with the frontend verifier (frontend/lib/engine/shuffle.ts) so a browser can re-run the draw.
Real properties: SHA-256 hash commitment (binding), deterministic recomputation by any verifier, unbiased Fisher-Yates
driven by a SHA-256 counter-mode stream (rejection sampling).
NOT claimed: external randomness beacon, protection against an operator who chooses the seed before committing to it.
"""
from __future__ import annotations

import hashlib
import struct
from typing import Sequence

ALGORITHM = 'Fisher–Yates over SHA-256 counter stream (rejection sampling), seed = SHA-256("shuffle:"+serverSeed+":"+eligibleRoot)'


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def commitment_of(server_seed: str) -> str:
    return _sha("commit:" + server_seed)


def root_of(eligible_ids: Sequence[str]) -> str:
    return _sha("root:" + ",".join(str(x) for x in eligible_ids))


def shuffle_seed(server_seed: str, root: str) -> str:
    return _sha("shuffle:" + server_seed + ":" + root)


class HashStream:
    def __init__(self, seed_hex: str) -> None:
        self.seed_hex, self.ctr, self.buf, self.i = seed_hex, 0, (), 0

    def next32(self) -> int:
        if self.i >= len(self.buf):
            digest = hashlib.sha256(f"{self.seed_hex}:{self.ctr}".encode("utf-8")).digest()
            self.ctr += 1
            self.buf, self.i = struct.unpack(">8I", digest), 0
        v = self.buf[self.i]
        self.i += 1
        return v

    def below(self, n: int) -> int:
        if n <= 1:
            return 0
        lim = 4294967296 - (4294967296 % n)
        x = self.next32()
        while x >= lim:
            x = self.next32()
        return x % n


def deterministic_shuffle(items: Sequence[str], seed_hex: str) -> list[str]:
    a, hs = list(items), HashStream(seed_hex)
    for i in range(len(a) - 1, 0, -1):
        j = hs.below(i + 1)
        a[i], a[j] = a[j], a[i]
    return a

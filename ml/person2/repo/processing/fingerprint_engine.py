from collections import Counter
from math import log2
from typing import Dict, Iterable, List

EVENT_SYMBOLS = {
    "click": "C",
    "tap_click": "C",
    "mousemove": "M",
    "move_drag": "M",
    "scroll": "S",
    "scroll_swipe": "S",
    "keydown": "K",
    "keydown_input": "K",
    "page_screen_change": "N",
    "navigation": "N",
    "focus_change": "F",
    "idle_start": "I",
    "idle_end": "I",
}


def event_to_symbol(event_type: str) -> str:
    return EVENT_SYMBOLS.get(event_type, "U")


def build_symbol_sequence(event_types: Iterable[str]) -> List[str]:
    return [event_to_symbol(event_type) for event_type in event_types]


def ngram_counts(symbols: List[str], n: int = 2) -> Dict[str, int]:
    if len(symbols) < n:
        return {}
    grams = ["".join(symbols[index:index + n]) for index in range(len(symbols) - n + 1)]
    return dict(Counter(grams))


def sequence_entropy(symbols: List[str]) -> float:
    if not symbols:
        return 0.0
    counts = Counter(symbols)
    total = len(symbols)
    return -sum((count / total) * log2(count / total) for count in counts.values())


def repetition_score(symbols: List[str]) -> float:
    if len(symbols) < 2:
        return 0.0
    repeated_steps = sum(1 for left, right in zip(symbols, symbols[1:]) if left == right)
    return repeated_steps / (len(symbols) - 1)

import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE_URL = "http://127.0.0.1:5000"


def should_use_synthetic_mode() -> bool:
    return os.environ.get("BOT_DEMO_DRIVER_MODE", "browser").strip().lower() == "synthetic"


def _request(path: str, payload=None) -> str:
    url = f"{BASE_URL}{path}"
    headers = {"User-Agent": "BotDetectionDemo/1.0"}
    data = None
    method = "GET"

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Unable to reach demo server at {url}: {exc}") from exc


class SyntheticSession:
    def __init__(self, bot_type: str, *, session_id: str | None = None, base_timestamp_ms: int | None = None, seed: int = 0):
        self.bot_type = bot_type
        self.session_id = session_id or str(uuid.uuid4())
        self.timestamp_ms = base_timestamp_ms if base_timestamp_ms is not None else int(time.time() * 1000)
        self.random = random.Random(seed)

    def _advance(self, min_delay_ms: int, max_delay_ms: int | None = None) -> int:
        if max_delay_ms is None:
            delay = min_delay_ms
        else:
            delay = self.random.randint(min_delay_ms, max_delay_ms)
        self.timestamp_ms += delay
        return self.timestamp_ms

    def _log(self, event_type: str, *, target_id: str = "", x=None, y=None, min_delay_ms: int = 0, max_delay_ms: int | None = None) -> None:
        payload = {
            "session_id": self.session_id,
            "actor_type": "bot",
            "bot_type": self.bot_type,
            "event_type": event_type,
            "target_id": target_id,
            "x": x,
            "y": y,
            "viewport_width": 1440,
            "viewport_height": 1100,
            "timestamp": self._advance(min_delay_ms, max_delay_ms),
        }
        _request("/log", payload)

    def start(self) -> None:
        entry_query = urllib.parse.urlencode(
            {
                "actor_type": "bot",
                "bot_type": self.bot_type,
                "reset_session": "1",
            }
        )
        _request(f"/?{entry_query}")
        self._log("page_screen_change", target_id="landing", min_delay_ms=80, max_delay_ms=140)
        self._log("focus_change", target_id="window_focus", min_delay_ms=40, max_delay_ms=90)

    def visit(self, path: str, page_name: str, *, min_delay_ms: int, max_delay_ms: int) -> None:
        _request(path)
        self._log("page_screen_change", target_id=page_name, min_delay_ms=min_delay_ms, max_delay_ms=max_delay_ms)

    def move(self, target_id: str, points, *, min_delay_ms: int, max_delay_ms: int) -> None:
        for x, y in points:
            self._log("mousemove", target_id=target_id, x=x, y=y, min_delay_ms=min_delay_ms, max_delay_ms=max_delay_ms)

    def click(self, target_id: str, x: int, y: int, *, min_delay_ms: int, max_delay_ms: int) -> None:
        self._log("click", target_id=target_id, x=x, y=y, min_delay_ms=min_delay_ms, max_delay_ms=max_delay_ms)

    def type_text(self, target_id: str, text: str, *, min_delay_ms: int, max_delay_ms: int) -> None:
        for _ in text:
            self._log("keydown", target_id=target_id, min_delay_ms=min_delay_ms, max_delay_ms=max_delay_ms)

    def scroll(self, target_id: str, positions, *, min_delay_ms: int, max_delay_ms: int) -> None:
        for position in positions:
            self._log("scroll", target_id=target_id, x=position, y=None, min_delay_ms=min_delay_ms, max_delay_ms=max_delay_ms)


def _run_flow(session: SyntheticSession, profile: str) -> str:
    if profile == "fast":
        nav = (60, 120)
        move = (20, 35)
        type_delay = (12, 24)
        click_delay = (18, 40)
        scroll_delay = (30, 45)
        move_points = [(180, 230), (320, 250)]
    elif profile == "human_like":
        nav = (240, 420)
        move = (90, 180)
        type_delay = (70, 140)
        click_delay = (120, 220)
        scroll_delay = (180, 260)
        move_points = [(160, 210), (210, 245), (280, 260), (340, 320)]
    else:
        nav = (90, 140)
        move = (35, 60)
        type_delay = (18, 32)
        click_delay = (28, 50)
        scroll_delay = (45, 70)
        move_points = [(175, 225), (255, 245), (330, 275)]

    session.start()

    session.visit("/login", "login", min_delay_ms=nav[0], max_delay_ms=nav[1])
    session.move("loginEmail", move_points, min_delay_ms=move[0], max_delay_ms=move[1])
    session.click("loginEmail", 220, 260, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.type_text("loginEmail", f"{profile}@example.com", min_delay_ms=type_delay[0], max_delay_ms=type_delay[1])
    session.click("loginPassword", 230, 330, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.type_text("loginPassword", "pass123456", min_delay_ms=type_delay[0], max_delay_ms=type_delay[1])
    session.click("remember_me", 210, 390, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.click("loginSubmit", 310, 450, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])

    session.visit("/search", "search", min_delay_ms=nav[0], max_delay_ms=nav[1])
    session.move("searchQuery", move_points, min_delay_ms=move[0], max_delay_ms=move[1])
    session.click("searchQuery", 320, 255, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.type_text("searchQuery", "coordinated bot review", min_delay_ms=type_delay[0], max_delay_ms=type_delay[1])
    session.click("searchAction", 510, 256, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.click("searchResultAlertDigest", 370, 430, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.click("searchResultCoordinationReview", 385, 505, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])

    session.visit("/browse", "browse", min_delay_ms=nav[0], max_delay_ms=nav[1])
    session.move("browseOpenBrief", move_points, min_delay_ms=move[0], max_delay_ms=move[1])
    session.click("browseOpenBrief", 300, 360, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.scroll("browse", [240, 680, 1120], min_delay_ms=scroll_delay[0], max_delay_ms=scroll_delay[1])
    session.click("browseReviewTimeline", 480, 390, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.click("bookmarkInsight", 1120, 350, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])

    session.visit("/form", "form", min_delay_ms=nav[0], max_delay_ms=nav[1])
    session.click("fullName", 280, 245, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.type_text("fullName", f"{profile.title()} Bot", min_delay_ms=type_delay[0], max_delay_ms=type_delay[1])
    session.click("organisation", 280, 330, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.type_text("organisation", "Behaviour Lab", min_delay_ms=type_delay[0], max_delay_ms=type_delay[1])
    session.click("useCase", 280, 425, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])
    session.type_text("useCase", "Submitting a synthetic session flow for the dashboard demo.", min_delay_ms=type_delay[0], max_delay_ms=type_delay[1])
    session.click("formSubmit", 315, 560, min_delay_ms=click_delay[0], max_delay_ms=click_delay[1])

    return session.session_id


def run_fast_bot_synthetic() -> None:
    session = SyntheticSession("fast", seed=11)
    session_id = _run_flow(session, "fast")
    print(f"Using synthetic demo mode for fast bot: {session_id}")


def run_human_like_bot_synthetic() -> None:
    session = SyntheticSession("human_like", seed=29)
    session_id = _run_flow(session, "human_like")
    print(f"Using synthetic demo mode for human-like bot: {session_id}")


def run_coordinated_bots_synthetic() -> None:
    base_timestamp = int(time.time() * 1000)
    session_ids = []
    for index in range(3):
        session = SyntheticSession("coordinated", base_timestamp_ms=base_timestamp + (index * 180), seed=91)
        session_ids.append(_run_flow(session, "coordinated"))
    print("Using synthetic demo mode for coordinated bots:")
    for session_id in session_ids:
        print(session_id)

import os
import shutil
import uuid
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import SessionNotCreatedException
from selenium.webdriver.chrome.service import Service

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SELENIUM_ROOT = PROJECT_ROOT / ".selenium"
PROFILE_ROOT = SELENIUM_ROOT / "profiles"


def _headless_enabled() -> bool:
    raw_value = os.environ.get("BOT_DEMO_HEADLESS", "0").strip().lower()
    return raw_value not in {"0", "false", "no", "off"}


def _chromedriver_path():
    driver_root = SELENIUM_ROOT / "chromedriver" / "win64"
    candidates = sorted(driver_root.glob("*/chromedriver.exe"))
    return candidates[-1] if candidates else None


def _profile_dir(profile_label: str) -> Path:
    profile_dir = PROFILE_ROOT / f"{profile_label}-{uuid.uuid4().hex[:10]}"
    profile_dir.mkdir(parents=True, exist_ok=True)
    return profile_dir


def _chrome_options(profile_dir: Path, headless_argument: str | None):
    options = webdriver.ChromeOptions()
    if headless_argument:
        options.add_argument(headless_argument)

    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--window-size=1440,1100")
    options.add_argument("--remote-debugging-pipe")
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--log-level=3")
    return options


def build_driver(profile_label: str):
    SELENIUM_ROOT.mkdir(parents=True, exist_ok=True)
    PROFILE_ROOT.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("SE_CACHE_PATH", str(SELENIUM_ROOT))

    chromedriver_path = _chromedriver_path()
    service = Service(executable_path=str(chromedriver_path) if chromedriver_path else None, log_output=os.devnull)

    headless_attempts = [None]
    if _headless_enabled():
        headless_attempts = ["--headless=new", "--headless"]

    last_error = None
    for headless_argument in headless_attempts:
        profile_dir = _profile_dir(profile_label)
        options = _chrome_options(profile_dir, headless_argument)
        try:
            driver = webdriver.Chrome(options=options, service=service)
            driver.set_page_load_timeout(30)
            return driver, profile_dir
        except SessionNotCreatedException as exc:
            last_error = exc
            shutil.rmtree(profile_dir, ignore_errors=True)
            continue
        except Exception:
            shutil.rmtree(profile_dir, ignore_errors=True)
            raise

    raise last_error


def cleanup_driver(driver, profile_dir: Path) -> None:
    try:
        if driver is not None:
            driver.quit()
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)

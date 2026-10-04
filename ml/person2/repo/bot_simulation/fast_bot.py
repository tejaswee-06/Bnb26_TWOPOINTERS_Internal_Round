from pathlib import Path
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from bot_simulation.browser import build_driver, cleanup_driver
from bot_simulation.synthetic_runner import run_fast_bot_synthetic, should_use_synthetic_mode

BASE_URL = "http://127.0.0.1:5000"
ENTRY_URL = f"{BASE_URL}/?actor_type=bot&bot_type=fast&reset_session=1"
WAIT_SECONDS = 10


def wait_visible(driver, by, value):
    return WebDriverWait(driver, WAIT_SECONDS).until(EC.visibility_of_element_located((by, value)))


def wait_clickable(driver, by, value):
    return WebDriverWait(driver, WAIT_SECONDS).until(EC.element_to_be_clickable((by, value)))


def main():
    if should_use_synthetic_mode():
        run_fast_bot_synthetic()
        return

    driver, profile_dir = build_driver("fast-bot")

    try:
        driver.get(ENTRY_URL)
        time.sleep(0.8)

        driver.get(f"{BASE_URL}/login")
        time.sleep(0.5)
        wait_visible(driver, By.ID, "loginEmail").send_keys("fastbot@example.com")
        wait_visible(driver, By.ID, "loginPassword").send_keys("fastpass123")
        wait_clickable(driver, By.NAME, "remember_me").click()
        wait_clickable(driver, By.ID, "loginSubmit").click()

        driver.get(f"{BASE_URL}/search")
        time.sleep(0.5)
        wait_visible(driver, By.ID, "searchQuery").send_keys("coordinated bot alert")
        wait_clickable(driver, By.ID, "searchAction").click()
        wait_clickable(driver, By.ID, "searchResultAlertDigest").click()
        wait_clickable(driver, By.ID, "searchResultCoordinationReview").click()

        driver.get(f"{BASE_URL}/browse")
        time.sleep(0.5)
        wait_clickable(driver, By.ID, "browseOpenBrief").click()
        wait_clickable(driver, By.ID, "browseReviewTimeline").click()
        wait_clickable(driver, By.ID, "bookmarkInsight").click()
        driver.execute_script("window.scrollTo(0, 700);")
        driver.execute_script("window.scrollTo(0, 1400);")

        driver.get(f"{BASE_URL}/form")
        time.sleep(0.5)
        wait_visible(driver, By.ID, "fullName").send_keys("Fast Bot")
        wait_visible(driver, By.ID, "organisation").send_keys("Automation Lab")
        wait_visible(driver, By.ID, "useCase").send_keys("Submitting robotic application flow.")
        wait_clickable(driver, By.ID, "formSubmit").click()

        time.sleep(1.5)

    finally:
        cleanup_driver(driver, profile_dir)


if __name__ == "__main__":
    main()

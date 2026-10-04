from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor
import time

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from bot_simulation.browser import build_driver, cleanup_driver
from bot_simulation.synthetic_runner import run_coordinated_bots_synthetic, should_use_synthetic_mode

BASE_URL = "http://127.0.0.1:5000"
ENTRY_URL = f"{BASE_URL}/?actor_type=bot&bot_type=coordinated&reset_session=1"
WAIT_SECONDS = 10


def wait_visible(driver, by, value):
    return WebDriverWait(driver, WAIT_SECONDS).until(EC.visibility_of_element_located((by, value)))


def wait_clickable(driver, by, value):
    return WebDriverWait(driver, WAIT_SECONDS).until(EC.element_to_be_clickable((by, value)))


def run_bot(bot_name, start_delay=0.0):
    if start_delay > 0:
        time.sleep(start_delay)

    driver, profile_dir = build_driver(bot_name)
    try:
        driver.get(ENTRY_URL)
        time.sleep(0.8)

        driver.get(f"{BASE_URL}/login")
        time.sleep(0.8)
        wait_visible(driver, By.ID, "loginEmail").send_keys(f"{bot_name}@example.com")
        wait_visible(driver, By.ID, "loginPassword").send_keys("coord123")
        wait_clickable(driver, By.ID, "loginSubmit").click()

        driver.get(f"{BASE_URL}/search")
        time.sleep(0.6)
        wait_visible(driver, By.ID, "searchQuery").send_keys(bot_name)
        wait_clickable(driver, By.ID, "searchAction").click()
        wait_clickable(driver, By.ID, "searchResultAlertDigest").click()
        time.sleep(0.3)
        wait_clickable(driver, By.ID, "searchResultCoordinationReview").click()

        driver.get(f"{BASE_URL}/browse")
        time.sleep(0.6)
        wait_clickable(driver, By.ID, "browseOpenBrief").click()
        time.sleep(0.3)
        driver.execute_script("window.scrollTo(0, 650);")
        time.sleep(0.3)
        wait_clickable(driver, By.ID, "browseReviewTimeline").click()
        time.sleep(0.3)
        wait_clickable(driver, By.ID, "bookmarkInsight").click()
        time.sleep(0.3)
        driver.execute_script("window.scrollTo(0, 1200);")

        driver.get(f"{BASE_URL}/form")
        time.sleep(0.6)
        wait_visible(driver, By.ID, "fullName").send_keys(bot_name)
        wait_visible(driver, By.ID, "organisation").send_keys("Coordinated Operations")
        wait_visible(driver, By.ID, "useCase").send_keys("Coordinated submission pattern.")
        time.sleep(0.3)
        wait_clickable(driver, By.ID, "formSubmit").click()

        time.sleep(1.2)

    finally:
        cleanup_driver(driver, profile_dir)


def main():
    if should_use_synthetic_mode():
        run_coordinated_bots_synthetic()
        return

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(run_bot, f"coord_bot_{index}", index * 0.2)
            for index in range(3)
        ]
        for future in futures:
            future.result()


if __name__ == "__main__":
    main()

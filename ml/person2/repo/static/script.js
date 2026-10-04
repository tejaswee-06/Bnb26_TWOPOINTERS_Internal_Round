function sendEvent(eventType, x = null, y = null, targetId = "") {
    fetch("/log", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            session_id: SESSION_ID,
            actor_type: ACTOR_TYPE,
            bot_type: BOT_TYPE,
            event_type: eventType,
            target_id: targetId,
            x: x,
            y: y,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
            timestamp: Date.now()
        })
    }).catch(function () {});
}

function targetNameFor(element) {
    if (!element) {
        return "";
    }
    const interactive = element.closest("[data-target-id], [id], [name], a, button, input, textarea, select");
    if (!interactive) {
        return element.tagName.toLowerCase();
    }
    return interactive.dataset.targetId || interactive.id || interactive.name || interactive.tagName.toLowerCase();
}

function activateContextCard(targetId) {
    document.querySelectorAll(".result-tile").forEach(function (tile) {
        const isActive = tile.dataset.targetId === targetId;
        tile.classList.toggle("is-active", isActive);
        tile.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    document.querySelectorAll(".context-card").forEach(function (card) {
        card.classList.toggle("is-active", card.id === targetId);
    });
}

function activateReadingCard(targetId) {
    document.querySelectorAll(".reading-card").forEach(function (card) {
        card.classList.toggle("is-active", card.id === targetId);
    });
}

function updateFormProgress(form) {
    const card = form.closest(".surface-card");
    if (!card) {
        return;
    }

    const progressBar = card.querySelector("[data-progress-bar]");
    const progressText = card.querySelector("[data-progress-text]");
    const controls = Array.from(form.querySelectorAll("input:not([type='hidden']), textarea, select"));
    if (!progressBar || !progressText || !controls.length) {
        return;
    }

    const completed = controls.filter(function (control) {
        if (control.type === "checkbox" || control.type === "radio") {
            return control.checked;
        }
        return Boolean(control.value.trim());
    }).length;
    const percent = Math.round((completed / controls.length) * 100);

    progressBar.style.width = percent + "%";
    progressText.textContent = percent + "% complete";
}

function bindSearchWorkspace() {
    const searchBox = document.getElementById("searchQuery");
    const searchAction = document.getElementById("searchAction");
    const hint = document.getElementById("searchWorkspaceHint");
    const resultTiles = document.querySelectorAll(".result-tile");

    if (!searchBox || !searchAction || !resultTiles.length) {
        return;
    }

    function showSearchResult(targetId) {
        activateContextCard(targetId);
        if (!hint) {
            return;
        }
        const query = searchBox.value.trim();
        if (query) {
            hint.textContent = 'Showing the strongest matches for "' + query + '". Select a dossier to continue.';
        } else {
            hint.textContent = "Type a query, then open one of the two dossiers to compare click preference and exploration flow.";
        }
    }

    resultTiles.forEach(function (tile) {
        tile.addEventListener("click", function (event) {
            event.preventDefault();
            showSearchResult(tile.dataset.targetId);
        });
    });

    searchAction.addEventListener("click", function () {
        showSearchResult("result-1");
    });

    document.querySelectorAll(".query-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
            searchBox.value = chip.dataset.query || "";
            searchBox.focus();
            showSearchResult("result-1");
        });
    });

    activateContextCard("result-1");
}

function bindBrowseInteractions() {
    const bookmarkButton = document.getElementById("bookmarkInsight");
    const bookmarkStatus = document.getElementById("bookmarkStatus");

    document.querySelectorAll("#browseOpenBrief, #browseReviewTimeline").forEach(function (link) {
        link.addEventListener("click", function () {
            const targetId = (link.getAttribute("href") || "").replace("#", "");
            if (targetId) {
                activateReadingCard(targetId);
            }
        });
    });

    if (!bookmarkButton || !bookmarkStatus) {
        return;
    }

    bookmarkButton.addEventListener("click", function () {
        const pressed = bookmarkButton.getAttribute("aria-pressed") === "true";
        const next = !pressed;
        bookmarkButton.setAttribute("aria-pressed", next ? "true" : "false");
        bookmarkButton.textContent = next ? "Insight Saved" : "Bookmark Insight";
        bookmarkStatus.textContent = next
            ? "Bookmark is active. This creates a visible state change and a more realistic pause point."
            : "Bookmark is inactive. Toggle it to create a deliberate state change.";
    });

    activateReadingCard("article-1");
}

function bindProgressForms() {
    document.querySelectorAll("form[data-progress-form]").forEach(function (form) {
        updateFormProgress(form);
        form.querySelectorAll("input, textarea, select").forEach(function (control) {
            control.addEventListener("input", function () {
                updateFormProgress(form);
            });
            control.addEventListener("change", function () {
                updateFormProgress(form);
            });
        });
    });
}

function bindFormSubmissions() {
    document.querySelectorAll("form[data-track-form]").forEach(function (form) {
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            sendEvent("page_screen_change", null, null, form.dataset.trackForm + "_submit");
            form.classList.add("is-submitted");

            const button = form.querySelector("button[type='submit'], button");
            if (button) {
                button.textContent = "Submitted";
                button.disabled = true;
            }

            const card = form.closest(".surface-card");
            const status = card ? card.querySelector("[data-form-status]") : null;
            const progressBar = card ? card.querySelector("[data-progress-bar]") : null;
            const progressText = card ? card.querySelector("[data-progress-text]") : null;
            if (status) {
                status.textContent = "Submission captured locally. You can move to the next step or review the session in the dashboard.";
            }
            if (progressBar) {
                progressBar.style.width = "100%";
            }
            if (progressText) {
                progressText.textContent = "100% complete";
            }
        });
    });
}

sendEvent("page_screen_change", null, null, PAGE_NAME);

document.addEventListener("click", function (event) {
    sendEvent("click", event.clientX, event.clientY, targetNameFor(event.target));
});

let lastMove = 0;
document.addEventListener("mousemove", function (event) {
    const now = Date.now();
    if (now - lastMove > 200) {
        sendEvent("mousemove", event.clientX, event.clientY, targetNameFor(event.target));
        lastMove = now;
    }
});

document.addEventListener("scroll", function () {
    sendEvent("scroll", window.scrollY, null, PAGE_NAME);
});

document.addEventListener("keydown", function (event) {
    sendEvent("keydown", null, null, event.target ? targetNameFor(event.target) : event.key);
});

window.addEventListener("focus", function () {
    sendEvent("focus_change", null, null, "window_focus");
});

window.addEventListener("blur", function () {
    sendEvent("focus_change", null, null, "window_blur");
});

window.addEventListener("load", function () {
    document.body.classList.add("is-ready");
    bindSearchWorkspace();
    bindBrowseInteractions();
    bindProgressForms();
    bindFormSubmissions();
});

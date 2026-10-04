let dashboardState = null;
let autoRefreshHandle = null;
let dashboardRequestInFlight = false;
let selectedSessionId = null;
let sessionTablePage = 1;
const DEFAULT_SESSION_PAGE_SIZE = 12;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function setEmptyState(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
    }
}

function shortSessionId(sessionId) {
    return String(sessionId || "unknown").slice(0, 8) + "...";
}

function scoreBadge(score) {
    if (score >= 0.85) {
        return "critical";
    }
    if (score >= 0.5) {
        return "warning";
    }
    return "safe";
}

function formatLabel(label) {
    return String(label || "n/a")
        .replaceAll("_", " ")
        .replace(/\b\w/g, function (match) { return match.toUpperCase(); });
}

function parseJsonResponse(response) {
    return response.text().then(function (text) {
        let payload = {};

        if (text) {
            try {
                payload = JSON.parse(text);
            } catch (error) {
                payload = { message: text };
            }
        }

        if (!response.ok) {
            const requestError = new Error(payload.message || `Request failed with status ${response.status}.`);
            requestError.payload = payload;
            requestError.status = response.status;
            throw requestError;
        }

        return payload;
    });
}

function formatTimestamp(epochSeconds) {
    if (!epochSeconds) {
        return "Not available";
    }
    return new Date(epochSeconds * 1000).toLocaleString();
}

function formatDateOnly(epochSeconds) {
    if (!epochSeconds) {
        return "Not available";
    }
    return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit"
    });
}

function formatShortTime(epochSeconds) {
    if (!epochSeconds) {
        return "n/a";
    }
    return new Date(epochSeconds * 1000).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
    });
}

function formatShortDateTime(epochSeconds) {
    if (!epochSeconds) {
        return "Not available";
    }
    return formatDateOnly(epochSeconds) + " at " + formatShortTime(epochSeconds);
}

function percentWidth(score) {
    return Math.max(0, Math.min(100, Math.round((score || 0) * 100)));
}

function renderSummary(summary) {
    const cards = [
        {
            label: "Total Sessions",
            value: summary.total_sessions,
            note: "Complete stream in the current dataset",
            tone: "tone-neutral"
        },
        {
            label: "Human Sessions",
            value: summary.human_sessions,
            note: "Organic interaction baselines",
            tone: "tone-safe"
        },
        {
            label: "Bot Sessions",
            value: summary.bot_sessions,
            note: "Automated behaviour candidates",
            tone: "tone-critical"
        },
        {
            label: "Coordinated Groups",
            value: summary.coordinated_groups,
            note: "Linked clusters for review",
            tone: "tone-warning"
        },
        {
            label: "Window Rows",
            value: summary.window_rows,
            note: "Short-window analytic units",
            tone: "tone-accent"
        }
    ];

    document.getElementById("summaryCards").innerHTML = cards.map(function (card) {
        return `
            <div class="stat-card ${card.tone}">
                <span class="stat-kicker">${card.label}</span>
                <strong>${card.value}</strong>
                <p class="stat-note">${card.note}</p>
            </div>
        `;
    }).join("");
}

function renderPosture(posture, summary) {
    const container = document.getElementById("postureCard");
    const tone = posture.level === "High Alert" ? "critical" : posture.level === "Elevated" ? "warning" : "safe";
    container.innerHTML = `
        <div class="posture-head">
            <div>
                <p class="eyebrow">Detection Posture</p>
                <h3>${posture.level}</h3>
                <p class="lead">${posture.detail}</p>
            </div>
            <span class="posture-pill ${tone}">${posture.level}</span>
        </div>
        <div class="posture-grid">
            <div class="mini-metric">
                <span>Critical Sessions</span>
                <strong>${posture.critical_sessions}</strong>
            </div>
            <div class="mini-metric">
                <span>Watch Sessions</span>
                <strong>${posture.watch_sessions}</strong>
            </div>
            <div class="mini-metric">
                <span>Coordinated Groups</span>
                <strong>${summary.coordinated_groups}</strong>
            </div>
        </div>
    `;
}

function renderFeatureSummary(featureSummary) {
    const entries = Object.entries(featureSummary || {});
    if (!entries.length) {
        setEmptyState("featureSummary", "No feature summary available yet.");
        return;
    }

    document.getElementById("featureSummary").innerHTML = entries.map(function ([label, value]) {
        return `<div class="metric-row"><span>${formatLabel(label)}</span><strong>${value}</strong></div>`;
    }).join("");
}

function renderModelHealth(modelMetrics) {
    const container = document.getElementById("modelHealth");
    const session = modelMetrics.session || {};
    const windowed = modelMetrics.window || {};

    container.innerHTML = `
        <div class="model-card">
            <div class="model-head">
                <strong>Session Classifier</strong>
                <span>${session.dataset_rows || 0} rows</span>
            </div>
            <div class="metric-row"><span>Status</span><strong>${formatLabel(session.status || "unavailable")}</strong></div>
            <div class="metric-row"><span>Logistic Accuracy</span><strong>${session.logistic_accuracy ?? "n/a"}</strong></div>
            <div class="metric-row"><span>Random Forest Accuracy</span><strong>${session.random_forest_accuracy ?? "n/a"}</strong></div>
            <div class="metric-row"><span>XGBoost Accuracy</span><strong>${session.xgboost_accuracy ?? "n/a"}</strong></div>
            <p class="muted">${session.message || "No session model metrics available."}</p>
        </div>
        <div class="model-card">
            <div class="model-head">
                <strong>Window Classifier</strong>
                <span>${windowed.dataset_rows || 0} rows</span>
            </div>
            <div class="metric-row"><span>Status</span><strong>${formatLabel(windowed.status || "unavailable")}</strong></div>
            <div class="metric-row"><span>Logistic Accuracy</span><strong>${windowed.logistic_accuracy ?? "n/a"}</strong></div>
            <div class="metric-row"><span>Random Forest Accuracy</span><strong>${windowed.random_forest_accuracy ?? "n/a"}</strong></div>
            <div class="metric-row"><span>Held-Out Sessions</span><strong>${(windowed.held_out_sessions || []).length}</strong></div>
            <p class="muted">${windowed.message || "No window model metrics available."}</p>
        </div>
    `;
}

function renderDataStatus(dataStatus) {
    const rows = [
        ["Raw Events", dataStatus.events_updated_at],
        ["Session Features", dataStatus.features_updated_at],
        ["Window Features", dataStatus.window_features_updated_at]
    ];

    document.getElementById("dataStatus").innerHTML = rows.map(function ([label, value]) {
        return `<div class="metric-row"><span>${label}</span><strong>${formatTimestamp(value)}</strong></div>`;
    }).join("");
}

function renderGroups(groups) {
    if (!groups.length) {
        setEmptyState("groupAlerts", "No coordinated groups flagged in the current dataset.");
        return;
    }

    document.getElementById("groupAlerts").innerHTML = groups.map(function (group) {
        const members = group.members.map(function (member) {
            return `
                <li class="alert-member">
                    <div>
                        <strong>${shortSessionId(member.session_id)}</strong>
                        <span>${formatLabel(member.bot_type)}</span>
                        <small class="time-meta">${formatShortDateTime(member.start_time)}</small>
                    </div>
                </li>
            `;
        }).join("");
        return `
            <div class="alert-card">
                <div class="alert-head">
                    <strong>Group ${group.group_id}</strong>
                    <span class="pill bot">sim ${group.similarity}</span>
                </div>
                <p>${group.pair_count} suspicious pair links in the same coordination cluster.</p>
                <ul class="clean-list alert-members">${members}</ul>
            </div>
        `;
    }).join("");
}

function distributionMarkup(entries) {
    if (!entries.length) {
        return "<p class='empty-state'>No distribution data available.</p>";
    }

    const max = Math.max(...entries.map(function (entry) { return entry.value; }), 1);
    return entries.map(function (entry) {
        const width = (entry.value / max) * 100;
        return `
            <div class="chart-row">
                <div class="chart-label">
                    <span>${entry.label}</span>
                    <strong>${entry.value}</strong>
                </div>
                <div class="bar-track">
                    <div class="bar-fill ${entry.tone || ""}" style="width:${width}%"></div>
                </div>
            </div>
        `;
    }).join("");
}

function renderDistributions(sessions) {
    const byType = {};
    const riskBands = { Safe: 0, Watch: 0, Critical: 0 };

    sessions.forEach(function (session) {
        const key = session.bot_type || session.actor_type;
        byType[key] = (byType[key] || 0) + 1;
        if (session.final_risk >= 0.85) {
            riskBands.Critical += 1;
        } else if (session.final_risk >= 0.5) {
            riskBands.Watch += 1;
        } else {
            riskBands.Safe += 1;
        }
    });

    document.getElementById("distributionChart").innerHTML = distributionMarkup(
        Object.entries(byType).map(function ([label, value]) {
            return {
                label: formatLabel(label),
                value: value,
                tone: label === "none" ? "safe" : "critical"
            };
        })
    );

    document.getElementById("riskChart").innerHTML = distributionMarkup(
        [
            { label: "Safe", value: riskBands.Safe, tone: "safe" },
            { label: "Watch", value: riskBands.Watch, tone: "warning" },
            { label: "Critical", value: riskBands.Critical, tone: "critical" }
        ]
    );
}

function getFilterState() {
    return {
        selected: document.getElementById("sessionFilter") ? document.getElementById("sessionFilter").value : "all",
        term: document.getElementById("sessionSearch") ? document.getElementById("sessionSearch").value.trim().toLowerCase() : "",
        sortKey: document.getElementById("sessionSort") ? document.getElementById("sessionSort").value : "risk_desc"
    };
}

function getSessionPageSize() {
    const element = document.getElementById("sessionPageSize");
    const value = element ? Number(element.value) : DEFAULT_SESSION_PAGE_SIZE;
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_PAGE_SIZE;
}

function buildPaginationSequence(totalPages, currentPage) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, function (_, index) {
            return index + 1;
        });
    }

    const pages = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) {
        pages.push("gap-start");
    }

    for (let page = start; page <= end; page += 1) {
        pages.push(page);
    }

    if (end < totalPages - 1) {
        pages.push("gap-end");
    }

    pages.push(totalPages);
    return pages;
}

function getFilteredSessions() {
    const sessions = dashboardState ? dashboardState.sessions.slice() : [];
    const state = getFilterState();

    const filtered = sessions.filter(function (session) {
        if (state.selected === "human" && session.actor_type !== "human") {
            return false;
        }
        if (state.selected === "bot" && session.actor_type !== "bot") {
            return false;
        }
        if (state.selected === "high-risk" && session.final_risk < 0.85) {
            return false;
        }
        if (!state.term) {
            return true;
        }
        const haystack = [
            session.session_id,
            session.actor_type,
            session.bot_type,
            session.reasons.join(" "),
            formatDateOnly(session.start_time),
            formatShortTime(session.start_time)
        ].join(" ").toLowerCase();
        return haystack.includes(state.term);
    });

    filtered.sort(function (left, right) {
        if (state.sortKey === "start_desc") {
            return right.start_time - left.start_time;
        }
        if (state.sortKey === "start_asc") {
            return left.start_time - right.start_time;
        }
        if (state.sortKey === "rate_desc") {
            return right.event_rate - left.event_rate;
        }
        return right.final_risk - left.final_risk;
    });

    return filtered;
}

function renderActiveFilters(filteredSessions, totalSessions) {
    const state = getFilterState();
    const chips = [];

    chips.push(`<span class="filter-chip">${filteredSessions.length} of ${totalSessions} shown</span>`);
    chips.push(`<span class="filter-chip">View: ${formatLabel(state.selected)}</span>`);
    chips.push(`<span class="filter-chip">Sort: ${formatLabel(state.sortKey)}</span>`);

    if (state.term) {
        chips.push(`<span class="filter-chip">Search: ${state.term}</span>`);
    }

    const container = document.getElementById("activeFilters");
    if (container) {
        container.innerHTML = chips.join("");
    }
}

function scoreRowMarkup(label, score) {
    const tone = scoreBadge(score);
    return `
        <div class="score-row">
            <div class="chart-label">
                <span>${label}</span>
                <strong>${score.toFixed(3)}</strong>
            </div>
            <div class="score-meter">
                <div class="score-fill ${tone}" style="width:${percentWidth(score)}%"></div>
            </div>
        </div>
    `;
}

function renderSessionDetails(payload) {
    const reasonsMarkup = payload.reasons.length
        ? payload.reasons.map(function (reason) { return `<li>${escapeHtml(reason)}</li>`; }).join("")
        : "<li>No explicit rule reasons.</li>";
    const scoreRows = [
        scoreRowMarkup("Rule Signal", payload.rule_score),
        scoreRowMarkup("Model Score", payload.individual_bot_score),
        scoreRowMarkup("Coordination Score", payload.coordination_score),
        scoreRowMarkup("Final Risk", payload.final_risk)
    ].join("");

    document.getElementById("explanationPanel").innerHTML = `
        <div class="detail-header">
            <div>
                <h4>${escapeHtml(payload.session_id)}</h4>
                <p class="muted">${escapeHtml(formatLabel(payload.actor_type))} session${payload.bot_type !== "none" ? ` - ${escapeHtml(formatLabel(payload.bot_type))}` : ""}</p>
            </div>
            <span class="posture-pill ${scoreBadge(payload.final_risk)}">Risk ${payload.final_risk}</span>
        </div>
        <div class="detail-grid">
            <div class="metric-row"><span>Start Date</span><strong>${formatDateOnly(payload.start_time)}</strong></div>
            <div class="metric-row"><span>Start Time</span><strong>${formatShortTime(payload.start_time)}</strong></div>
            <div class="metric-row"><span>Total Events</span><strong>${payload.total_events}</strong></div>
            <div class="metric-row"><span>Duration</span><strong>${payload.session_duration}s</strong></div>
            <div class="metric-row"><span>Event Rate</span><strong>${payload.event_rate}</strong></div>
            <div class="metric-row"><span>Sequence Entropy</span><strong>${payload.entropy}</strong></div>
            <div class="metric-row"><span>Repetition Score</span><strong>${payload.repetition_score}</strong></div>
        </div>
        <div class="score-stack">
            ${scoreRows}
        </div>
        <div class="reason-block">
            <strong>Alert Reasons</strong>
            <ul class="clean-list compact-list">${reasonsMarkup}</ul>
        </div>
    `;
}

function renderSessionPagination(totalItems, totalPages, currentPage, startIndex, endIndex, totalSessions) {
    const tableMeta = document.getElementById("sessionTableMeta");
    const prevButton = document.getElementById("sessionPrevPage");
    const nextButton = document.getElementById("sessionNextPage");
    const pagesContainer = document.getElementById("sessionPageButtons");

    if (tableMeta) {
        if (!totalItems) {
            tableMeta.textContent = `0 of ${totalSessions} sessions shown`;
        } else {
            tableMeta.textContent = `${startIndex}-${endIndex} of ${totalItems} filtered sessions (${totalSessions} total)`;
        }
    }

    if (prevButton) {
        prevButton.disabled = currentPage <= 1 || totalItems === 0;
    }

    if (nextButton) {
        nextButton.disabled = currentPage >= totalPages || totalItems === 0;
    }

    if (!pagesContainer) {
        return;
    }

    if (totalItems === 0) {
        pagesContainer.innerHTML = `<span class="pagination-summary">No pages</span>`;
        return;
    }

    const pageMarkup = buildPaginationSequence(totalPages, currentPage).map(function (entry) {
        if (typeof entry === "string") {
            return `<span class="pagination-gap" aria-hidden="true">...</span>`;
        }

        return `
            <button
                type="button"
                class="pagination-page ${entry === currentPage ? "is-active" : ""}"
                data-page="${entry}"
                aria-label="Go to page ${entry}"
                aria-current="${entry === currentPage ? "page" : "false"}"
            >${entry}</button>
        `;
    }).join("");

    pagesContainer.innerHTML = `
        <span class="pagination-summary">Page ${currentPage} of ${totalPages}</span>
        ${pageMarkup}
    `;

    pagesContainer.querySelectorAll("[data-page]").forEach(function (button) {
        button.addEventListener("click", function () {
            sessionTablePage = Number(button.dataset.page) || 1;
            renderSessions();
        });
    });
}

function renderSessions() {
    const tbody = document.getElementById("sessionRows");
    const explanationPanel = document.getElementById("explanationPanel");
    const filteredSessions = getFilteredSessions();
    const totalSessions = dashboardState ? dashboardState.sessions.length : 0;
    const pageSize = getSessionPageSize();
    const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));

    sessionTablePage = Math.min(sessionTablePage, totalPages);
    sessionTablePage = Math.max(sessionTablePage, 1);

    const startOffset = (sessionTablePage - 1) * pageSize;
    const visibleSessions = filteredSessions.slice(startOffset, startOffset + pageSize);
    const startIndex = visibleSessions.length ? startOffset + 1 : 0;
    const endIndex = visibleSessions.length ? startOffset + visibleSessions.length : 0;

    renderActiveFilters(filteredSessions, totalSessions);
    renderSessionPagination(filteredSessions.length, totalPages, sessionTablePage, startIndex, endIndex, totalSessions);

    if (!filteredSessions.length) {
        selectedSessionId = null;
        tbody.innerHTML = "<tr><td colspan='9'>No session rows match the current filters.</td></tr>";
        explanationPanel.innerHTML = "<p class='empty-state'>No details to show for the current filter set.</p>";
        return;
    }

    tbody.innerHTML = visibleSessions.map(function (session) {
        const reasons = session.reasons.join(", ") || "none";
        return `
            <tr data-session="${encodeURIComponent(JSON.stringify(session))}" tabindex="0" role="button" aria-label="Inspect session ${session.session_id}" aria-pressed="false">
                <td>${escapeHtml(shortSessionId(session.session_id))}</td>
                <td>
                    <div class="table-date">
                        <strong>${escapeHtml(formatDateOnly(session.start_time))}</strong>
                        <small>${escapeHtml(formatShortTime(session.start_time))}</small>
                    </div>
                </td>
                <td><span class="pill ${session.actor_type}">${escapeHtml(session.actor_type)}</span></td>
                <td>${escapeHtml(formatLabel(session.bot_type))}</td>
                <td><span class="risk ${scoreBadge(session.rule_score)}">${session.rule_score}</span></td>
                <td><span class="risk ${scoreBadge(session.individual_bot_score)}">${session.individual_bot_score}</span></td>
                <td><span class="risk ${scoreBadge(session.coordination_score)}">${session.coordination_score}</span></td>
                <td><span class="risk ${scoreBadge(session.final_risk)}">${session.final_risk}</span></td>
                <td class="reasons-cell">${escapeHtml(reasons)}</td>
            </tr>
        `;
    }).join("");

    const rows = Array.from(tbody.querySelectorAll("tr[data-session]"));
    let openedSelectedRow = false;

    rows.forEach(function (row, index) {
        function openRow() {
            rows.forEach(function (candidate) {
                candidate.classList.remove("selected");
                candidate.setAttribute("aria-pressed", "false");
            });

            row.classList.add("selected");
            row.setAttribute("aria-pressed", "true");
            const payload = JSON.parse(decodeURIComponent(row.dataset.session));
            selectedSessionId = payload.session_id;
            renderSessionDetails(payload);
            openedSelectedRow = true;
        }

        row.addEventListener("click", openRow);
        row.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openRow();
            }
        });

        const payload = JSON.parse(decodeURIComponent(row.dataset.session));
        if (!openedSelectedRow && payload.session_id === selectedSessionId) {
            openRow();
        }

        if (index === 0 && !openedSelectedRow) {
            openRow();
        }
    });
}

function renderTimeline(timeline) {
    if (!timeline.length) {
        setEmptyState("timeline", "No timeline data available.");
        return;
    }

    const timelineMarkup = timeline.map(function (point) {
        const tone = point.label === "bot" ? "bot" : "human";
        const descriptor = point.bot_type === "none" ? point.label : point.bot_type;
        return `
            <div class="timeline-item ${tone}">
                <div>
                    <span>${shortSessionId(point.session_id)}</span>
                    <strong>${formatLabel(descriptor)}</strong>
                </div>
                <small>${formatDateOnly(point.start_time)} &middot; ${formatShortTime(point.start_time)} &middot; ${point.event_rate} events/s</small>
            </div>
        `;
    }).join("");

    document.getElementById("timeline").innerHTML = timelineMarkup;
    return;

    document.getElementById("timeline").innerHTML = timeline.map(function (point) {
        const tone = point.label === "bot" ? "bot" : "human";
        const descriptor = point.bot_type === "none" ? point.label : point.bot_type;
        return `
            <div class="timeline-item ${tone}">
                <div>
                    <span>${shortSessionId(point.session_id)}</span>
                    <strong>${formatLabel(descriptor)}</strong>
                </div>
                <small>${formatShortTime(point.start_time)} · ${point.event_rate} events/s</small>
            </div>
        `;
    }).join("");
}

function renderDemoStatus(status) {
    if (!status) {
        setEmptyState("demoStatus", "No demo status available.");
        return;
    }

    const preview = status.output_preview
        ? `<pre class="status-log">${escapeHtml(status.output_preview)}</pre>`
        : "";
    const detailRow = status.detail
        ? `<p class="status-detail">${escapeHtml(status.detail)}</p>`
        : "";
    const commandRow = status.failed_command
        ? `<div class="metric-row"><span>Command</span><strong>${escapeHtml(status.failed_command)}</strong></div>`
        : "";
    document.getElementById("demoStatus").innerHTML = `
        <div class="metric-row"><span>Action</span><strong>${formatLabel(status.action)}</strong></div>
        <div class="metric-row"><span>Status</span><strong><span class="pill ${status.status === "failed" ? "bot" : status.status === "running" ? "warning-pill" : "human"}">${status.status}</span></strong></div>
        <div class="metric-row"><span>Message</span><strong>${escapeHtml(status.message)}</strong></div>
        <div class="metric-row"><span>Updated</span><strong>${status.updated_at ? formatTimestamp(status.updated_at) : "n/a"}</strong></div>
        ${commandRow}
        ${detailRow}
        ${preview}
    `;
}

function updateDashboardTimestamp() {
    const label = document.getElementById("dashboardUpdatedAt");
    if (!label) {
        return;
    }
    label.textContent = "Last refreshed at " + new Date().toLocaleTimeString();
}

function renderAll(data) {
    dashboardState = data;
    renderSummary(data.summary);
    renderPosture(data.posture, data.summary);
    renderFeatureSummary(data.feature_summary);
    renderModelHealth(data.model_metrics || {});
    renderDataStatus(data.data_status || {});
    renderGroups(data.groups);
    renderTimeline(data.timeline);
    renderDistributions(data.sessions);
    renderDemoStatus(data.demo_status);
    renderSessions();
    updateDashboardTimestamp();
}

function setRefreshButtonState(isLoading) {
    const button = document.getElementById("refreshDashboardControl");
    if (!button) {
        return;
    }
    button.disabled = isLoading;
    button.textContent = isLoading ? "Refreshing..." : "Refresh Snapshot";
}

function refreshDashboard() {
    if (dashboardRequestInFlight) {
        return Promise.resolve();
    }

    dashboardRequestInFlight = true;
    setRefreshButtonState(true);

    return fetch("/api/dashboard")
        .then(parseJsonResponse)
        .then(function (data) {
            renderAll(data);
        })
        .catch(function (error) {
            const message = error && error.message ? error.message : "Dashboard data could not be loaded.";
            setEmptyState("postureCard", message);
            setEmptyState("modelHealth", message);
            setEmptyState("dataStatus", message);
            setEmptyState("featureSummary", message);
            setEmptyState("distributionChart", message);
            setEmptyState("riskChart", message);
            setEmptyState("groupAlerts", message);
            setEmptyState("timeline", message);
            setEmptyState("demoStatus", message);
            document.getElementById("summaryCards").innerHTML = "";
            document.getElementById("sessionRows").innerHTML = `<tr><td colspan='9'>${escapeHtml(message)}</td></tr>`;
            document.getElementById("explanationPanel").innerHTML = "<p class='empty-state'>Select a session row to view its strongest explanation details.</p>";
            document.getElementById("activeFilters").innerHTML = "";
            const tableMeta = document.getElementById("sessionTableMeta");
            if (tableMeta) {
                tableMeta.textContent = "0 of 0 sessions shown";
            }
        })
        .finally(function () {
            dashboardRequestInFlight = false;
            setRefreshButtonState(false);
        });
}

function setDemoButtonsDisabled(isDisabled) {
    document.querySelectorAll(".demo-action").forEach(function (button) {
        button.disabled = isDisabled;
    });
}

function bindDemoControls() {
    document.querySelectorAll(".demo-action").forEach(function (button) {
        button.addEventListener("click", function () {
            const action = button.dataset.action;
            const originalText = button.textContent;
            setDemoButtonsDisabled(true);
            button.textContent = "Running...";
            renderDemoStatus({
                action: action,
                status: "running",
                message: `Running ${formatLabel(action)}...`,
                detail: "This may take a moment while the browser runner and analytics pipeline finish.",
                updated_at: Date.now() / 1000,
                output_preview: "",
                failed_command: ""
            });

            fetch("/api/demo-action", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ action: action })
            })
                .then(parseJsonResponse)
                .then(function (payload) {
                    renderDemoStatus(payload);
                    return refreshDashboard();
                })
                .catch(function (error) {
                    renderDemoStatus({
                        action: action,
                        status: "failed",
                        message: error && error.message ? error.message : "The demo action could not be completed.",
                        detail: error && error.payload && error.payload.detail ? error.payload.detail : "The request did not finish cleanly, so the dashboard could not confirm the result.",
                        updated_at: Date.now() / 1000,
                        output_preview: error && error.payload && error.payload.output ? error.payload.output : "",
                        failed_command: error && error.payload && error.payload.failed_command ? error.payload.failed_command : ""
                    });
                })
                .finally(function () {
                    setDemoButtonsDisabled(false);
                    button.textContent = originalText;
                });
        });
    });
}

function bindTableControls() {
    ["sessionFilter", "sessionSearch", "sessionSort", "sessionPageSize"].forEach(function (id) {
        const element = document.getElementById(id);
        if (!element) {
            return;
        }
        element.addEventListener("input", function () {
            sessionTablePage = 1;
            renderSessions();
        });
        element.addEventListener("change", function () {
            sessionTablePage = 1;
            renderSessions();
        });
    });

    const prevButton = document.getElementById("sessionPrevPage");
    const nextButton = document.getElementById("sessionNextPage");

    if (prevButton) {
        prevButton.addEventListener("click", function () {
            sessionTablePage = Math.max(1, sessionTablePage - 1);
            renderSessions();
        });
    }

    if (nextButton) {
        nextButton.addEventListener("click", function () {
            sessionTablePage += 1;
            renderSessions();
        });
    }
}

function syncAutoRefresh() {
    if (autoRefreshHandle) {
        window.clearInterval(autoRefreshHandle);
        autoRefreshHandle = null;
    }

    const toggle = document.getElementById("autoRefreshToggle");
    if (toggle && toggle.checked) {
        autoRefreshHandle = window.setInterval(function () {
            refreshDashboard();
        }, 30000);
    }
}

function bindDashboardControls() {
    const refreshButton = document.getElementById("refreshDashboardControl");
    const autoRefreshToggle = document.getElementById("autoRefreshToggle");

    if (refreshButton) {
        refreshButton.addEventListener("click", function () {
            refreshDashboard();
        });
    }

    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener("change", syncAutoRefresh);
    }
}

refreshDashboard().finally(function () {
    bindDemoControls();
    bindTableControls();
    bindDashboardControls();
    syncAutoRefresh();
});

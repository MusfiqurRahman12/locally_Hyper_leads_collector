/**
 * popup.js — UI state management, real-time counters, state-wide neighborhood queue,
 * message routing, CSV export.
 *
 * Runs inside the extension popup (popup.html).
 * Leads are always read from chrome.storage.local as the source of truth.
 */

(() => {
  "use strict";

  // ─── DOM References ─────────────────────────────────────────────────────────────

  const $statusDot = document.getElementById("statusDot");
  const $statusLabel = document.getElementById("statusLabel");
  const $noticeBanner = document.getElementById("noticeBanner");
  const $noticeText = document.getElementById("noticeText");
  const $qualifiedCount = document.getElementById("qualifiedCount");
  const $rejectedCount = document.getElementById("rejectedCount");
  const $totalCount = document.getElementById("totalCount");
  const $previewContainer = document.getElementById("previewContainer");

  // Settings
  const $settingsToggle = document.getElementById("settingsToggle");
  const $settingsBody = document.getElementById("settingsBody");
  const $websiteFilterGroup = document.getElementById("websiteFilterGroup");
  const $autoHopCities = document.getElementById("autoHopCities");
  const $cityHopSettings = document.getElementById("cityHopSettings");
  const $stateSelect = document.getElementById("stateSelect");
  const $tradeKeyword = document.getElementById("tradeKeyword");
  const $queueSummary = document.getElementById("queueSummary");
  const $customCitiesInput = document.getElementById("customCitiesInput");

  const $minReviews = document.getElementById("minReviews");
  const $maxReviews = document.getElementById("maxReviews");
  const $minRating = document.getElementById("minRating");
  const $maxRating = document.getElementById("maxRating");
  const $targetLeads = document.getElementById("targetLeads");
  const $generateDemoLink = document.getElementById("generateDemoLink");
  const $demoUrlRow = document.getElementById("demoUrlRow");
  const $demoBaseUrl = document.getElementById("demoBaseUrl");
  const $deepCardPeek = document.getElementById("deepCardPeek");
  const $syncApiUrl = document.getElementById("syncApiUrl");

  // Controls
  const $controlsIdle = document.getElementById("controlsIdle");
  const $controlsRunning = document.getElementById("controlsRunning");
  const $controlsDone = document.getElementById("controlsDone");
  const $btnStart = document.getElementById("btnStart");
  const $btnPause = document.getElementById("btnPause");
  const $btnStop = document.getElementById("btnStop");
  const $btnExport = document.getElementById("btnExport");
  const $btnSyncLocal = document.getElementById("btnSyncLocal");
  const $btnContinue = document.getElementById("btnContinue");
  const $btnRestart = document.getElementById("btnRestart");

  // ─── State ──────────────────────────────────────────────────────────────────────

  let currentStatus = "idle";
  let activeWebsiteFilter = "all";
  let qualifiedLeads = [];
  let latestLeads = []; // last 3

  // ─── Settings Toggle ───────────────────────────────────────────────────────────

  if ($settingsToggle && $settingsBody) {
    $settingsToggle.addEventListener("click", () => {
      $settingsToggle.classList.toggle("open");
      $settingsBody.classList.toggle("open");
    });
  }

  // Website Filter Toggle Handlers
  if ($websiteFilterGroup) {
    $websiteFilterGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".segment-btn");
      if (!btn) return;
      setWebsiteFilter(btn.dataset.filter);
      saveSettings();
    });
  }

  function setWebsiteFilter(filter) {
    activeWebsiteFilter = filter || "all";
    if ($websiteFilterGroup) {
      const btns = $websiteFilterGroup.querySelectorAll(".segment-btn");
      btns.forEach((b) => {
        b.classList.toggle("active", b.dataset.filter === activeWebsiteFilter);
      });
    }
  }

  // ─── Auto-Hop & Neighborhood Queue Handlers ─────────────────────────────────────

  if ($autoHopCities) {
    $autoHopCities.addEventListener("change", () => {
      if ($cityHopSettings) {
        $cityHopSettings.classList.toggle("hidden", !$autoHopCities.checked);
      }
      saveSettings();
    });
  }

  if ($stateSelect) {
    $stateSelect.addEventListener("change", () => {
      updateQueueSummary();
      saveSettings();
    });
  }

  if ($customCitiesInput) {
    $customCitiesInput.addEventListener("input", () => {
      saveSettings();
    });
  }

  if ($tradeKeyword) {
    $tradeKeyword.addEventListener("input", () => {
      saveSettings();
    });
  }

  function updateQueueSummary() {
    if (!$stateSelect || !$queueSummary) return;
    const st = $stateSelect.value;
    if (st === "CUSTOM") {
      $queueSummary.classList.add("hidden");
      if ($customCitiesInput) $customCitiesInput.classList.remove("hidden");
    } else {
      if ($customCitiesInput) $customCitiesInput.classList.add("hidden");
      $queueSummary.classList.remove("hidden");
      const cities = typeof getCitiesForState === "function" ? getCitiesForState(st) : [];
      const preview = cities.slice(0, 6).join(", ");
      const remaining = cities.length > 6 ? ` + ${cities.length - 6} more` : "";
      $queueSummary.innerHTML = `<span>📍 <strong>Queued (${cities.length} Cities):</strong> ${preview}${remaining}</span>`;
    }
  }

  // Demo Link Toggle
  if ($generateDemoLink) {
    $generateDemoLink.addEventListener("change", () => {
      if ($demoUrlRow) {
        $demoUrlRow.classList.toggle("hidden", !$generateDemoLink.checked);
      }
      saveSettings();
    });
  }

  // ─── Load Saved Settings ────────────────────────────────────────────────────────

  chrome.storage.local.get("scraperSettings", (data) => {
    if (data.scraperSettings) {
      const s = data.scraperSettings;
      if (s.websiteFilter) setWebsiteFilter(s.websiteFilter);
      if (s.autoHopCities != null && $autoHopCities) {
        $autoHopCities.checked = s.autoHopCities;
        if ($cityHopSettings) $cityHopSettings.classList.toggle("hidden", !s.autoHopCities);
      }
      if (s.stateCode && $stateSelect) {
        $stateSelect.value = s.stateCode;
      }
      if (s.tradeKeyword && $tradeKeyword) {
        $tradeKeyword.value = s.tradeKeyword;
      }
      if (s.customCities && $customCitiesInput) {
        $customCitiesInput.value = s.customCities;
      }
      if (s.minReviews != null && $minReviews) $minReviews.value = s.minReviews;
      if (s.maxReviews != null && $maxReviews) $maxReviews.value = s.maxReviews;
      if (s.minRating != null && $minRating) $minRating.value = s.minRating;
      if (s.maxRating != null && $maxRating) $maxRating.value = s.maxRating;
      if (s.targetLeads != null && $targetLeads) $targetLeads.value = s.targetLeads;
      if (s.generateDemoLink != null && $generateDemoLink) {
        $generateDemoLink.checked = s.generateDemoLink;
        if ($demoUrlRow) $demoUrlRow.classList.toggle("hidden", !s.generateDemoLink);
      }
      if (s.demoBaseUrl && $demoBaseUrl) $demoBaseUrl.value = s.demoBaseUrl;
      if (s.deepCardPeek != null && $deepCardPeek) $deepCardPeek.checked = s.deepCardPeek;
      if (s.syncApiUrl && $syncApiUrl) $syncApiUrl.value = s.syncApiUrl;
    }
    updateQueueSummary();
  });

  if ($deepCardPeek) {
    $deepCardPeek.addEventListener("change", saveSettings);
  }
  if ($syncApiUrl) {
    $syncApiUrl.addEventListener("input", saveSettings);
  }
  if ($demoBaseUrl) {
    $demoBaseUrl.addEventListener("input", saveSettings);
  }
  if ($minReviews) $minReviews.addEventListener("input", saveSettings);
  if ($maxReviews) $maxReviews.addEventListener("input", saveSettings);
  if ($minRating) $minRating.addEventListener("input", saveSettings);
  if ($maxRating) $maxRating.addEventListener("input", saveSettings);
  if ($targetLeads) $targetLeads.addEventListener("input", saveSettings);

  function getSettings() {
    const isCustom = $stateSelect && $stateSelect.value === "CUSTOM";
    let queue = [];
    if (isCustom && $customCitiesInput) {
      queue = $customCitiesInput.value
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    } else {
      const st = $stateSelect ? $stateSelect.value : "AL";
      queue = typeof getCitiesForState === "function" ? getCitiesForState(st) : ["Birmingham", "Huntsville", "Mobile"];
    }

    return {
      websiteFilter: activeWebsiteFilter,
      autoHopCities: $autoHopCities ? $autoHopCities.checked : true,
      stateCode: $stateSelect ? $stateSelect.value : "AL",
      tradeKeyword: $tradeKeyword ? ($tradeKeyword.value.trim() || "Electrician") : "Electrician",
      cityQueue: queue,
      customCities: $customCitiesInput ? $customCitiesInput.value : "",
      minReviews: $minReviews ? (parseInt($minReviews.value, 10) || 8) : 8,
      maxReviews: $maxReviews ? (parseInt($maxReviews.value, 10) || 65) : 65,
      minRating: $minRating ? (parseFloat($minRating.value) || 3.5) : 3.5,
      maxRating: $maxRating ? (parseFloat($maxRating.value) || 5.0) : 5.0,
      targetLeads: $targetLeads ? (parseInt($targetLeads.value, 10) || 200) : 200,
      generateDemoLink: $generateDemoLink ? $generateDemoLink.checked : false,
      demoBaseUrl: ($demoBaseUrl && $demoBaseUrl.value.trim()) || "https://demo.jtechagency.com/",
      deepCardPeek: $deepCardPeek ? $deepCardPeek.checked : true,
      syncApiUrl: ($syncApiUrl && $syncApiUrl.value.trim()) || "http://localhost:8005/api/v1/prospects/batch"
    };
  }

  function saveSettings() {
    chrome.storage.local.set({ scraperSettings: getSettings() });
  }

  // ─── Storage-Based Lead Loading ────────────────────────────────────────────────

  function loadLeadsFromStorage(callback) {
    chrome.storage.local.get("jtechLeads", (data) => {
      if (data.jtechLeads) {
        const saved = data.jtechLeads;
        qualifiedLeads = saved.qualified || [];
        const rejectedCount = (saved.rejected || []).length;
        const totalFound = (saved.scrapedKeys || []).length;

        updateCounters({
          qualifiedFound: qualifiedLeads.length,
          rejectedCount: rejectedCount,
          totalFound: totalFound
        });

        latestLeads = qualifiedLeads.slice(-3).reverse();
        renderPreview();
      }
      if (callback) callback();
    });
  }

  // ─── UI State Machine ──────────────────────────────────────────────────────────

  function setUIState(status, note = "") {
    currentStatus = status;

    $statusDot.className = "status-dot " + status;

    const labels = {
      idle: "Idle — Ready to scrape",
      scraping: "Scraping — Extracting leads…",
      paused: "Paused — Click resume to continue",
      panning: "Advancing to next neighborhood…",
      complete: "Complete — Leads ready to export",
      error: "Error — Check Maps tab"
    };
    $statusLabel.textContent = note || labels[status] || status;

    if (note && (status === "panning" || status === "paused" || status === "complete" || status === "scraping")) {
      $noticeText.textContent = note;
      $noticeBanner.classList.remove("hidden");
    } else {
      $noticeBanner.classList.add("hidden");
    }

    $controlsIdle.classList.toggle("hidden", status !== "idle");
    $controlsRunning.classList.toggle(
      "hidden",
      status !== "scraping" && status !== "paused" && status !== "panning"
    );
    $controlsDone.classList.toggle("hidden", status !== "complete");

    if (status === "paused") {
      $btnPause.textContent = "▶ Resume";
    } else {
      $btnPause.textContent = "⏸ Pause";
    }

    const inputs = $settingsBody.querySelectorAll("input, select, textarea, button.segment-btn");
    inputs.forEach((input) => {
      input.disabled = status === "scraping" || status === "paused" || status === "panning";
    });
  }

  // ─── Counter Updates ───────────────────────────────────────────────────────────

  function updateCounters(data) {
    if (data.qualifiedFound != null) {
      $qualifiedCount.textContent = data.qualifiedFound;
    }
    if (data.rejectedCount != null) {
      $rejectedCount.textContent = data.rejectedCount;
    }
    if (data.totalFound != null) {
      $totalCount.textContent = data.totalFound;
    }
  }

  // ─── Preview Rendering ─────────────────────────────────────────────────────────

  function addToPreview(lead) {
    latestLeads.unshift(lead);
    if (latestLeads.length > 3) latestLeads.pop();
    renderPreview();
  }

  function renderPreview() {
    if (latestLeads.length === 0) {
      $previewContainer.innerHTML =
        '<div class="preview-empty">No leads yet — start scraping on a Google Maps search page</div>';
      return;
    }

    $previewContainer.innerHTML = latestLeads
      .map((lead) => {
        const oppClass = getOpportunityTagClass(lead.opportunityStatus);
        return `
          <div class="lead-card">
            <div class="lead-title">${escapeHtml(lead.title)}</div>
            <div class="lead-meta">
              <span class="lead-tag tag-blue">★ ${lead.rating || "?"}</span>
              <span class="lead-tag tag-blue">${lead.reviews || "?"} rev</span>
              <span class="lead-tag ${oppClass}">${escapeHtml(lead.opportunityStatus || "Unknown")}</span>
            </div>
            <div class="lead-meta" style="margin-top:4px;">
              <span style="color:var(--text-muted);font-size:11px;">${escapeHtml(lead.phone || "No Phone")}</span>
              <span style="color:var(--text-muted);font-size:11px;">${escapeHtml(lead.category || "—")}</span>
              ${lead.city ? `<span style="color:var(--text-muted);font-size:11px;">📍 ${escapeHtml(lead.city)}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function getOpportunityTagClass(status) {
    if (!status) return "tag-blue";
    if (status.includes("Missing")) return "tag-red";
    if (status.includes("Social") || status.includes("Free")) return "tag-amber";
    return "tag-green";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str || ""));
    return div.innerHTML;
  }

  // ─── Message Handling ──────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "STATUS_UPDATE") return;

    updateCounters(msg);

    if (msg.status) {
      setUIState(msg.status, msg.note || "");
    }

    if (msg.latestLead) {
      addToPreview(msg.latestLead);
    }

    if (msg.error) {
      $statusLabel.textContent = `Error: ${msg.error}`;
    }
  });

  // ─── Send Message to Content Script ─────────────────────────────────────────────

  function isMapsUrl(url) {
    if (!url) return false;
    return url.includes("google.com/maps") || url.includes("maps.google.") || url.includes("/maps");
  }

  function sendToContent(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        setUIState("error", "Error: No active browser tab found");
        return;
      }
      const tab = tabs[0];
      if (!isMapsUrl(tab.url)) {
        setUIState("error", "Error: Please open Google Maps in this tab first");
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Direct message failed, executing script injection:", chrome.runtime.lastError.message);
          chrome.scripting.executeScript(
            {
              target: { tabId: tab.id },
              files: ["rules.js", "content.js"]
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("Script injection failed:", chrome.runtime.lastError.message);
                setUIState("error", "Please reload Google Maps tab once");
                if (message.type === "GET_LEADS" || message.type === "GET_STATUS") {
                  loadLeadsFromStorage(() => {
                    if (callback) callback({ ok: true, fromStorage: true });
                  });
                }
                return;
              }
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, message, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    console.warn("Retry failed:", chrome.runtime.lastError.message);
                    setUIState("error", "Please refresh Google Maps tab once");
                    if (message.type === "GET_LEADS" || message.type === "GET_STATUS") {
                      loadLeadsFromStorage(() => {
                        if (callback) callback({ ok: true, fromStorage: true });
                      });
                    }
                    return;
                  }
                  if (callback) callback(retryResponse);
                });
              }, 400);
            }
          );
          return;
        }
        if (callback) callback(response);
      });
    });
  }

  // ─── Button Handlers ───────────────────────────────────────────────────────────

  $btnStart.addEventListener("click", () => {
    latestLeads = [];
    renderPreview();
    const settings = getSettings();
    saveSettings();
    setUIState("scraping", "Connecting to Google Maps…");
    sendToContent({ type: "START_SCRAPING", settings, keepExisting: false }, (res) => {
      if (res && res.ok) {
        setUIState("scraping");
      }
    });
  });

  $btnPause.addEventListener("click", () => {
    if (currentStatus === "paused") {
      sendToContent({ type: "RESUME_SCRAPING" }, () => {
        setUIState("scraping");
      });
    } else {
      sendToContent({ type: "PAUSE_SCRAPING" }, () => {
        setUIState("paused");
        loadLeadsFromStorage();
      });
    }
  });

  $btnStop.addEventListener("click", () => {
    sendToContent({ type: "STOP_SCRAPING" }, () => {
      loadLeadsFromStorage(() => {
        setUIState(qualifiedLeads.length > 0 ? "complete" : "idle");
      });
    });
  });

  $btnContinue.addEventListener("click", () => {
    const settings = getSettings();
    saveSettings();
    sendToContent({ type: "START_SCRAPING", settings, keepExisting: true }, (res) => {
      if (res && res.ok) {
        setUIState("scraping", "Continuing search in next area…");
      }
    });
  });

  $btnExport.addEventListener("click", () => {
    loadLeadsFromStorage(() => {
      exportCSV(qualifiedLeads);
    });
  });

  if ($btnSyncLocal) {
    $btnSyncLocal.addEventListener("click", () => {
      loadLeadsFromStorage(() => {
        syncLeadsToLocalBackend(qualifiedLeads);
      });
    });
  }

  async function syncLeadsToLocalBackend(leads) {
    if (!leads || leads.length === 0) {
      $statusLabel.textContent = "No qualified leads to sync";
      return;
    }

    const settings = getSettings();
    const apiUrl = settings.syncApiUrl || "http://localhost:8005/api/v1/prospects/batch";

    $btnSyncLocal.disabled = true;
    $btnSyncLocal.textContent = "⏳ Syncing...";
    $statusLabel.textContent = `Syncing ${leads.length} leads to Local Finder...`;

    try {
      const payload = {
        prospects: leads.map((l) => ({
          name: l.title || "Unknown Business",
          phone: l.phone || null,
          website: l.website || null,
          address: l.address || null,
          city: l.city || null,
          state: settings.stateCode || "AL",
          category: l.category || settings.tradeKeyword || "Trade",
          google_rating: l.rating != null ? l.rating : null,
          review_count: l.reviews != null ? l.reviews : null,
          business_status: "OPERATIONAL",
          data_source: "gmaps_extension",
          description: l.opportunityStatus ? `Status: ${l.opportunityStatus}` : null
        })),
        auto_audit: true
      };

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`API status ${res.status}: ${errorText.slice(0, 100)}`);
      }

      const result = await res.json();
      const createdCount = result.prospects_created ?? result.created ?? leads.length;
      const existingCount = result.prospects_existing ?? result.existing ?? 0;

      $statusLabel.textContent = `✓ Synced ${createdCount} leads into Local Finder!`;
      if ($noticeBanner && $noticeText) {
        $noticeText.innerHTML = `✓ Synced <strong>${createdCount}</strong> new leads (${existingCount} duplicates skipped). <br>Check dashboard at <a href="http://localhost:3000/dashboard" target="_blank" style="color:var(--accent-light);">localhost:3000/dashboard</a>`;
        $noticeBanner.classList.remove("hidden");
      }
      $btnSyncLocal.textContent = "✓ Synced!";
      setTimeout(() => {
        $btnSyncLocal.textContent = "🚀 Sync to Local Finder";
        $btnSyncLocal.disabled = false;
      }, 4000);
    } catch (err) {
      console.error("[J-Tech Scraper] Sync error:", err);
      $statusLabel.textContent = "Sync failed: Connection refused";
      if ($noticeBanner && $noticeText) {
        $noticeText.textContent = `Sync failed: Could not reach ${apiUrl}. Make sure Local Prospect Finder backend is running.`;
        $noticeBanner.classList.remove("hidden");
      }
      $btnSyncLocal.textContent = "⚠️ Sync Failed";
      setTimeout(() => {
        $btnSyncLocal.textContent = "🚀 Sync to Local Finder";
        $btnSyncLocal.disabled = false;
      }, 3000);
    }
  }

  $btnRestart.addEventListener("click", () => {
    latestLeads = [];
    qualifiedLeads = [];
    updateCounters({ qualifiedFound: 0, rejectedCount: 0, totalFound: 0 });
    renderPreview();
    chrome.storage.local.remove("jtechLeads");
    setUIState("idle");
  });

  // ─── CSV Export ─────────────────────────────────────────────────────────────────

  function exportCSV(leads) {
    if (!leads || leads.length === 0) {
      $statusLabel.textContent = "No qualified leads to export";
      return;
    }

    const settings = getSettings();
    const includeDemo = settings.generateDemoLink;

    const headers = [
      "Business Name",
      "Phone",
      "Rating",
      "Reviews",
      "Category",
      "City",
      "Website",
      "Opportunity_Status"
    ];

    if (includeDemo) {
      headers.push("Demo_Pitch_URL");
    }

    const rows = leads.map((l) => {
      const row = [
        csvEscape(l.title),
        csvEscape(l.phone),
        l.rating != null ? l.rating : "",
        l.reviews != null ? l.reviews : "",
        csvEscape(l.category),
        csvEscape(l.city),
        csvEscape(l.website),
        csvEscape(l.opportunityStatus)
      ];
      if (includeDemo) {
        row.push(csvEscape(l.demoUrl || ""));
      }
      return row;
    });

    const csvContent =
      "\uFEFF" +
      headers.join(",") +
      "\n" +
      rows.map((r) => r.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);

    chrome.downloads.download(
      {
        url: url,
        filename: `jtech-leads-${timestamp}.csv`,
        saveAs: true
      },
      () => {
        URL.revokeObjectURL(url);
        $statusLabel.textContent = `Exported ${leads.length} leads ✓`;
      }
    );
  }

  function csvEscape(val) {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // ─── Init: Restore state from storage + sync with content script ───────────────

  loadLeadsFromStorage(() => {
    if (qualifiedLeads.length > 0) {
      setUIState("complete");
    }

    sendToContent({ type: "GET_STATUS" }, (res) => {
      if (res && res.ok && !res.fromStorage) {
        updateCounters(res);
        setUIState(res.status || (qualifiedLeads.length > 0 ? "complete" : "idle"), res.note || "");
      }
    });
  });
})();

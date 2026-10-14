/**
 * content.js — Non-destructive DOM scraper, continuous auto-scroll engine,
 * state-wide multi-neighborhood queue engine, multi-area auto-pan expansion,
 * filter validator.
 *
 * Runs strictly inside Google Maps feed (div[role="feed"]).
 * Automatically hops from neighborhood to neighborhood across Alabama (or any state)
 * until target leads (e.g. 200) are fully gathered.
 *
 * All scraped leads are persisted to chrome.storage.local so they survive
 * across neighborhood transitions and browser sessions.
 */

(() => {
  "use strict";

  // ─── Re-injection handler ──────────────────────────────────────────────────────
  if (window.__jtechScraperLoaded) {
    console.log("[J-Tech Scraper] Content script refreshed / re-injected.");
  }
  window.__jtechScraperLoaded = true;

  // ─── State ──────────────────────────────────────────────────────────────────────

  let isRunning = false;
  let isPaused = false;
  let isPanning = false;
  let autoPanAttempts = 0;
  const MAX_AUTO_PAN_ATTEMPTS = 4;

  let scrapedSet = new Set();          // deduplication keys
  let qualifiedLeads = [];
  let rejectedLeads = [];
  let scrollStaleCount = 0;
  let settings = Object.assign({}, DEFAULT_SETTINGS);

  // Neighborhood Queue State
  let cityQueue = [];
  let currentCityIndex = 0;
  let activeCity = "";
  let tradeKeyword = "Electrician";

  // ─── Persistence Helpers ────────────────────────────────────────────────────────

  function persistLeads() {
    chrome.storage.local.set({
      jtechLeads: {
        qualified: qualifiedLeads,
        rejected: rejectedLeads,
        scrapedKeys: Array.from(scrapedSet),
        isRunning: isRunning,
        isPaused: isPaused,
        currentCityIndex: currentCityIndex,
        timestamp: Date.now()
      }
    });
  }

  function restoreLeads() {
    return new Promise((resolve) => {
      chrome.storage.local.get("jtechLeads", (data) => {
        if (data.jtechLeads) {
          const saved = data.jtechLeads;
          qualifiedLeads = saved.qualified || [];
          rejectedLeads = saved.rejected || [];
          if (saved.scrapedKeys) {
            scrapedSet = new Set(saved.scrapedKeys);
          }
          if (saved.currentCityIndex != null) {
            currentCityIndex = saved.currentCityIndex;
          }
          console.log(
            `[J-Tech Scraper] Restored ${qualifiedLeads.length} qualified, ` +
            `${rejectedLeads.length} rejected leads from storage.`
          );
        }
        resolve();
      });
    });
  }

  function clearPersistedLeads() {
    chrome.storage.local.remove("jtechLeads");
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function randomInterval(min = 1000, max = 1600) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pushStatus(extra = {}) {
    try {
      chrome.runtime.sendMessage({
        type: "STATUS_UPDATE",
        totalFound: scrapedSet.size,
        qualifiedFound: qualifiedLeads.length,
        rejectedCount: rejectedLeads.length,
        status: isRunning ? (isPaused ? "paused" : (isPanning ? "panning" : "scraping")) : "idle",
        ...extra
      });
    } catch (e) {
      // Popup may be closed — leads are safely in storage
    }
  }

  // ─── Auto-Recovery to Feed & Multi-Selector Detection ───────────────────────────

  function getResultsFeed() {
    // 1. Direct role=feed (standard Google Maps)
    const byRole = document.querySelector('div[role="feed"]');
    if (byRole) return byRole;

    // 2. Container holding Nv2PK listing cards
    const card = document.querySelector('div.Nv2PK');
    if (card) {
      const parentFeed = card.closest('div[role="feed"]') || card.closest('.m6QErb') || card.parentElement;
      if (parentFeed) return parentFeed;
    }

    // 3. By aria-label container
    const byAria = document.querySelector('div[aria-label*="Results for" i], div[aria-label*="Results" i]');
    if (byAria) return byAria;

    // 4. Scrollable search results panel
    const m6Panel = document.querySelector('div.m6QErb.DsmM0c, div.m6QErb[role="region"]');
    if (m6Panel) return m6Panel;

    return null;
  }

  async function ensureSearchResultsFeed(maxWaitMs = 5000) {
    let feed = getResultsFeed();
    if (feed) return feed;

    if (window.location.href.includes("/place/") && !document.querySelector('div.Nv2PK')) {
      console.log("[J-Tech Scraper] Stuck on single place page. Navigating back to search feed...");
      pushStatus({ status: "scraping", note: "Returning to search results feed…" });

      const backBtn =
        document.querySelector('button[aria-label="Back"]') ||
        document.querySelector('button[aria-label*="Back to" i]') ||
        document.querySelector('button[aria-label*="search results" i]') ||
        document.querySelector('button[jsaction*="back"]') ||
        document.querySelector('button.hYBOP') ||
        document.querySelector('button.S9kvxf');

      if (backBtn) {
        backBtn.click();
      } else {
        window.history.back();
      }
    }

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await sleep(350);
      feed = getResultsFeed();
      if (feed && (feed.children.length > 0 || document.querySelector('div.Nv2PK'))) {
        return feed;
      }
    }

    return getResultsFeed();
  }

  // ─── Search Execution (Guaranteed Navigation) ──────────────────────────────────

  async function executeNewSearch(searchQuery) {
    console.log(`[J-Tech Scraper] Executing search: "${searchQuery}"`);
    persistLeads();
    window.location.href = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}/`;
    await sleep(3000);
    return true;
  }

  // ─── In-Feed Data Extraction ───────────────────────────────────────────────────

  function parseRatingReviews(text) {
    const result = { rating: null, reviews: null };
    if (!text) return result;

    const ratingMatch = text.match(/([0-9]\.[0-9])/);
    if (ratingMatch) result.rating = parseFloat(ratingMatch[1]);

    let reviewMatch = text.match(/\(([0-9,]+)\)/);
    if (!reviewMatch) {
      reviewMatch = text.match(/([0-9,]+)\s+reviews?/i);
    }
    if (reviewMatch) {
      result.reviews = parseInt(reviewMatch[1].replace(/,/g, ""), 10);
    }

    return result;
  }

  function extractCityFromSearchQuery() {
    if (activeCity) return activeCity;
    const searchInput = document.querySelector("input#searchboxinput");
    if (searchInput && searchInput.value) {
      const val = searchInput.value;
      const inMatch = val.match(/in\s+([A-Za-z\s,]+)$/i);
      if (inMatch) return inMatch[1].trim().split(",")[0].trim();
      const commaMatch = val.match(/,\s*([A-Za-z\s]+)$/i);
      if (commaMatch) return commaMatch[1].trim();
    }
    return "";
  }

  function extractFromCard(card) {
    const lead = {
      title: "",
      rating: null,
      reviews: null,
      category: "",
      phone: "",
      website: "",
      city: extractCityFromSearchQuery()
    };

    // 1. Business Name
    const titleEl =
      card.querySelector(".qBF1Pd") ||
      card.querySelector("div.fontHeadlineSmall") ||
      card.querySelector("a.hfpxzc") ||
      card.querySelector("a[aria-label]");
    if (titleEl) {
      lead.title =
        titleEl.textContent.trim() ||
        titleEl.getAttribute("aria-label") ||
        "";
    }

    // 2. Rating & Reviews
    const ratingEl = card.querySelector(".MW4etd");
    if (ratingEl) {
      const r = parseFloat(ratingEl.textContent.trim());
      if (!isNaN(r)) lead.rating = r;
    }

    const reviewsEl = card.querySelector(".UY7F9");
    if (reviewsEl) {
      const cleanRev = reviewsEl.textContent.replace(/[(),]/g, "").trim();
      const n = parseInt(cleanRev, 10);
      if (!isNaN(n)) lead.reviews = n;
    }

    if (lead.rating === null || lead.reviews === null) {
      const ratingSpan = card.querySelector('span[role="img"], span[aria-label*="star" i]');
      if (ratingSpan) {
        const ariaLabel = ratingSpan.getAttribute("aria-label") || "";
        const parsed = parseRatingReviews(ariaLabel);
        if (lead.rating === null && parsed.rating !== null) lead.rating = parsed.rating;
        if (lead.reviews === null && parsed.reviews !== null) lead.reviews = parsed.reviews;
      }
    }

    if (lead.rating === null || lead.reviews === null) {
      const parsed = parseRatingReviews(card.textContent || "");
      if (lead.rating === null && parsed.rating !== null) lead.rating = parsed.rating;
      if (lead.reviews === null && parsed.reviews !== null) lead.reviews = parsed.reviews;
    }

    // 3. Category
    const infoSpans = card.querySelectorAll(".W4Efsd span, .fontBodyMedium span, .ZY2yge");
    for (const el of infoSpans) {
      let t = el.textContent.trim();
      if (!t) continue;
      if (t.includes("·")) {
        t = t.split("·")[0].trim();
      }
      if (
        t &&
        !t.match(/^[0-9]/) &&
        !t.match(/^\(/) &&
        !t.includes("$") &&
        !t.toLowerCase().includes("closed") &&
        !t.toLowerCase().includes("open") &&
        !t.toLowerCase().includes("hours") &&
        t.length >= 2 &&
        t.length < 50
      ) {
        lead.category = t;
        break;
      }
    }

    // 4. Phone Extraction (Directly from Card)
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

    const telLink = card.querySelector('a[href^="tel:"]');
    if (telLink && telLink.href) {
      lead.phone = telLink.href.replace("tel:", "").trim();
    }

    if (!lead.phone) {
      const phoneBtn = card.querySelector(
        'button[data-tooltip*="phone" i], button[aria-label*="Phone" i], [aria-label*="phone" i]'
      );
      if (phoneBtn) {
        const pLabel = phoneBtn.getAttribute("aria-label") || phoneBtn.textContent || "";
        const m = pLabel.match(phoneRegex);
        if (m) lead.phone = m[0];
      }
    }

    if (!lead.phone) {
      for (const el of infoSpans) {
        const text = el.textContent.trim();
        const m = text.match(phoneRegex);
        if (m) {
          lead.phone = m[0];
          break;
        }
      }
    }

    if (!lead.phone) {
      const match = (card.textContent || "").match(phoneRegex);
      if (match) lead.phone = match[0];
    }

    // 5. Website link on card (handles regular links and google.com/url?q= redirects)
    const websiteLink =
      card.querySelector('a.lcr4fd, a[data-value="Website"], a[aria-label*="website" i], a[data-tooltip*="website" i]') ||
      card.querySelector('a[href*="/url?q="]') ||
      card.querySelector('a[href^="http"]:not([href*="google."])');
    if (websiteLink && websiteLink.href) {
      let rawHref = websiteLink.href;
      if (rawHref.includes("/url?q=")) {
        const qMatch = rawHref.match(/[?&]q=([^&]+)/);
        if (qMatch) rawHref = decodeURIComponent(qMatch[1]);
      }
      if (!rawHref.includes("google.com/maps") && !rawHref.includes("google.com/search")) {
        lead.website = rawHref;
      }
    }

    // 6. Address extraction
    const allSpans = card.querySelectorAll('.W4Efsd span, .W4Efsd');
    for (const span of allSpans) {
      const txt = span.textContent.trim();
      if (txt && !lead.address && txt.includes(',') && !txt.match(/^[0-9]\.[0-9]/) && !txt.includes('(')) {
        lead.address = txt;
        break;
      }
    }

    // 7. Maps URL
    const mapsLink = card.querySelector('a.hfpxzc, a[href*="/maps/place/"]');
    if (mapsLink && mapsLink.href) {
      lead.maps_url = mapsLink.href;
    }

    return lead;
  }

  // ─── Multi-Area Auto-Pan & Expansion ──────────────────────────────────────────

  function findSearchAreaButton() {
    const byAria = document.querySelector(
      'button[aria-label*="Search this area" i], button[aria-label*="Search here" i]'
    );
    if (byAria) return byAria;

    const byData = document.querySelector('button[data-value*="Search this area" i]');
    if (byData) return byData;

    const overlayButtons = document.querySelectorAll(
      'div.vz7TIf button, div.S9kvxf button, .widget-scene button, button.u7XFff, .m6QErb button'
    );
    for (const btn of overlayButtons) {
      const t = (btn.textContent || "").toLowerCase().trim();
      if (t.includes("search this area") || t.includes("search here")) {
        return btn;
      }
    }

    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      const t = (btn.textContent || "").toLowerCase().trim();
      if (t === "search this area" || t === "search here") {
        return btn;
      }
    }

    return null;
  }

  async function simulateMapPan(dx = -280, dy = 0) {
    const scene =
      document.querySelector("canvas.widget-scene-canvas") ||
      document.querySelector("div#scene") ||
      document.querySelector("div.widget-scene") ||
      document.querySelector('div[role="region"]');

    if (!scene) return false;

    const rect = scene.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const endX = startX + dx;
    const endY = startY + dy;

    try {
      scene.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, clientX: startX, clientY: startY, button: 0
      }));
      await sleep(80);

      scene.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true, cancelable: true, clientX: endX, clientY: endY, button: 0
      }));
      await sleep(120);

      scene.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true, cancelable: true, clientX: endX, clientY: endY, button: 0
      }));
      await sleep(1000);
      return true;
    } catch (e) {
      console.warn("[J-Tech Scraper] Map pan dispatch error:", e);
      return false;
    }
  }

  async function attemptAutoExpandArea() {
    if (autoPanAttempts >= MAX_AUTO_PAN_ATTEMPTS) {
      return false;
    }
    autoPanAttempts++;
    isPanning = true;

    pushStatus({
      status: "panning",
      note: `Scanned area complete (${scrapedSet.size} leads, ${qualifiedLeads.length}/${settings.targetLeads} qualified). Auto-panning to adjacent area (${autoPanAttempts}/${MAX_AUTO_PAN_ATTEMPTS})…`
    });

    let btn = findSearchAreaButton();
    if (!btn) {
      const panOffsets = [
        { dx: -320, dy: 0 },
        { dx: 0, dy: -260 },
        { dx: 320, dy: 0 },
        { dx: 0, dy: 260 }
      ];
      const offset = panOffsets[(autoPanAttempts - 1) % panOffsets.length];
      await simulateMapPan(offset.dx, offset.dy);
      await sleep(1200);
      btn = findSearchAreaButton();
    }

    if (btn) {
      console.log("[J-Tech Scraper] Clicking 'Search this area' to expand leads.");
      btn.click();
      await sleep(2500);
      isPanning = false;
      return true;
    }

    isPanning = false;
    return false;
  }

  // ─── Main Scrape Loop ──────────────────────────────────────────────────────────

  async function startScraping(keepExisting = false) {
    isRunning = false;
    await sleep(200);

    isRunning = true;
    isPaused = false;
    isPanning = false;
    scrollStaleCount = 0;
    autoPanAttempts = 0;

    // Initialize neighborhood queue
    cityQueue = Array.isArray(settings.cityQueue) && settings.cityQueue.length > 0
      ? settings.cityQueue
      : (typeof getCitiesForState === "function" ? getCitiesForState(settings.stateCode || "AL") : ["Birmingham"]);
    tradeKeyword = settings.tradeKeyword || "Electrician";

    if (!keepExisting) {
      scrapedSet.clear();
      qualifiedLeads = [];
      rejectedLeads = [];
      currentCityIndex = 0;
      activeCity = cityQueue[0] || "";
      clearPersistedLeads();
    } else {
      activeCity = cityQueue[currentCityIndex] || cityQueue[0] || "";
    }

    pushStatus({
      status: "scraping",
      note: `Scraping: ${tradeKeyword} in ${activeCity || "current search area"} (${currentCityIndex + 1}/${cityQueue.length})…`
    });

    // 1. Check if there is already an active feed with cards on screen
    let feed = await ensureSearchResultsFeed(2000);

    // 2. If no feed or cards on screen, trigger initial city search navigation
    if (!feed || !document.querySelector('div.Nv2PK')) {
      const initialQuery = `${tradeKeyword} in ${activeCity || "Birmingham"}, ${settings.stateCode || "AL"}`;
      console.log(`[J-Tech Scraper] No active search feed found. Navigating to: "${initialQuery}"`);
      pushStatus({
        status: "scraping",
        note: `Opening search: ${initialQuery}…`
      });
      persistLeads();
      window.location.href = `https://www.google.com/maps/search/${encodeURIComponent(initialQuery)}/`;
      return;
    }

    let previousChildCount = 0;

    while (isRunning) {
      // ── Pause Gate ──────────────────────────────────────────────────────────────
      while (isPaused && isRunning) {
        await sleep(400);
      }
      if (!isRunning) break;

      // ── Target Leads Check ──────────────────────────────────────────────────────
      if (qualifiedLeads.length >= settings.targetLeads) {
        pushStatus({
          status: "complete",
          note: `Target of ${settings.targetLeads} qualified leads reached! ✓`
        });
        break;
      }

      // Re-acquire feed if needed
      feed = getResultsFeed();
      if (!feed) {
        feed = await ensureSearchResultsFeed(2500);
        if (!feed) {
          await sleep(1000);
          continue;
        }
      }

      // ── Process Visible Cards (Strictly Non-Destructive) ────────────────────────
      await processVisibleCards(feed);

      if (qualifiedLeads.length >= settings.targetLeads) {
        pushStatus({
          status: "complete",
          note: `Target of ${settings.targetLeads} qualified leads reached! ✓`
        });
        break;
      }

      // ── Check if Current Area Feed Has Reached the End (~100-120 items) ─────────
      const endMarker = document.querySelector("div.m6QErb.tL82x.eKjhbv");
      const endText = feed.textContent.includes("You've reached the end of the list");

      const currentChildCount = feed.children.length;
      if (currentChildCount === previousChildCount) {
        scrollStaleCount++;
      } else {
        scrollStaleCount = 0;
      }
      previousChildCount = currentChildCount;

      const areaCompleted = endMarker || endText || scrollStaleCount >= 4;

      if (areaCompleted) {
        // Final pass on visible cards
        await processVisibleCards(feed);

        if (qualifiedLeads.length >= settings.targetLeads) {
          pushStatus({ status: "complete", note: "Target reached! ✓" });
          break;
        }

        // 1. Auto-Hop to Next Neighborhood in the State Queue!
        if (settings.autoHopCities && cityQueue.length > 0 && currentCityIndex + 1 < cityQueue.length) {
          currentCityIndex++;
          const nextCity = cityQueue[currentCityIndex];
          activeCity = nextCity;
          const nextQuery = `${tradeKeyword} in ${nextCity}, ${settings.stateCode || "AL"}`;

          console.log(`[J-Tech Scraper] Completed ${cityQueue[currentCityIndex - 1]}. Hopping to: "${nextQuery}" (${currentCityIndex + 1}/${cityQueue.length})`);
          pushStatus({
            status: "panning",
            note: `Area complete (${scrapedSet.size} total scanned, ${qualifiedLeads.length}/${settings.targetLeads} qualified). Hopping to ${nextCity}, ${settings.stateCode || "AL"} (${currentCityIndex + 1}/${cityQueue.length})…`
          });

          // Persist state across navigation
          persistLeads();

          // Memory Recycling: Navigate directly to reset WebGL/DOM memory, preventing Chrome tab crashes across 30 cities
          window.location.href = `https://www.google.com/maps/search/${encodeURIComponent(nextQuery)}/`;
          return;
        }

        // 2. If Auto-Hop queue finished or disabled, try map canvas pan
        console.log(`[J-Tech Scraper] Current area ended (${scrapedSet.size} scanned). Auto-panning map...`);
        const expanded = await attemptAutoExpandArea();

        if (expanded) {
          scrollStaleCount = 0;
          previousChildCount = 0;
          await sleep(1500);
          continue;
        } else {
          // If queue and pan are both completed
          isPaused = true;
          persistLeads();
          pushStatus({
            status: "paused",
            note: `Queue complete (${scrapedSet.size} leads scanned, ${qualifiedLeads.length}/${settings.targetLeads} qualified across ${cityQueue.length} cities). Drag map or add cities to continue!`
          });
          break;
        }
      }

      // ── Scroll Down Continuously ────────────────────────────────────────────────
      scrollFeedDown(feed);
      await sleep(randomInterval(1000, 1600));
    }

    isRunning = false;
    isPanning = false;
    persistLeads();

    if (qualifiedLeads.length >= settings.targetLeads) {
      pushStatus({ status: "complete" });
    }
  }

  function scrollFeedDown(feed) {
    if (!feed) return;
    if (feed.scrollHeight > feed.clientHeight) {
      feed.scrollBy({ top: 850, behavior: "smooth" });
      return;
    }
    if (feed.parentElement && feed.parentElement.scrollHeight > feed.parentElement.clientHeight) {
      feed.parentElement.scrollBy({ top: 850, behavior: "smooth" });
      return;
    }
    const m6 = feed.closest('.m6QErb') || document.querySelector('.m6QErb.DsmM0c');
    if (m6 && m6.scrollHeight > m6.clientHeight) {
      m6.scrollBy({ top: 850, behavior: "smooth" });
      return;
    }
    window.scrollBy({ top: 850, behavior: "smooth" });
  }

  /**
   * Process all currently visible listing cards in the feed.
   */
  async function processVisibleCards(feed) {
    const cards = feed.querySelectorAll(':scope > div, div[role="article"], div.Nv2PK');

    for (const card of cards) {
      if (!isRunning || isPaused) break;
      if (qualifiedLeads.length >= settings.targetLeads) break;

      if (!card.querySelector("div.fontHeadlineSmall, .qBF1Pd, a.hfpxzc, div.Nv2PK")) {
        continue;
      }

      const lead = extractFromCard(card);

      if (!lead.title) continue;

      // ── High-Precision Deduplication ──
      // Uses normalized 10-digit phone if available, or cleaned business title + city
      const normPhone = typeof normalizePhoneNumber === "function"
        ? normalizePhoneNumber(lead.phone)
        : (lead.phone || "").replace(/\D/g, "");
      const normTitle = (lead.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const dedupeKey = normPhone && normPhone.length === 10
        ? `ph_${normPhone}`
        : `biz_${normTitle}_${(lead.city || "").toLowerCase()}`;

      if (scrapedSet.has(dedupeKey)) continue;
      scrapedSet.add(dedupeKey);

      // Fast pre-filter check
      if (settings.websiteFilter === "missing" && lead.website) {
        lead.rejectReason = "Has existing website (filter: Missing Website only)";
        lead.opportunityStatus = classifyWebsite(lead.website);
        rejectedLeads.push(lead);
        if (rejectedLeads.length % 5 === 0) persistLeads();
        pushStatus();
        continue;
      }

      // ── Run Through Validation Engine ──────────────────────────────────────────
      const validation = validateLead(lead, settings);

      if (validation.pass) {
        lead.opportunityStatus = classifyWebsite(lead.website);
        if (settings.generateDemoLink) {
          lead.demoUrl = buildDemoUrl(lead, settings.demoBaseUrl);
        } else {
          lead.demoUrl = "";
        }

        qualifiedLeads.push(lead);
        persistLeads();
        pushStatus({ latestLead: lead });
      } else {
        lead.rejectReason = validation.reason;
        lead.opportunityStatus = classifyWebsite(lead.website);
        rejectedLeads.push(lead);
        if (rejectedLeads.length % 5 === 0) persistLeads();
        pushStatus();
      }
    }
  }

  // ─── Message Handler (from popup.js) ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case "START_SCRAPING":
        settings = Object.assign({}, DEFAULT_SETTINGS, msg.settings || {});
        startScraping(!!msg.keepExisting);
        sendResponse({ ok: true });
        break;

      case "PAUSE_SCRAPING":
        isPaused = true;
        persistLeads();
        pushStatus();
        sendResponse({ ok: true });
        break;

      case "RESUME_SCRAPING":
        isPaused = false;
        pushStatus();
        sendResponse({ ok: true });
        break;

      case "STOP_SCRAPING":
        isRunning = false;
        isPaused = false;
        isPanning = false;
        persistLeads();
        const stopStatus = qualifiedLeads.length > 0 ? "complete" : "idle";
        pushStatus({ status: stopStatus });
        sendResponse({
          ok: true,
          qualifiedFound: qualifiedLeads.length,
          rejectedCount: rejectedLeads.length,
          totalFound: scrapedSet.size
        });
        break;

      case "GET_STATUS":
        sendResponse({
          ok: true,
          totalFound: scrapedSet.size,
          qualifiedFound: qualifiedLeads.length,
          rejectedCount: rejectedLeads.length,
          status: isRunning ? (isPaused ? "paused" : (isPanning ? "panning" : "scraping")) : (qualifiedLeads.length > 0 ? "complete" : "idle")
        });
        break;

      case "GET_LEADS":
        sendResponse({
          ok: true,
          qualified: qualifiedLeads,
          rejected: rejectedLeads
        });
        break;

      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
    return true;
  });

  // ─── Initialization ─────────────────────────────────────────────────────────────

  restoreLeads().then(() => {
    chrome.storage.local.get(["scraperSettings", "jtechLeads"], async (data) => {
      if (data.scraperSettings) {
        settings = Object.assign({}, DEFAULT_SETTINGS, data.scraperSettings);
      }
      const saved = data.jtechLeads;
      if (saved && saved.isRunning && !saved.isPaused && qualifiedLeads.length < settings.targetLeads) {
        console.log(`[J-Tech Maps Scraper] Auto-resuming session after memory reset (${qualifiedLeads.length}/${settings.targetLeads} qualified)...`);
        pushStatus({ status: "scraping", note: "Resuming multi-city queue after clean memory refresh…" });
        await sleep(2500);
        startScraping(true);
      } else {
        console.log(
          `[J-Tech Maps Scraper] Content script active. ` +
          `${qualifiedLeads.length} qualified leads in memory.`
        );
      }
    });
  });
})();

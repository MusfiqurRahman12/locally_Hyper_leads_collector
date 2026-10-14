/**
 * rules.js — Filter definitions, blacklists, classifiers, demo URL builder,
 * and state-wide neighborhood / multi-city database.
 *
 * Loaded as a content script before content.js so all symbols are globally available.
 */

// ─── State & Neighborhood / City Database ───────────────────────────────────────

const STATE_NEIGHBORHOODS = {
  AL: {
    name: "Alabama",
    cities: [
      "Birmingham",
      "Huntsville",
      "Mobile",
      "Montgomery",
      "Tuscaloosa",
      "Hoover",
      "Auburn",
      "Dothan",
      "Decatur",
      "Madison",
      "Florence",
      "Vestavia Hills",
      "Prattville",
      "Gadsden",
      "Alabaster",
      "Northport",
      "Enterprise",
      "Opelika",
      "Homewood",
      "Athens",
      "Bessemer",
      "Pelham",
      "Trussville",
      "Daphne",
      "Albertville",
      "Mountain Brook",
      "Helena",
      "Fairhope",
      "Foley",
      "Oxford"
    ]
  },
  FL: {
    name: "Florida",
    cities: [
      "Miami", "Orlando", "Tampa", "Jacksonville", "St. Petersburg",
      "Fort Lauderdale", "Tallahassee", "Hialeah", "Cape Coral", "Pembroke Pines",
      "Hollywood", "Gainesville", "Miramar", "Coral Springs", "Clearwater"
    ]
  },
  GA: {
    name: "Georgia",
    cities: [
      "Atlanta", "Augusta", "Columbus", "Macon", "Savannah",
      "Athens", "Sandy Springs", "Roswell", "Johns Creek", "Warner Robins",
      "Alpharetta", "Marietta", "Valdosta", "Smyrna", "Dunwoody"
    ]
  },
  TN: {
    name: "Tennessee",
    cities: [
      "Nashville", "Memphis", "Knoxville", "Chattanooga", "Clarksville",
      "Murfreesboro", "Franklin", "Johnson City", "Jackson", "Hendersonville"
    ]
  },
  TX: {
    name: "Texas",
    cities: [
      "Houston", "San Antonio", "Dallas", "Austin", "Fort Worth",
      "El Paso", "Arlington", "Corpus Christi", "Plano", "Lubbock"
    ]
  },
  NC: {
    name: "North Carolina",
    cities: [
      "Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem",
      "Fayetteville", "Cary", "Wilmington", "High Point", "Concord"
    ]
  },
  CA: {
    name: "California",
    cities: [
      "Los Angeles", "San Diego", "San Jose", "San Francisco", "Fresno",
      "Sacramento", "Long Beach", "Oakland", "Bakersfield", "Anaheim"
    ]
  },
  NY: {
    name: "New York",
    cities: [
      "New York", "Buffalo", "Rochester", "Yonkers", "Syracuse",
      "Albany", "New Rochelle", "Mount Vernon", "Schenectady", "Utica"
    ]
  }
};

function getCitiesForState(stateCode) {
  if (STATE_NEIGHBORHOODS[stateCode]) {
    return [...STATE_NEIGHBORHOODS[stateCode].cities];
  }
  return [...STATE_NEIGHBORHOODS.AL.cities];
}

// ─── Blacklists & Constants ────────────────────────────────────────────────────

const FRANCHISE_BLACKLIST = [
  "roto-rooter",
  "mr. rooter",
  "benjamin franklin",
  "mr. handyman",
  "molly maid",
  "merry maids",
  "1-800",
  "stanley steemer",
  "servpro",
  "two men and a truck"
];

const TOLL_FREE_PREFIXES = ["800", "888", "877", "866", "855", "844", "833"];

const FREE_BUILDER_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "wixsite.com",
  "tiny.site",
  "weebly.com",
  "site123.me",
  "godaddysites.com",
  "business.site"
];

// ─── Default Filter Settings ────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  minRating: 3.5,
  maxRating: 5.0,
  minReviews: 8,
  maxReviews: 65,
  targetLeads: 200,
  websiteFilter: "all", // "all" | "missing" | "has_website"
  autoHopCities: true,   // auto-advance to next neighborhood when area finishes
  stateCode: "AL",       // default Alabama
  tradeKeyword: "Electrician",
  cityQueue: [...STATE_NEIGHBORHOODS.AL.cities],
  generateDemoLink: false,
  demoBaseUrl: "https://demo.jtechagency.com/",
  deepCardPeek: true,    // if card lacks phone/website, click card to peek detail panel
  syncApiUrl: "http://localhost:8005/api/v1/prospects/batch"
};

function normalizePhoneNumber(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

// ─── Validation ─────────────────────────────────────────────────────────────────

/**
 * Validate a single lead against all gate checks.
 * @param {Object} lead  – { title, rating, reviews, phone, website, category, city }
 * @param {Object} settings – override-able filter thresholds
 * @returns {{ pass: boolean, reason: string }}
 */
function validateLead(lead, settings = {}) {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings);

  // Gate 1 — Franchise blacklist
  const titleLower = (lead.title || "").toLowerCase();
  for (const banned of FRANCHISE_BLACKLIST) {
    if (titleLower.includes(banned)) {
      return { pass: false, reason: `Franchise blacklist: "${banned}"` };
    }
  }

  // Gate 2 — Review count window
  const reviewCount = parseInt(lead.reviews, 10);
  if (isNaN(reviewCount) || reviewCount < s.minReviews || reviewCount > s.maxReviews) {
    return {
      pass: false,
      reason: `Review count ${reviewCount} outside [${s.minReviews}, ${s.maxReviews}]`
    };
  }

  // Gate 3 — Rating window
  const rating = parseFloat(lead.rating);
  if (isNaN(rating) || rating < s.minRating || rating > s.maxRating) {
    return {
      pass: false,
      reason: `Rating ${rating} outside [${s.minRating}, ${s.maxRating}]`
    };
  }

  // Gate 4 — Phone verification
  if (lead.phone) {
    const cleanPhone = lead.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10 && cleanPhone.length !== 11) {
      return { pass: false, reason: `Invalid phone length: ${cleanPhone.length}` };
    }
    // Normalize to last 10 digits (strip leading 1 for US numbers)
    const tenDigit = cleanPhone.length === 11 && cleanPhone.startsWith("1")
      ? cleanPhone.slice(1)
      : cleanPhone;
    const areaCode = tenDigit.substring(0, 3);
    for (const prefix of TOLL_FREE_PREFIXES) {
      if (areaCode === prefix) {
        return { pass: false, reason: `Toll-free area code: ${areaCode}` };
      }
    }
  } else if (!lead.website) {
    return { pass: false, reason: "No phone number or website visible on listing" };
  }

  // Gate 5 — Website Filter (all | missing | has_website)
  const opp = classifyWebsite(lead.website);
  lead.opportunityStatus = opp;

  if (s.websiteFilter === "missing" && opp !== "Missing Website") {
    return {
      pass: false,
      reason: `Has website (${opp}) — filter set to Missing Website only`
    };
  }

  if (s.websiteFilter === "has_website" && opp === "Missing Website") {
    return {
      pass: false,
      reason: "Missing website — filter set to Has Custom Website only"
    };
  }

  // All gates passed
  return { pass: true, reason: "Qualified" };
}

// ─── Website Gap Classifier ─────────────────────────────────────────────────────

function classifyWebsite(website) {
  if (!website || website.trim() === "") {
    return "Missing Website";
  }
  const urlLower = website.toLowerCase();
  for (const domain of FREE_BUILDER_DOMAINS) {
    if (urlLower.includes(domain)) {
      return "Social / Free Subdomain";
    }
  }
  return "Has Custom Site";
}

// ─── Demo URL Builder ───────────────────────────────────────────────────────────

function buildDemoUrl(lead, baseUrl) {
  const base = baseUrl || DEFAULT_SETTINGS.demoBaseUrl;

  let tradeTheme = "handyman";
  const cat = (lead.category || "").toLowerCase();
  if (cat.includes("plumb")) {
    tradeTheme = "plumber";
  } else if (cat.includes("clean") || cat.includes("maid") || cat.includes("janitorial")) {
    tradeTheme = "cleaning";
  } else if (cat.includes("electr")) {
    tradeTheme = "electrician";
  } else if (cat.includes("craft") || cat.includes("carpent")) {
    tradeTheme = "carpentry";
  }

  const params = new URLSearchParams({
    biz: (lead.title || "").trim(),
    phone: (lead.phone || "").trim(),
    rating: String(lead.rating || ""),
    reviews: String(lead.reviews || ""),
    trade: tradeTheme,
    city: lead.city || "Alabama"
  });

  return `${base}?${params.toString()}`;
}

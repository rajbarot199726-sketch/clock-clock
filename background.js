const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const TIME_ZONE_COUNTRY_FALLBACKS = {
  "Asia/Calcutta": "IN",
  "Asia/Kolkata": "IN"
};

const FLAG_IMAGE_CACHE = new Map();

function getLocaleCountryCode() {
  const uiLanguage = chrome.i18n?.getUILanguage?.() || "";
  const localeParts = uiLanguage.split(/[-_]/);
  const regionCandidate = localeParts.length > 1 ? localeParts[localeParts.length - 1] : "";

  if (/^[a-z]{2}$/i.test(regionCandidate)) {
    return regionCandidate.toUpperCase();
  }

  return "US";
}

const state = {
  timeZone: DEFAULT_TIME_ZONE,
  countryCode: getLocaleCountryCode(),
  lastSync: null
};

function normalizeCountryCode(countryCode) {
  if (/^[a-z]{2}$/i.test(countryCode || "")) {
    return countryCode.toUpperCase();
  }

  const fromTimeZone = TIME_ZONE_COUNTRY_FALLBACKS[state.timeZone];
  if (/^[a-z]{2}$/i.test(fromTimeZone || "")) {
    return fromTimeZone;
  }

  return state.countryCode;
}

const formatTime = () =>
  new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: state.timeZone
  }).format(new Date());

const getFlagUrl = (countryCode) => {
  const normalized = normalizeCountryCode(countryCode).toLowerCase();
  return `https://flagcdn.com/${normalized}.svg`;
};

async function getFlagBitmap(countryCode) {
  const normalized = normalizeCountryCode(countryCode);

  if (FLAG_IMAGE_CACHE.has(normalized)) {
    return FLAG_IMAGE_CACHE.get(normalized);
  }

  const response = await fetch(getFlagUrl(normalized));
  if (!response.ok) {
    throw new Error(`flagcdn lookup failed with ${response.status}`);
  }

  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  FLAG_IMAGE_CACHE.set(normalized, bitmap);
  return bitmap;
}

function drawClockImageData(size, time, flagBitmap) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 0, size, size);

  if (flagBitmap) {
    const flagWidth = Math.round(size * 0.7);
    const flagHeight = Math.round(size * 0.34);
    const flagX = Math.round((size - flagWidth) / 2);
    const flagY = Math.round(size * 0.06);
    ctx.drawImage(flagBitmap, flagX, flagY, flagWidth, flagHeight);
  }

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(size * 0.3)}px sans-serif`;
  ctx.fillText(time, size / 2, size * 0.72);

  return ctx.getImageData(0, 0, size, size);
}

async function setToolbarIcon() {
  const time = formatTime();
  const shortTime = time.replace(":", "");
  let flagBitmap = null;

  try {
    flagBitmap = await getFlagBitmap(state.countryCode);
  } catch (error) {
    console.warn("Clock Clock: flag image load failed", error);
  }

  const imageData = {
    16: drawClockImageData(16, shortTime, flagBitmap),
    32: drawClockImageData(32, shortTime, flagBitmap)
  };

  await chrome.action.setIcon({ imageData });
  await chrome.action.setTitle({ title: `${time} (${state.timeZone})` });
}

async function fetchFromIpApi() {
  const response = await fetch("https://ipapi.co/json/");

  if (!response.ok) {
    throw new Error(`ipapi lookup failed with ${response.status}`);
  }

  const data = await response.json();
  return {
    timezone: data?.timezone,
    countryCode: data?.country_code
  };
}

async function fetchFromIpWho() {
  const response = await fetch("https://ipwho.is/");

  if (!response.ok) {
    throw new Error(`ipwho lookup failed with ${response.status}`);
  }

  const data = await response.json();

  if (data?.success === false) {
    throw new Error("ipwho returned unsuccessful response");
  }

  return {
    timezone: data?.timezone?.id,
    countryCode: data?.country_code
  };
}

async function syncLocationByIp() {
  const providers = [fetchFromIpApi, fetchFromIpWho];

  for (const provider of providers) {
    try {
      const location = await provider();

      if (location?.timezone) {
        state.timeZone = location.timezone;
      }

      state.countryCode = normalizeCountryCode(location?.countryCode);
      state.lastSync = Date.now();
      await chrome.storage.local.set({ clockClockState: state });
      return;
    } catch (error) {
      console.warn("Clock Clock: location provider failed", error);
    }
  }

  state.countryCode = normalizeCountryCode("");
  state.lastSync = Date.now();
  await chrome.storage.local.set({ clockClockState: state });
}

let isScheduled = false;

function scheduleUpdates() {
  if (isScheduled) {
    return;
  }

  isScheduled = true;
  setToolbarIcon();
  setInterval(setToolbarIcon, 1000);
  setInterval(syncLocationByIp, 6 * 60 * 60 * 1000);
}

chrome.runtime.onInstalled.addListener(async () => {
  await syncLocationByIp();
  scheduleUpdates();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncLocationByIp();
  scheduleUpdates();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "clock-clock:get-state") {
    sendResponse({
      countryCode: state.countryCode,
      time: formatTime(),
      timeZone: state.timeZone,
      flagUrl: getFlagUrl(state.countryCode)
    });
  }

  return true;
});

(async function bootstrap() {
  const stored = await chrome.storage.local.get("clockClockState");

  if (stored?.clockClockState) {
    Object.assign(state, stored.clockClockState);
  }

  await syncLocationByIp();
  scheduleUpdates();
})();

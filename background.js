const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

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

const toFlagEmoji = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) {
    return "🌐";
  }

  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => 127397 + char.charCodeAt(0)
  );

  return String.fromCodePoint(...codePoints);
};

const formatTime = () =>
  new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: state.timeZone
  }).format(new Date());

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

      if (/^[a-z]{2}$/i.test(location?.countryCode || "")) {
        state.countryCode = location.countryCode.toUpperCase();
      }

      state.lastSync = Date.now();
      await chrome.storage.local.set({ clockClockState: state });
      return;
    } catch (error) {
      console.warn("Clock Clock: location provider failed", error);
    }
  }

  state.lastSync = Date.now();
  await chrome.storage.local.set({ clockClockState: state });
}

function updateToolbarClock() {
  const time = formatTime();
  const flag = toFlagEmoji(state.countryCode);

  chrome.action.setBadgeText({ text: time.replace(":", "") });
  chrome.action.setBadgeBackgroundColor({ color: "#1f2937" });
  chrome.action.setBadgeTextColor({ color: "#ffffff" });
  chrome.action.setTitle({ title: `${flag} ${time} (${state.timeZone})` });
}

let isScheduled = false;

function scheduleUpdates() {
  if (isScheduled) {
    return;
  }

  isScheduled = true;
  updateToolbarClock();
  setInterval(updateToolbarClock, 1000);
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
      flag: toFlagEmoji(state.countryCode),
      time: formatTime(),
      timeZone: state.timeZone
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

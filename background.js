const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const state = {
  timeZone: DEFAULT_TIME_ZONE,
  countryCode: "UN",
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

async function syncLocationByIp() {
  try {
    const response = await fetch("https://ipapi.co/json/");

    if (!response.ok) {
      throw new Error(`Location lookup failed with ${response.status}`);
    }

    const data = await response.json();

    if (data?.timezone) {
      state.timeZone = data.timezone;
    }

    if (data?.country_code) {
      state.countryCode = data.country_code;
    }

    state.lastSync = Date.now();
    await chrome.storage.local.set({ clockClockState: state });
  } catch (error) {
    console.warn("Clock Clock: falling back to browser time zone", error);
  }
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

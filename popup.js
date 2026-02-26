const toFlagEmoji = (countryCode) => {
  if (!/^[a-z]{2}$/i.test(countryCode || "")) {
    return "🌐";
  }

  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => 127397 + char.charCodeAt(0)
  );

  return String.fromCodePoint(...codePoints);
};

const hasRegionalIndicatorEmoji = (value) => /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(value || "");

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "clock-clock:get-state" });

  if (!response) {
    return;
  }

  const resolvedFlag = hasRegionalIndicatorEmoji(response.flag)
    ? response.flag
    : toFlagEmoji(response.countryCode);

  document.getElementById("flag").textContent = resolvedFlag;
  document.getElementById("time").textContent = response.time;
  document.getElementById("zone").textContent = response.timeZone;
}

loadState();
setInterval(loadState, 1000);

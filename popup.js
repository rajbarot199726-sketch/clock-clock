const flagImage = document.getElementById("flagImage");
const flagFallback = document.getElementById("flagFallback");

function applyFlag(flagUrl, countryCode) {
  if (!flagUrl) {
    flagImage.style.display = "none";
    flagFallback.style.display = "block";
    return;
  }

  flagImage.alt = `${countryCode || "Unknown"} flag`;
  flagImage.src = flagUrl;
}

flagImage.addEventListener("load", () => {
  flagImage.style.display = "block";
  flagFallback.style.display = "none";
});

flagImage.addEventListener("error", () => {
  flagImage.style.display = "none";
  flagFallback.style.display = "block";
});

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "clock-clock:get-state" });

  if (!response) {
    return;
  }

  applyFlag(response.flagUrl, response.countryCode);
  document.getElementById("time").textContent = response.time;
  document.getElementById("zone").textContent = response.timeZone;
}

loadState();
setInterval(loadState, 1000);

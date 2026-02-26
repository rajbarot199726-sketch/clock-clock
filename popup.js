async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: "clock-clock:get-state" });

  if (!response) {
    return;
  }

  document.getElementById("flag").textContent = response.flag;
  document.getElementById("time").textContent = response.time;
  document.getElementById("zone").textContent = response.timeZone;
}

loadState();
setInterval(loadState, 1000);

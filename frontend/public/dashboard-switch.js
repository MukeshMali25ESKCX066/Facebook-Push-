(() => {
  const root = document.getElementById("root");
  if (!root) return;

  const addSwitchLink = () => {
    const actions = root.querySelector(".app .main > .topbar .topbar-actions");
    if (!actions || actions.querySelector("[data-switch-dashboard]")) return;

    const toggle = document.createElement("div");
    toggle.className = "dashboard-toggle";
    toggle.dataset.switchDashboard = "true";
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "Switch dashboard");

    const pageCrew = document.createElement("span");
    pageCrew.className = "dashboard-toggle-label is-current";
    pageCrew.setAttribute("aria-current", "page");
    pageCrew.textContent = "PageCrew";

    const control = document.createElement("button");
    control.type = "button";
    control.className = "dashboard-toggle-control";
    control.setAttribute("role", "switch");
    control.setAttribute("aria-checked", "false");
    control.setAttribute("aria-label", "Switch from PageCrew to Push Pilot");
    control.appendChild(document.createElement("span")).className = "dashboard-toggle-thumb";
    control.addEventListener("click", () => window.location.assign("/push-notification"));

    const pushPilot = document.createElement("span");
    pushPilot.className = "dashboard-toggle-label";
    pushPilot.textContent = "Push Pilot";

    toggle.append(pageCrew, control, pushPilot);
    actions.appendChild(toggle);
  };

  new MutationObserver(addSwitchLink).observe(root, { childList: true, subtree: true });
  addSwitchLink();
})();

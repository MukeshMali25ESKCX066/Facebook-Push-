(() => {
  const root = document.getElementById("root");
  if (!root) return;

  const platformIcon = (kind) => {
    if (kind === "facebook") {
      const icon = document.createElement("span");
      icon.className = "dashboard-platform-icon dashboard-platform-facebook";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "f";
      return icon;
    }

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("dashboard-platform-icon", "dashboard-platform-bell");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>';
    return icon;
  };

  const platformLabel = (label, kind, current) => {
    const element = document.createElement("span");
    element.className = `dashboard-toggle-label${current ? " is-current" : ""}`;
    if (current) {
      element.setAttribute("aria-current", "page");
    }
    element.append(platformIcon(kind), document.createTextNode(label));
    return element;
  };

  const addSwitchLink = () => {
    const actions = root.querySelector(".app .main > .topbar .topbar-actions");
    if (!actions || actions.querySelector("[data-switch-dashboard]")) return;

    const toggle = document.createElement("div");
    toggle.className = "dashboard-toggle";
    toggle.dataset.switchDashboard = "true";
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "Switch dashboard");

    const pageCrew = platformLabel("PageCrew", "facebook", true);

    const control = document.createElement("button");
    control.type = "button";
    control.className = "dashboard-toggle-control";
    control.setAttribute("role", "switch");
    control.setAttribute("aria-checked", "false");
    control.setAttribute("aria-label", "Switch from PageCrew to LaraPush");
    control.appendChild(document.createElement("span")).className = "dashboard-toggle-thumb";
    control.addEventListener("click", () => window.location.assign("/push-notification"));

    const pushPilot = platformLabel("LaraPush", "bell", false);

    toggle.append(pageCrew, control, pushPilot);
    actions.appendChild(toggle);
  };

  new MutationObserver(addSwitchLink).observe(root, { childList: true, subtree: true });
  addSwitchLink();
})();

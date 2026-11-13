(function () {
  const categories = [
    { key: "event-campaigns", icon: "✦", label: "Event Campaigns", href: "/event-campaigns.html" },
    { key: "ai-content", icon: "✧", label: "AI Content Generator", href: "/ai-content.html" },
    { key: "scheduler", icon: "◷", label: "Smart Scheduler", href: "/scheduler.html" },
    { key: "analytics", icon: "▥", label: "Analytics", href: "/analytics.html" }
  ];

  function createIcon(text, className) {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = text;
    return icon;
  }

  function installCategory() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const links = categories.map(item => {
      let link = nav.querySelector(`[data-pagecrew-category="${item.key}"]`)
        || Array.from(nav.querySelectorAll("a[href]")).find(anchor => anchor.getAttribute("href") === item.href);
      if (!link) {
        link = document.createElement("a");
        link.className = "nav-link";
        link.href = item.href;
        link.append(createIcon(item.icon, "pagecrew-nav-icon"), document.createTextNode(item.label));
      }
      link.dataset.pagecrewCategory = item.key;
      return link;
    });

    let group = nav.querySelector("[data-pagecrew-group]");
    if (!group) {
      group = document.createElement("div");
      group.className = "pagecrew-nav-group";
      group.dataset.pagecrewGroup = "standard-auto-publishing";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "nav-link pagecrew-nav-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-controls", "pagecrew-standard-auto-publishing-submenu");
      toggle.title = "Standard Auto Publishing";
      toggle.append(
        createIcon("◈", "pagecrew-nav-icon"),
        Object.assign(document.createElement("span"), {
          className: "pagecrew-nav-label",
          textContent: "Standard Auto Publishing"
        }),
        createIcon("▾", "pagecrew-nav-chevron")
      );

      const submenu = document.createElement("div");
      submenu.className = "pagecrew-nav-submenu";
      submenu.id = "pagecrew-standard-auto-publishing-submenu";
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        submenu.hidden = expanded;
      });

      group.append(toggle, submenu);
      nav.insertBefore(group, links[0] || null);
    }

    const submenu = group.querySelector(".pagecrew-nav-submenu");
    links.forEach(link => {
      if (link.parentElement !== submenu) submenu.appendChild(link);
    });
    const active = Boolean(submenu.querySelector(".nav-link.active"));
    group.querySelector(".pagecrew-nav-toggle").classList.toggle("active", active);
  }

  installCategory();
  const root = document.getElementById("root");
  if (root) new MutationObserver(installCategory).observe(root, { childList: true, subtree: true });
})();

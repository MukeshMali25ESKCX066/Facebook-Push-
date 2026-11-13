(function () {
  const groups = [
    {
      id: "standard-auto-publishing",
      label: "Standard Auto Publishing",
      icon: "◈",
      categories: [
        { key: "event-campaigns", icon: "✦", label: "Event Campaigns", href: "/event-campaigns.html" },
        { key: "ai-content", icon: "✧", label: "AI Content Generator", href: "/ai-content.html" },
        { key: "scheduler", icon: "◷", label: "Smart Scheduler", href: "/scheduler.html" },
        { key: "analytics", icon: "▥", label: "Analytics", href: "/analytics.html" }
      ]
    },
    {
      id: "automatic-auto-publishing",
      label: "Automatic Auto Publishing",
      icon: "⚡",
      categories: [
        { key: "advanced-hybrid", icon: "◉", label: "2. Design – Auto Publishing dashboard", href: "/advanced-hybrid" }
      ]
    }
  ];

  function createIcon(text, className) {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = text;
    return icon;
  }

  function installGroup(nav, config) {
    const links = config.categories.map(item => {
      let link = nav.querySelector(`[data-pagecrew-category="${item.key}"]`)
        || Array.from(nav.querySelectorAll("a[href]")).find(anchor => anchor.getAttribute("href") === item.href);
      if (!link) {
        link = document.createElement("a");
        link.className = "nav-link";
        link.href = item.href;
        link.append(createIcon(item.icon, "pagecrew-nav-icon"), document.createTextNode(item.label));
      }
      link.dataset.pagecrewCategory = item.key;
      if (window.location.pathname.replace(/\/$/, "") === item.href) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
      return link;
    });

    let group = nav.querySelector(`[data-pagecrew-group="${config.id}"]`);
    if (!group) {
      group = document.createElement("div");
      group.className = "pagecrew-nav-group";
      group.dataset.pagecrewGroup = config.id;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "nav-link pagecrew-nav-toggle";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-controls", `pagecrew-${config.id}-submenu`);
      toggle.title = config.label;
      toggle.append(
        createIcon(config.icon, "pagecrew-nav-icon"),
        Object.assign(document.createElement("span"), {
          className: "pagecrew-nav-label",
          textContent: config.label
        }),
        createIcon("▾", "pagecrew-nav-chevron")
      );

      const submenu = document.createElement("div");
      submenu.className = "pagecrew-nav-submenu";
      submenu.id = `pagecrew-${config.id}-submenu`;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        submenu.hidden = expanded;
      });

      group.append(toggle, submenu);
      const firstLinkInNav = links.find(link => link.parentElement === nav) || null;
      nav.insertBefore(group, firstLinkInNav);
    }

    const submenu = group.querySelector(".pagecrew-nav-submenu");
    links.forEach(link => {
      if (link.parentElement !== submenu) submenu.appendChild(link);
    });
    const active = Boolean(submenu.querySelector(".nav-link.active"));
    group.querySelector(".pagecrew-nav-toggle").classList.toggle("active", active);
  }

  function installCategories() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    groups.forEach(group => installGroup(nav, group));
  }

  installCategories();
  const root = document.getElementById("root");
  if (root) new MutationObserver(installCategories).observe(root, { childList: true, subtree: true });
})();

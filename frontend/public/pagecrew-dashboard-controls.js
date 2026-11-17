(() => {
  const root = document.getElementById("root");
  if (!root) return;

  const makeElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };

  const makeMenuItem = (label, action) => {
    const item = makeElement("button", "pc-profile-menu-item", label);
    item.type = "button";
    item.dataset.profileAction = action;
    item.setAttribute("role", "menuitem");
    return item;
  };

  const makePopover = (className, label) => {
    const popover = makeElement("div", className);
    popover.hidden = true;
    popover.setAttribute("role", "status");
    popover.setAttribute("aria-label", label);
    return popover;
  };

  const getWorkspaceIdentity = () => {
    const summary = root.querySelector(".auth-panel .user-summary");
    return {
      name: summary?.querySelector("strong")?.textContent?.trim() || "Workspace user",
      email: summary?.querySelector("small")?.textContent?.trim() || ""
    };
  };

  const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
  };

  const createConfirmation = () => {
    const dialog = makeElement("dialog", "pc-confirm-dialog");
    dialog.setAttribute("aria-labelledby", "pc-logout-title");
    dialog.setAttribute("aria-describedby", "pc-logout-description");

    const icon = makeElement("span", "pc-dialog-icon", "↪");
    icon.setAttribute("aria-hidden", "true");
    const title = makeElement("h2", "", "Log out of PageCrew?");
    title.id = "pc-logout-title";
    const description = makeElement(
      "p",
      "",
      "You will be signed out of your PageCrew workspace on this device."
    );
    description.id = "pc-logout-description";
    const error = makeElement("p", "pc-dialog-error");
    error.setAttribute("role", "alert");

    const cancel = makeElement("button", "pc-dialog-cancel", "Cancel");
    cancel.type = "button";
    const confirm = makeElement("button", "pc-dialog-confirm", "Log out");
    confirm.type = "button";
    const actions = makeElement("div", "pc-dialog-actions");
    actions.append(cancel, confirm);
    dialog.append(icon, title, description, error, actions);
    document.body.appendChild(dialog);

    const close = () => {
      if (dialog.open) dialog.close();
      dialog.remove();
    };

    cancel.addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("cancel", () => dialog.remove());
    confirm.addEventListener("click", () => {
      const logoutAction = root.querySelector(".auth-panel .panel-heading .text-button");
      if (!logoutAction || !logoutAction.textContent.trim().toLowerCase().includes("log out")) {
        error.textContent = "The secure logout control is not available. Refresh and try again.";
        return;
      }

      close();
      logoutAction.dataset.confirmedLogout = "true";
      logoutAction.click();
    });

    return dialog;
  };

  const closePopover = (popover, button) => {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  const installControls = () => {
    const actions = root.querySelector(".app .main > .topbar .topbar-actions");
    if (!actions) return;

    const connect = actions.querySelector(".connect");
    const existing = actions.querySelector(".pc-header-profile");
    if (!existing) {
      const profile = makeElement("div", "pc-header-profile");
      const profileButton = makeElement("button", "pc-profile-button");
      profileButton.type = "button";
      profileButton.setAttribute("aria-haspopup", "menu");
      profileButton.setAttribute("aria-expanded", "false");
      profileButton.setAttribute("aria-label", "Open account menu");
      const avatar = makeElement("span", "pc-profile-avatar");
      const info = makeElement("span", "pc-profile-identity");
      const name = makeElement("strong", "", "Workspace user");
      const email = makeElement("small");
      const chevron = makeElement("span", "pc-profile-chevron", "⌄");
      chevron.setAttribute("aria-hidden", "true");
      info.append(name, email);
      profileButton.append(avatar, info, chevron);

      const menu = makeElement("div", "pc-profile-menu");
      menu.hidden = true;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Account options");
      const menuIdentity = makeElement("div", "pc-profile-menu-identity");
      const menuName = makeElement("strong", "", "Workspace user");
      const menuEmail = makeElement("small");
      menuIdentity.append(menuName, menuEmail);
      menu.append(
        menuIdentity,
        makeMenuItem("My Account", "my-account"),
        makeMenuItem("Account Settings", "account-settings")
      );

      const subscription = makeElement("a", "pc-profile-menu-item", "Subscription");
      subscription.href = "/#plans";
      subscription.setAttribute("role", "menuitem");
      menu.append(subscription);
      const divider = makeElement("div", "pc-profile-menu-divider");
      divider.setAttribute("role", "separator");
      menu.append(divider, makeMenuItem("Log out", "logout"));
      profile.append(profileButton, menu);

      profileButton.addEventListener("click", () => {
        const opening = menu.hidden;
        menu.hidden = !opening;
        profileButton.setAttribute("aria-expanded", String(opening));
        if (opening) notificationPanel.hidden = true;
      });

      profile.addEventListener("click", (event) => {
        const item = event.target.closest("[data-profile-action]");
        if (!item) return;
        const identity = getWorkspaceIdentity();
        menu.hidden = true;
        profileButton.setAttribute("aria-expanded", "false");

        if (item.dataset.profileAction === "my-account") {
          root.querySelector(".auth-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
          root.querySelector(".auth-panel")?.classList.add("pc-account-highlight");
          window.setTimeout(
            () => root.querySelector(".auth-panel")?.classList.remove("pc-account-highlight"),
            1400
          );
        } else if (item.dataset.profileAction === "account-settings") {
          showAccountDetails(identity);
        } else if (item.dataset.profileAction === "logout") {
          const dialog = createConfirmation();
          if (typeof dialog.showModal === "function") dialog.showModal();
          else dialog.setAttribute("open", "");
        }
      });

      if (connect) {
        actions.insertBefore(profile, connect);
      } else {
        actions.appendChild(profile);
      }

      const notificationWrap = makeElement("div", "pc-notification-wrap");
      const notificationButton = makeElement("button", "pc-notification-button");
      notificationButton.type = "button";
      notificationButton.setAttribute("aria-label", "Notifications");
      notificationButton.setAttribute("aria-expanded", "false");
      notificationButton.setAttribute("aria-haspopup", "true");
      notificationButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
      const notificationPanel = makePopover("pc-notification-panel", "Notifications");
      notificationPanel.textContent = "You’re all caught up.";
      notificationWrap.append(notificationButton, notificationPanel);
      notificationButton.addEventListener("click", () => {
        const opening = notificationPanel.hidden;
        notificationPanel.hidden = !opening;
        notificationButton.setAttribute("aria-expanded", String(opening));
        if (opening) {
          menu.hidden = true;
          profileButton.setAttribute("aria-expanded", "false");
        }
      });
      if (connect) {
        actions.insertBefore(notificationWrap, connect);
      } else {
        actions.appendChild(notificationWrap);
      }

      document.addEventListener("click", (event) => {
        if (!profile.contains(event.target)) {
          closePopover(menu, profileButton);
        }
        if (!notificationWrap.contains(event.target)) {
          closePopover(notificationPanel, notificationButton);
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closePopover(menu, profileButton);
          closePopover(notificationPanel, notificationButton);
        }
      });
    }

    const identity = getWorkspaceIdentity();
    const profile = actions.querySelector(".pc-header-profile");
    if (profile) {
      const name = profile.querySelector(".pc-profile-identity strong");
      const email = profile.querySelector(".pc-profile-identity small");
      const avatar = profile.querySelector(".pc-profile-avatar");
      const menuName = profile.querySelector(".pc-profile-menu-identity strong");
      const menuEmail = profile.querySelector(".pc-profile-menu-identity small");
      setText(name, identity.name);
      setText(email, identity.email);
      setText(menuName, identity.name);
      setText(menuEmail, identity.email);
      setText(avatar, identity.name.slice(0, 1).toUpperCase());
    }
  };

  const showAccountDetails = (identity) => {
    const dialog = makeElement("dialog", "pc-confirm-dialog pc-account-dialog");
    const title = makeElement("h2", "", "Account Settings");
    const description = makeElement(
      "p",
      "",
      "Your PageCrew account details are managed by your workspace administrator."
    );
    const details = makeElement("div", "pc-account-details");
    const nameLabel = makeElement("span", "", "Workspace user");
    const nameValue = makeElement("strong", "", identity.name);
    const emailLabel = makeElement("span", "", "Registered email");
    const emailValue = makeElement("strong", "", identity.email || "Not available");
    const statusLabel = makeElement("span", "", "Status");
    const statusValue = makeElement("strong", "pc-account-status", "Active");
    details.append(nameLabel, nameValue, emailLabel, emailValue, statusLabel, statusValue);
    const closeButton = makeElement("button", "pc-dialog-confirm", "Done");
    closeButton.type = "button";
    dialog.setAttribute("aria-labelledby", "pc-account-title");
    title.id = "pc-account-title";
    dialog.append(title, description, details, closeButton);
    document.body.appendChild(dialog);
    closeButton.addEventListener("click", () => {
      if (dialog.open) dialog.close();
      dialog.remove();
    });
    dialog.addEventListener("cancel", () => dialog.remove());
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  };

  root.addEventListener("click", (event) => {
    const logoutButton = event.target.closest(".auth-panel .panel-heading .text-button");
    if (!logoutButton || !logoutButton.textContent.trim().toLowerCase().includes("log out")) return;
    if (logoutButton.dataset.confirmedLogout === "true") {
      delete logoutButton.dataset.confirmedLogout;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const dialog = createConfirmation();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, true);

  new MutationObserver(installControls).observe(root, { childList: true, subtree: true });
  installControls();
})();

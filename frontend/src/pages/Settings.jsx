
import { useState } from "react";
import {
  UserRound,
  Settings2,
  Bell,
  Database,
  Save,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";

import "./Settings.css";

const USER_KEY = "pagecrew_demo_user";
const PREF_KEY = "pagecrew_demo_preferences";

const DEFAULT_PREFS = {
  workspaceName: "My PageCrew Workspace",
  timezone: "Asia/Kolkata",
  defaultCampaign: "standard",
  emailNotifications: false,
  campaignReminders: true,
  weeklySummary: false
};

const DATA_KEYS = [
  "pagecrew_demo_pages",
  "pagecrew_demo_scheduled_posts",
  "pagecrew_standard_campaigns",
  "pagecrew_advanced_campaigns"
];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function Settings() {
  const [user, setUser] = useState(() => {
    const saved = readJSON(USER_KEY, {});
    return {
      name: saved?.name || "",
      email: saved?.email || ""
    };
  });

  const [preferences, setPreferences] = useState(() => ({
    ...DEFAULT_PREFS,
    ...readJSON(PREF_KEY, {})
  }));

  const [message, setMessage] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const showMessage = (text) => {
    setMessage(text);
  };

  const saveProfile = (event) => {
    event.preventDefault();

    const name = user.name.trim();
    const email = user.email.trim();

    if (!name || !email) {
      showMessage("Please enter your name and email.");
      return;
    }

    const previous = readJSON(USER_KEY, {});

    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        ...previous,
        name,
        email
      })
    );

    setUser({ name, email });
    showMessage("Profile saved successfully.");
  };

  const savePreferences = (event) => {
    event.preventDefault();

    localStorage.setItem(
      PREF_KEY,
      JSON.stringify(preferences)
    );

    showMessage("Workspace preferences saved.");
  };

  const updatePreference = (key, value) => {
    setPreferences((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const clearDemoData = () => {
    DATA_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });

    setConfirmClear(false);
    showMessage(
      "Demo pages, scheduled posts and campaigns cleared."
    );
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFS);

    localStorage.setItem(
      PREF_KEY,
      JSON.stringify(DEFAULT_PREFS)
    );

    showMessage("Default preferences restored.");
  };

  return (
    <div className="ps-settings">
      <div className="ps-heading">
        <div>
          <span className="ps-eyebrow">
            PAGECREW / SETTINGS
          </span>

          <h1>Workspace Settings</h1>

          <p>
            Personalize your PageCrew demo workspace.
          </p>
        </div>

        <div className="ps-demo-label">
          <ShieldCheck size={17} />
          Demo Mode
        </div>
      </div>

      {message && (
        <div className="ps-message" role="status">
          <CheckCircle2 size={18} />
          <span>{message}</span>
          <button
            onClick={() => setMessage("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <div className="ps-grid">
        <section className="ps-card">
          <div className="ps-card-heading">
            <div className="ps-icon">
              <UserRound size={21} />
            </div>

            <div>
              <h2>Profile Information</h2>
              <p>Update your demo account details.</p>
            </div>
          </div>

          <form onSubmit={saveProfile}>
            <div className="ps-field">
              <label htmlFor="ps-name">Full Name</label>
              <input
                id="ps-name"
                type="text"
                value={user.name}
                onChange={(event) =>
                  setUser((previous) => ({
                    ...previous,
                    name: event.target.value
                  }))
                }
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="ps-field">
              <label htmlFor="ps-email">
                Email Address
              </label>
              <input
                id="ps-email"
                type="email"
                value={user.email}
                onChange={(event) =>
                  setUser((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder="Enter your email"
                required
              />
            </div>

            <button className="ps-primary" type="submit">
              <Save size={17} />
              Save Profile
            </button>
          </form>
        </section>

        <section className="ps-card">
          <div className="ps-card-heading">
            <div className="ps-icon">
              <Settings2 size={21} />
            </div>

            <div>
              <h2>Workspace Preferences</h2>
              <p>Configure your default options.</p>
            </div>
          </div>

          <form onSubmit={savePreferences}>
            <div className="ps-field">
              <label htmlFor="ps-workspace">
                Workspace Name
              </label>
              <input
                id="ps-workspace"
                type="text"
                value={preferences.workspaceName}
                onChange={(event) =>
                  updatePreference(
                    "workspaceName",
                    event.target.value
                  )
                }
              />
            </div>

            <div className="ps-field">
              <label htmlFor="ps-timezone">
                Timezone Preference
              </label>

              <select
                id="ps-timezone"
                value={preferences.timezone}
                onChange={(event) =>
                  updatePreference(
                    "timezone",
                    event.target.value
                  )
                }
              >
                <option value="Asia/Kolkata">
                  India (Asia/Kolkata)
                </option>
                <option value="UTC">
                  UTC
                </option>
                <option value="America/New_York">
                  New York
                </option>
                <option value="Europe/London">
                  London
                </option>
              </select>
            </div>

            <div className="ps-field">
              <label htmlFor="ps-campaign">
                Default Campaign Type
              </label>

              <select
                id="ps-campaign"
                value={preferences.defaultCampaign}
                onChange={(event) =>
                  updatePreference(
                    "defaultCampaign",
                    event.target.value
                  )
                }
              >
                <option value="standard">
                  Standard Campaign
                </option>
                <option value="advanced">
                  Advanced Campaign
                </option>
              </select>
            </div>

            <button className="ps-primary" type="submit">
              <Save size={17} />
              Save Preferences
            </button>
          </form>
        </section>

        <section className="ps-card">
          <div className="ps-card-heading">
            <div className="ps-icon">
              <Bell size={21} />
            </div>

            <div>
              <h2>Notification Preferences</h2>
              <p>
                Save your preferred notification options.
              </p>
            </div>
          </div>

          <div className="ps-toggle-list">
            {[
              {
                key: "emailNotifications",
                title: "Email Notifications",
                description: "Preference only; email delivery is inactive."
              },
              {
                key: "campaignReminders",
                title: "Campaign Reminders",
                description: "Preference only; reminders are not scheduled."
              },
              {
                key: "weeklySummary",
                title: "Weekly Summary",
                description: "Preference only; reports are not sent."
              }
            ].map((item) => (
              <label
                className="ps-toggle-row"
                key={item.key}
              >
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </div>

                <input
                  type="checkbox"
                  checked={Boolean(
                    preferences[item.key]
                  )}
                  onChange={(event) =>
                    updatePreference(
                      item.key,
                      event.target.checked
                    )
                  }
                />
              </label>
            ))}
          </div>

          <button
            className="ps-primary"
            type="button"
            onClick={() => {
              localStorage.setItem(
                PREF_KEY,
                JSON.stringify(preferences)
              );
              showMessage(
                "Notification preferences saved."
              );
            }}
          >
            <Save size={17} />
            Save Notifications
          </button>
        </section>

        <section className="ps-card">
          <div className="ps-card-heading">
            <div className="ps-icon">
              <Database size={21} />
            </div>

            <div>
              <h2>Demo Data Management</h2>
              <p>Manage browser-stored sample content.</p>
            </div>
          </div>

          <div className="ps-data-info">
            <ShieldCheck size={20} />
            <p>
              Your demo pages, scheduled posts and
              campaign drafts are stored in this browser.
              Clearing them cannot be undone.
            </p>
          </div>

          <div className="ps-data-actions">
            <button
              className="ps-secondary"
              type="button"
              onClick={resetPreferences}
            >
              Reset Preferences
            </button>

            <button
              className="ps-danger"
              type="button"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={17} />
              Clear Demo Data
            </button>
          </div>
        </section>
      </div>

      <p className="ps-footer-note">
        PageCrew is currently a frontend demonstration.
        Preferences do not control real Facebook
        publishing, notifications or external services.
      </p>

      {confirmClear && (
        <div className="ps-modal-overlay">
          <div
            className="ps-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-confirm-title"
          >
            <AlertTriangle size={32} />

            <h2 id="ps-confirm-title">
              Clear all demo content?
            </h2>

            <p>
              This will remove saved demo pages,
              scheduled posts and campaign drafts
              from this browser. Your profile and
              preferences will remain.
            </p>

            <div className="ps-modal-actions">
              <button
                className="ps-secondary"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>

              <button
                className="ps-danger"
                onClick={clearDemoData}
              >
                Yes, Clear Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

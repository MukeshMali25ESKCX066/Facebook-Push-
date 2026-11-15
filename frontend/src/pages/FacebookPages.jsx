
import { useEffect, useState } from "react";

import {
  Search,
  Plus,
  Users,
  Layers3,
  CheckCircle2,
  Unlink,
  Link2,
  X,
  ShieldCheck
} from "lucide-react";

import {
  getPages,
  savePages
} from "../services/pageService";

import "./FacebookPages.css";

export default function FacebookPages() {
  const [pages, setPages] = useState(getPages);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [disconnectId, setDisconnectId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // Save pages using shared service
  useEffect(() => {
    savePages(pages);
  }, [pages]);

  const connectedCount = pages.filter(
    (page) => page.connected === true
  ).length;

  const filteredPages = pages.filter((page) =>
    `${page.name} ${page.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggleSelect = (id) => {
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  };

  const addPage = (event) => {
    event.preventDefault();

    const name = newName.trim();
    const category = newCategory.trim();

    if (!name) return;

    const duplicate = pages.some(
      (page) =>
        page.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      alert("A page with this name already exists.");
      return;
    }

    const newPage = {
      id: crypto.randomUUID(),
      name,
      category: category || "Facebook Page",
      followers: "0",
      connected: true
    };

    setPages((previous) => [
      ...previous,
      newPage
    ]);

    setNewName("");
    setNewCategory("");
    setShowModal(false);
  };

  const disconnectPage = () => {
    if (disconnectId === null) return;

    setPages((previous) =>
      previous.map((page) =>
        page.id === disconnectId
          ? { ...page, connected: false }
          : page
      )
    );

    setSelected((previous) =>
      previous.filter((id) => id !== disconnectId)
    );

    setDisconnectId(null);
  };

  const reconnectPage = (id) => {
    setPages((previous) =>
      previous.map((page) =>
        page.id === id
          ? { ...page, connected: true }
          : page
      )
    );
  };

  return (
    <div className="fb-pages">

      <div className="fb-pages-heading">
        <div>
          <span className="fb-eyebrow">
            PAGECREW / PAGE MANAGEMENT
          </span>

          <h1>Facebook Pages</h1>

          <p>
            Manage your Facebook Pages from one
            premium workspace.
          </p>
        </div>

        <button
          type="button"
          className="fb-primary-button"
          onClick={() => setShowModal(true)}
        >
          <Plus size={18} />
          Connect New Page
        </button>
      </div>

      <div className="fb-summary-grid">

        <div className="fb-summary-card">
          <Layers3 size={23} />
          <span>Total Pages</span>
          <strong>{pages.length}</strong>
        </div>

        <div className="fb-summary-card">
          <CheckCircle2 size={23} />
          <span>Connected Pages</span>
          <strong>{connectedCount}</strong>
        </div>

        <div className="fb-summary-card">
          <Users size={23} />
          <span>Selected Pages</span>
          <strong>{selected.length}</strong>
        </div>

        <div className="fb-summary-card">
          <ShieldCheck size={23} />
          <span>Connection Mode</span>
          <strong className="fb-mode-text">
            Demo
          </strong>
        </div>

      </div>

      <div className="fb-toolbar">
        <div className="fb-search">
          <Search size={19} />

          <input
            type="search"
            placeholder="Search Facebook Pages..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <span>
          {filteredPages.length} Pages Found
        </span>
      </div>

      <div className="fb-page-grid">

        {filteredPages.length === 0 ? (
          <div className="fb-empty">
            No Facebook Pages found.
          </div>
        ) : (
          filteredPages.map((page) => (
            <article
              className="fb-page-card"
              key={page.id}
            >

              <div className="fb-card-top">
                <div className="fb-page-avatar fb-purple">
                  {page.name.charAt(0).toUpperCase()}
                </div>

                <span
                  className={`fb-connection-status ${
                    page.connected
                      ? "fb-connected"
                      : "fb-disconnected"
                  }`}
                >
                  {page.connected
                    ? "Connected"
                    : "Disconnected"}
                </span>
              </div>

              <h3>{page.name}</h3>
              <p>{page.category}</p>

              <div className="fb-page-meta">
                <span>
                  <Users size={15} />
                  {page.followers} Followers
                </span>

                <span>
                  <Layers3 size={15} />
                  Facebook Page
                </span>
              </div>

              <div className="fb-card-actions">

                <label className="fb-select-label">
                  <input
                    type="checkbox"
                    checked={selected.includes(page.id)}
                    disabled={!page.connected}
                    onChange={() =>
                      toggleSelect(page.id)
                    }
                  />
                  Select
                </label>

                {page.connected ? (
                  <button
                    type="button"
                    className="fb-disconnect-button"
                    onClick={() =>
                      setDisconnectId(page.id)
                    }
                  >
                    <Unlink size={15} />
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fb-reconnect-button"
                    onClick={() =>
                      reconnectPage(page.id)
                    }
                  >
                    <Link2 size={15} />
                    Reconnect
                  </button>
                )}

              </div>
            </article>
          ))
        )}

      </div>

      <p className="fb-demo-note">
        Demo mode: Page information and connection
        statuses are sample data. No real Facebook
        account is connected.
      </p>

      {showModal && (
        <div className="fb-modal-overlay">
          <div
            className="fb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fb-add-title"
          >
            <div className="fb-modal-header">
              <h2 id="fb-add-title">
                Add Demo Facebook Page
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowModal(false)
                }
                aria-label="Close modal"
              >
                <X size={21} />
              </button>
            </div>

            <p>
              Add a sample page to your
              PageCrew dashboard.
            </p>

            <form onSubmit={addPage}>

              <label htmlFor="fb-page-name">
                Page Name
              </label>

              <input
                id="fb-page-name"
                type="text"
                placeholder="Example: My Business Page"
                value={newName}
                onChange={(event) =>
                  setNewName(event.target.value)
                }
                required
                maxLength={100}
              />

              <label htmlFor="fb-page-category">
                Page Category
              </label>

              <input
                id="fb-page-category"
                type="text"
                placeholder="Example: Digital Creator"
                value={newCategory}
                onChange={(event) =>
                  setNewCategory(event.target.value)
                }
                maxLength={80}
              />

              <button
                type="submit"
                className="fb-primary-button"
              >
                <Plus size={17} />
                Add Demo Page
              </button>

            </form>
          </div>
        </div>
      )}

      {disconnectId !== null && (
        <div className="fb-modal-overlay">
          <div
            className="fb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fb-disconnect-title"
          >
            <h2 id="fb-disconnect-title">
              Disconnect Facebook Page?
            </h2>

            <p>
              This will update the demo connection
              status. No real Facebook account
              will be affected.
            </p>

            <div className="fb-confirm-actions">
              <button
                type="button"
                className="fb-cancel-button"
                onClick={() =>
                  setDisconnectId(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="fb-danger-button"
                onClick={disconnectPage}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

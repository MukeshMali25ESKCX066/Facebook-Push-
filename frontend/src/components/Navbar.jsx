
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Menu,
  X,
  ArrowRight
} from "lucide-react";
import BrandLogo from "./BrandLogo";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" }
  ];

  return (
    <header className="pc-landing-navbar">
      <div className="pc-landing-nav-container">

        {/* Logo */}
        <Link
          to="/"
          className="pc-landing-logo"
          onClick={closeMenu}
        >
          <BrandLogo className="pc-landing-logo-image" />
          <span>
            Page
            <span className="pc-landing-logo-gold">
              Crew
            </span>
          </span>
        </Link>

        {/* Navigation Links */}
        <nav
          className={`pc-landing-nav-links ${
            menuOpen ? "pc-landing-nav-open" : ""
          }`}
          aria-label="Main navigation"
        >
          {navLinks.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="pc-landing-nav-link"
              onClick={closeMenu}
            >
              {item.label}
            </a>
          ))}

          {/* Mobile Buttons */}
          <div className="pc-landing-mobile-actions">
            <Link
              to="/login"
              className="pc-landing-login"
              onClick={closeMenu}
            >
              Login
            </Link>

            <Link
              to="/signup"
              className="pc-landing-signup"
              onClick={closeMenu}
            >
              Get Started
              <ArrowRight size={17} />
            </Link>
          </div>
        </nav>

        {/* Desktop Buttons */}
        <div className="pc-landing-desktop-actions">
          <Link
            to="/login"
            className="pc-landing-login"
          >
            Login
          </Link>

          <Link
            to="/signup"
            className="pc-landing-signup"
          >
            Get Started
            <ArrowRight size={17} />
          </Link>
        </div>

        {/* Mobile Menu */}
        <button
          type="button"
          className="pc-landing-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <X size={24} />
          ) : (
            <Menu size={24} />
          )}
        </button>

      </div>
    </header>
  );
}

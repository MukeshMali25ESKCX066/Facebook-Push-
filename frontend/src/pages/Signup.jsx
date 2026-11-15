import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  UserRound
} from "lucide-react";
import { useAuth } from "../auth-context";
import BrandLogo from "../components/BrandLogo";
import { register } from "../services/authService";
import "../Auth.css";

export default function Signup() {
  const navigate = useNavigate();
  const { acceptAuth } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("IN");
  const [accountType, setAccountType] = useState("creator");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await register({
        fullName: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        country,
        accountType,
        termsAccepted
      });
      acceptAuth(result);
      navigate("/approval-pending", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-glow" />
      <div className="auth-card">
        <Link to="/" className="auth-logo">
          <BrandLogo />
          PageCrew
        </Link>
        <div className="auth-heading">
          <span>GET STARTED</span>
          <h1>Create Your Account</h1>
          <p>Start your smarter publishing journey.</p>
        </div>
        <form onSubmit={handleSignup} className="auth-form">
          <label htmlFor="signup-name">Full Name</label>
          <div className="auth-input">
            <UserRound size={19} />
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              placeholder="Your full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={150}
            />
          </div>
          <label htmlFor="signup-email">Email Address</label>
          <div className="auth-input">
            <Mail size={19} />
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <label htmlFor="signup-password">Password</label>
          <div className="auth-input">
            <LockKeyhole size={19} />
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              placeholder="8+ chars, upper/lowercase, number and symbol"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>
          <label htmlFor="signup-country">Country</label>
          <select
            id="signup-country"
            className="auth-select"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            required
          >
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
            <option value="OT">Other</option>
          </select>
          <label htmlFor="signup-account-type">Account Type</label>
          <select
            id="signup-account-type"
            className="auth-select"
            value={accountType}
            onChange={(event) => setAccountType(event.target.value)}
            required
          >
            <option value="creator">Creator</option>
            <option value="business">Business</option>
            <option value="manager">Social Media Manager</option>
            <option value="agency">Agency</option>
          </select>
          <label className="auth-terms">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              required
            />
            <span>I agree to the Terms of Service and Privacy Policy.</span>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create Account"} <ArrowRight size={19} />
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
        <p className="auth-note">New accounts require super admin approval.</p>
      </div>
    </main>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "../auth-context";
import BrandLogo from "../components/BrandLogo";
import { login } from "../services/authService";
import "../Auth.css";

export default function Login() {
  const { acceptAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      acceptAuth(result);
      window.location.assign("/legacy#dashboard");
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
          <span>WELCOME BACK</span>
          <h1>Login to PageCrew</h1>
          <p>Access your publishing workspace.</p>
        </div>
        <form onSubmit={handleLogin} className="auth-form">
          <label htmlFor="login-email">Email Address</label>
          <div className="auth-input">
            <Mail size={19} />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <label htmlFor="login-password">Password</label>
          <div className="auth-input">
            <LockKeyhole size={19} />
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Login"} <ArrowRight size={19} />
          </button>
        </form>
        <p className="auth-switch">
          Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
        </p>
        <p className="auth-note">
          Super admin? <a href="/suuperadmin">Open admin sign-in</a>
        </p>
        {["localhost", "127.0.0.1"].includes(window.location.hostname) && (
          <p className="auth-demo-note">
            Local sign-in uses accounts registered on this server. Production accounts require the production database.
          </p>
        )}
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth-context";
import BrandLogo from "../components/BrandLogo";
import {
  adminLogin,
  verifyAdminLogin
} from "../services/authService";
import "../Auth.css";

export default function SuperAdmin() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") window.location.replace("/legacy#dashboard");
  }, [user]);

  if (loading) {
    return <main className="auth-page"><p role="status">Checking your PageCrew session…</p></main>;
  }
  if (user?.role === "admin") {
    return <main className="auth-page"><p role="status">Opening the PageCrew admin dashboard…</p></main>;
  }

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await adminLogin(email.trim().toLowerCase(), password);
      if (result.requiresTotp) {
        setChallengeToken(result.challengeToken);
      } else {
        window.location.assign("/legacy#dashboard");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await verifyAdminLogin(challengeToken, code.trim());
      window.location.assign("/legacy#dashboard");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page admin-page">
      <div className="auth-glow" />
      <section className="auth-card admin-card">
        <Link to="/" className="auth-logo"><BrandLogo />PageCrew</Link>
        <div className="auth-heading">
          <span>SECURE ADMIN ACCESS</span>
          <h1>Super Admin</h1>
          <p>Sign in to review and manage PageCrew accounts.</p>
        </div>
        <form onSubmit={challengeToken ? handleVerify : handleLogin} className="auth-form">
          {!challengeToken ? (
            <>
              <label htmlFor="admin-email">Admin Email</label>
              <div className="auth-input">
                <Mail size={19} />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  placeholder="Admin email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <label htmlFor="admin-password">Password</label>
              <div className="auth-input">
                <LockKeyhole size={19} />
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Admin password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <label htmlFor="admin-code">Authenticator Code</label>
              <div className="auth-input">
                <ShieldCheck size={19} />
                <input
                  id="admin-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>
            </>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Verifying…" : challengeToken ? "Verify code" : "Secure sign in"}
            <ArrowRight size={19} />
          </button>
        </form>
        <p className="auth-switch"><Link to="/login">Return to PageCrew login</Link></p>
      </section>
    </main>
  );
}

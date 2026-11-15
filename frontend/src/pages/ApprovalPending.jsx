import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Clock3 } from "lucide-react";
import { useAuth } from "../auth-context";
import { logout } from "../services/authService";
import BrandLogo from "../components/BrandLogo";
import "../Auth.css";

export default function ApprovalPending() {
  const { user, loading, error, refresh, clearAuth } = useAuth();
  const [logoutError, setLogoutError] = useState("");

  if (loading) {
    return <main className="auth-page"><p role="status">Checking your account…</p></main>;
  }
  if (error) {
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <h1>Could not verify your account</h1>
          <p>{error.message}</p>
          <button type="button" className="auth-submit" onClick={refresh}>Try again</button>
        </section>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/suuperadmin" replace />;
  if (user.status === "approved" || user.isApproved || user.approved) {
    return <Navigate to="/dashboard" replace />;
  }

  const rejected = user.status === "rejected";
  const handleLogout = async () => {
    setLogoutError("");
    try {
      await logout();
      clearAuth();
      window.location.replace("/dashboard-choice");
    } catch (requestError) {
      setLogoutError(requestError.message);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link to="/" className="auth-logo">
          <BrandLogo />
          PageCrew
        </Link>
        <div className="auth-heading">
          <span>ACCOUNT REVIEW</span>
          <h1>{rejected ? "Registration not approved" : "Approval pending"}</h1>
          <p>
            {rejected
              ? "Please contact the super admin about your registration."
              : "Your account is waiting for super admin approval. You can sign in after it is approved."}
          </p>
        </div>
        {!rejected && <Clock3 size={30} aria-hidden="true" />}
        {logoutError && <p className="auth-error" role="alert">{logoutError}</p>}
        {!rejected && (
          <button type="button" className="auth-submit" onClick={refresh}>
            Check approval status
          </button>
        )}
        <button type="button" className="auth-submit" onClick={handleLogout}>
          Log out <ArrowRight size={18} />
        </button>
      </section>
    </main>
  );
}

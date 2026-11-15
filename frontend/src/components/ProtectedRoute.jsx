
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth-context";

export default function ProtectedRoute() {
  const { user, session, loading, error, refresh } = useAuth();

  if (loading) {
    return <main className="auth-page"><p role="status">Checking your PageCrew session…</p></main>;
  }
  if (error) {
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <h1>Could not verify your session</h1>
          <p>{error.message}</p>
          <button type="button" className="auth-submit" onClick={refresh}>Try again</button>
        </section>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/suuperadmin" replace />;
  if (user.status !== "approved" && !user.isApproved && !user.approved) {
    return <Navigate to="/approval-pending" replace />;
  }

  return <Outlet context={{ user, session }} />;
}

import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      textAlign: "center",
      padding: "2rem",
    }}>
      <div style={{ fontSize: "5rem", marginBottom: "1rem" }}>🗺️</div>
      <h1 style={{ fontSize: "3rem", color: "var(--primary)", fontFamily: "var(--font)" }}>404</h1>
      <h2 style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>Página no encontrada</h2>
      <p style={{ color: "var(--text-muted)", maxWidth: 400, marginBottom: "2rem" }}>
        La página que buscas no existe o no tienes permisos para acceder a ella.
      </p>
      <Link to="/" className="btn btn-primary">
        ← Volver al inicio
      </Link>
    </div>
  );
}

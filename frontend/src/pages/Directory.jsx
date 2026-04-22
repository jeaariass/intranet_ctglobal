import { useEffect, useState } from "react";
import api from "../services/api";

function getInitials(n, a) { return `${n?.[0] || ""}${a?.[0] || ""}`.toUpperCase(); }

const AVATAR_COLORS = ["#1a3a5c", "#2d7d46", "#7b2d8b", "#c0392b", "#d68910", "#2980b9"];

function avatarColor(id) { return AVATAR_COLORS[id % AVATAR_COLORS.length]; }

export default function Directory() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("todos");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/users").then((r) => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const areas = ["todos", ...new Set(users.map((u) => u.area).filter(Boolean))];

  const filtered = users.filter((u) => {
    const matchArea = areaFilter === "todos" || u.area === areaFilter;
    const matchSearch =
      `${u.nombre} ${u.apellido} ${u.cargo} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    return matchArea && matchSearch;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Directorio</h1>
          <p>Equipo de colaboradores CTGlobal</p>
        </div>
        <div style={{ background: "var(--primary)", color: "#fff", borderRadius: 8, padding: "0.5rem 1rem", fontSize: "0.85rem", fontWeight: 600 }}>
          {users.length} colaboradores
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
          <span className="search-box-icon">🔍</span>
          <input
            placeholder="Buscar por nombre, cargo, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {areas.map((a) => (
            <button
              key={a}
              onClick={() => setAreaFilter(a)}
              className={`btn btn-sm ${areaFilter === a ? "btn-primary" : "btn-outline"}`}
              style={{ textTransform: "capitalize" }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👤</div>
          <h3>Sin resultados</h3>
        </div>
      ) : (
        <div className="employee-grid">
          {filtered.map((u) => (
            <div key={u.id} className="employee-card">
              <div className="avatar avatar-lg" style={{ margin: "0 auto", background: avatarColor(u.id) }}>
                {u.avatar ? (
                  <img src={u.avatar} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  getInitials(u.nombre, u.apellido)
                )}
              </div>
              <div className="employee-name">{u.nombre} {u.apellido}</div>
              {u.cargo && <div className="employee-cargo">{u.cargo}</div>}
              {u.area && (
                <div className="employee-area">
                  <span className="badge badge-blue" style={{ marginTop: "0.35rem" }}>{u.area}</span>
                </div>
              )}
              <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <a href={`mailto:${u.email}`} style={{ fontSize: "0.78rem", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                  ✉️ {u.email}
                </a>
                {u.telefono && (
                  <a href={`tel:${u.telefono}`} style={{ fontSize: "0.78rem", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                    📞 {u.telefono}
                  </a>
                )}
              </div>
              <div style={{ marginTop: "0.5rem" }}>
                <span className={`badge ${u.rol === "ADMIN" ? "badge-red" : "badge-gray"}`}>
                  {u.rol === "ADMIN" ? "Admin" : "Colaborador"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

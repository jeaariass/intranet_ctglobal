import { useEffect, useState } from "react";
import api from "../services/api";

function getInitials(n, a) { return `${n?.[0] || ""}${a?.[0] || ""}`.toUpperCase(); }

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", apellido: "", email: "", password: "", cargo: "", area: "", telefono: "", rol: "empleado" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.post("/users", form);
      setShowModal(false);
      setForm({ nombre: "", apellido: "", email: "", password: "", cargo: "", area: "", telefono: "", rol: "empleado" });
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm("¿Desactivar este usuario?")) return;
    await api.delete(`/users/${id}`);
    load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Panel de administración</h1>
          <p>Gestión de usuarios y configuración del sistema</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nuevo usuario
        </button>
      </div>

      {/* Stats rápidos */}
      <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card">
          <div className="stat-icon blue">👥</div>
          <div>
            <div className="stat-value">{users.length}</div>
            <div className="stat-label">Usuarios activos</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">⚙️</div>
          <div>
            <div className="stat-value">{users.filter((u) => u.rol === "ADMIN").length}</div>
            <div className="stat-label">Administradores</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">🏢</div>
          <div>
            <div className="stat-value">{new Set(users.map((u) => u.area).filter(Boolean)).size}</div>
            <div className="stat-label">Áreas</div>
          </div>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="card">
        <div className="card-header">
          <h2>Usuarios del sistema</h2>
        </div>
        {loading ? (
          <div className="loader"><div className="spinner" /></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Cargo</th>
                  <th>Área</th>
                  <th>Rol</th>
                  <th>Miembro desde</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div className="avatar avatar-sm" style={{ background: "var(--primary)" }}>
                          {getInitials(u.nombre, u.apellido)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.nombre} {u.apellido}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: "0.88rem" }}>{u.cargo || "—"}</td>
                    <td style={{ fontSize: "0.88rem" }}>{u.area || "—"}</td>
                    <td>
                      <span className={`badge ${u.rol === "ADMIN" ? "badge-red" : "badge-blue"}`}>
                        {u.rol === "ADMIN" ? "Admin" : "Colaborador"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {new Date(u.created_at).toLocaleDateString("es-CO")}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeactivate(u.id)}
                      >
                        Desactivar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear usuario */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Crear usuario</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido</label>
                    <input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Correo corporativo</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña inicial</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 caracteres" />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Cargo</label>
                    <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Área</label>
                    <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                      <option value="empleado">Colaborador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creando..." : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

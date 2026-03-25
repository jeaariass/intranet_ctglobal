import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";

function getInitials(n, a) { return `${n?.[0] || ""}${a?.[0] || ""}`.toUpperCase(); }

export default function Profile() {
  const { user, login } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    nombre: user?.nombre || "",
    apellido: user?.apellido || "",
    cargo: user?.cargo || "",
    area: user?.area || "",
    telefono: user?.telefono || "",
  });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/users/${user.id}`, form);
      setMsg("Perfil actualizado correctamente");
      setEditing(false);
    } catch {
      setMsg("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(""); setPwMsg("");
    if (pwForm.newPassword !== pwForm.confirm) {
      setPwError("Las contraseñas nuevas no coinciden");
      return;
    }
    try {
      await api.post("/auth/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg("Contraseña actualizada");
      setPwForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      setPwError(err.response?.data?.error || "Error al cambiar contraseña");
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Mi perfil</h1>
          <p>Información personal y configuración de cuenta</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Tarjeta de perfil */}
        <div className="card">
          <div className="card-header">
            <h2>Información personal</h2>
            {!editing && (
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>Editar</button>
            )}
          </div>
          <div className="card-body">
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
              <div className="avatar avatar-lg" style={{ background: "var(--primary)", fontSize: "1.4rem" }}>
                {getInitials(user?.nombre, user?.apellido)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{user?.nombre} {user?.apellido}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{user?.cargo}</div>
                <span className={`badge ${user?.rol === "admin" ? "badge-red" : "badge-blue"}`} style={{ marginTop: "0.35rem" }}>
                  {user?.rol === "admin" ? "Administrador" : "Colaborador"}
                </span>
              </div>
            </div>

            {msg && <div className="alert alert-success">{msg}</div>}

            {editing ? (
              <form onSubmit={handleSave}>
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
                  <label className="form-label">Cargo</label>
                  <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Área</label>
                    <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {[
                  { label: "Correo", value: user?.email, icon: "✉️" },
                  { label: "Cargo", value: user?.cargo || "—", icon: "💼" },
                  { label: "Área", value: user?.area || "—", icon: "🏢" },
                  { label: "Teléfono", value: user?.telefono || "—", icon: "📞" },
                  { label: "Miembro desde", value: user?.created_at ? format(new Date(user.created_at), "d 'de' MMMM, yyyy", { locale: es }) : "—", icon: "📅" },
                ].map(({ label, value, icon }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "1.1rem", width: 24 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontWeight: 500 }}>{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cambiar contraseña */}
        <div className="card">
          <div className="card-header"><h2>Cambiar contraseña</h2></div>
          <div className="card-body">
            {pwMsg && <div className="alert alert-success">{pwMsg}</div>}
            {pwError && <div className="alert alert-error">{pwError}</div>}
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Contraseña actual</label>
                <input
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva contraseña</label>
                <input
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  minLength={8}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirmar nueva contraseña</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                Cambiar contraseña
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

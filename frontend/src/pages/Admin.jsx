import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import PasswordInput from "../components/PasswordInput";

const ROLES = [
  { value: "ADMIN",        label: "Administrador" },
  { value: "EDITOR",       label: "Editor" },
  { value: "EMPLEADO",     label: "Colaborador" },
  { value: "CONTRATISTA",  label: "Contratista" },
  { value: "CONTABILIDAD", label: "Contabilidad" },
  { value: "SUPERVISION",  label: "Supervisión" },
  { value: "TESORERIA",    label: "Tesorería" },
];

const ROLE_BADGE = {
  ADMIN:        "badge-red",
  EDITOR:       "badge-purple",
  EMPLEADO:     "badge-blue",
  CONTRATISTA:  "badge-green",
  CONTABILIDAD: "badge-orange",
  SUPERVISION:  "badge-teal",
  TESORERIA:    "badge-gray",
};

const labelOfRol = (r) => ROLES.find((x) => x.value === r)?.label || r;

const emptyCreate = {
  nombre: "", apellido: "", email: "", password: "",
  cargo: "", area: "", telefono_whatsapp: "", rol: "EMPLEADO",
  cedula: "", direccion: "",
  tarjeta_profesional: "", es_persona_juridica: null,
};

function getInitials(n, a) {
  return `${n?.[0] || ""}${a?.[0] || ""}`.toUpperCase();
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [inactivos, setInactivos] = useState([]);
  const [view, setView] = useState("activos"); // "activos" | "inactivos"
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterRol, setFilterRol] = useState("ALL");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/users").then((r) => setUsers(r.data)),
      api.get("/users/inactivos").then((r) => setInactivos(r.data)).catch(() => setInactivos([])),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const source = view === "inactivos" ? inactivos : users;
    return source.filter((u) => {
      if (filterRol !== "ALL" && u.rol !== filterRol) return false;
      if (!s) return true;
      return [u.nombre, u.apellido, u.email, u.cargo, u.area, u.cedula]
        .some((v) => (v || "").toLowerCase().includes(s));
    });
  }, [users, inactivos, view, filterRol, search]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.post("/users", createForm);
      setShowCreate(false);
      setCreateForm(emptyCreate);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u) => {
    setEditing(u);
    setEditForm({
      nombre: u.nombre || "",
      apellido: u.apellido || "",
      cargo: u.cargo || "",
      area: u.area || "",
      telefono_whatsapp: u.telefono_whatsapp || "",
      rol: u.rol,
      cedula: u.cedula || "",
      direccion: u.direccion || "",
      tarjeta_profesional: u.tarjeta_profesional || "",
      es_persona_juridica: u.es_persona_juridica ?? null,
    });
    setError("");
  };

  const closeEdit = () => { setEditing(null); setEditForm(null); };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.put(`/users/${editing.id}`, editForm);
      closeEdit();
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Error al actualizar usuario");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm("¿Desactivar este usuario?")) return;
    await api.delete(`/users/${id}`);
    load();
  };

  const handleReactivate = async (id) => {
    if (!confirm("¿Reactivar este usuario? Podrá volver a iniciar sesión.")) return;
    await api.patch(`/users/${id}/reactivar`);
    load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Panel de administración</h1>
          <p>Gestión de usuarios y configuración del sistema</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
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
          <div className="stat-icon green">📝</div>
          <div>
            <div className="stat-value">{users.filter((u) => u.rol === "CONTRATISTA").length}</div>
            <div className="stat-label">Contratistas</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏢</div>
          <div>
            <div className="stat-value">{new Set(users.map((u) => u.area).filter(Boolean)).size}</div>
            <div className="stat-label">Áreas</div>
          </div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: "pointer" }}
          onClick={() => setView("inactivos")}
          title="Ver usuarios desactivados"
        >
          <div className="stat-icon gray">🚫</div>
          <div>
            <div className="stat-value">{inactivos.length}</div>
            <div className="stat-label">Desactivados</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-body" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", padding: "0.75rem 1rem" }}>
          <input
            placeholder="Buscar por nombre, email, área, cédula…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <select value={filterRol} onChange={(e) => setFilterRol(e.target.value)}>
            <option value="ALL">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {filtered.length} de {users.length}
          </span>
        </div>
      </div>

      {/* Tabla de usuarios */}
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{view === "inactivos" ? "Usuarios desactivados" : "Usuarios del sistema"}</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className={`btn btn-sm ${view === "activos" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("activos")}
            >
              Activos ({users.length})
            </button>
            <button
              className={`btn btn-sm ${view === "inactivos" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("inactivos")}
            >
              Desactivados ({inactivos.length})
            </button>
          </div>
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
                {filtered.map((u) => (
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
                      <span className={`badge ${ROLE_BADGE[u.rol] || "badge-blue"}`}>
                        {labelOfRol(u.rol)}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {new Date(u.created_at).toLocaleDateString("es-CO")}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {view === "inactivos" ? (
                        <button className="btn btn-primary btn-sm" onClick={() => handleReactivate(u.id)}>
                          Reactivar
                        </button>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                            Editar
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(u.id)}>
                            Desactivar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)" }}>
                      Sin resultados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear */}
      {showCreate && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Crear usuario</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input value={createForm.nombre} onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido</label>
                    <input value={createForm.apellido} onChange={(e) => setCreateForm({ ...createForm, apellido: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Correo corporativo</label>
                  <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña inicial</label>
                  <PasswordInput
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Min. 8 caracteres"
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Cargo</label>
                    <input value={createForm.cargo} onChange={(e) => setCreateForm({ ...createForm, cargo: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Área</label>
                    <input value={createForm.area} onChange={(e) => setCreateForm({ ...createForm, area: e.target.value })} />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">WhatsApp</label>
                    <input
                      value={createForm.telefono_whatsapp}
                      onChange={(e) => setCreateForm({ ...createForm, telefono_whatsapp: e.target.value })}
                      placeholder="+573001234567"
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Usado por el módulo de Recordatorios. Formato: +57 + número (sin espacios).
                    </span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select value={createForm.rol} onChange={(e) => setCreateForm({ ...createForm, rol: e.target.value })}>
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {createForm.rol === "CONTRATISTA" && (
                  <ContractorFields form={createForm} setForm={setCreateForm} />
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creando..." : "Crear usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editing && editForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeEdit()}>
          <div className="modal">
            <div className="modal-header">
              <h3>Editar {editing.nombre} {editing.apellido}</h3>
              <button className="btn btn-ghost btn-sm" onClick={closeEdit}>✕</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group">
                  <label className="form-label">Correo</label>
                  <input value={editing.email} disabled />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido</label>
                    <input value={editForm.apellido} onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })} required />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Cargo</label>
                    <input value={editForm.cargo} onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Área</label>
                    <input value={editForm.area} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })} />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">WhatsApp</label>
                    <input
                      value={editForm.telefono_whatsapp}
                      onChange={(e) => setEditForm({ ...editForm, telefono_whatsapp: e.target.value })}
                      placeholder="+573001234567"
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Usado por el módulo de Recordatorios. Formato: +57 + número (sin espacios).
                    </span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select value={editForm.rol} onChange={(e) => setEditForm({ ...editForm, rol: e.target.value })}>
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {editForm.rol === "CONTRATISTA" && (
                  <>
                    <ContractorFields form={editForm} setForm={setEditForm} />
                    <div className="alert alert-info" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
                      Banco, número de cuenta, tipo de cuenta, contrato de referencia y proyecto por defecto
                      se administran desde el panel de Trámites.
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeEdit}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ContractorFields({ form, setForm }) {
  const personaValue =
    form.es_persona_juridica === null || form.es_persona_juridica === undefined
      ? ""
      : String(form.es_persona_juridica);

  return (
    <>
      <h4 style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Datos del contratista</h4>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Cédula</label>
          <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Dirección</label>
          <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </div>
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Tarjeta profesional</label>
          <input
            value={form.tarjeta_profesional}
            onChange={(e) => setForm({ ...form, tarjeta_profesional: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Tipo de persona</label>
          <select
            value={personaValue}
            onChange={(e) => {
              const v = e.target.value;
              setForm({ ...form, es_persona_juridica: v === "" ? null : v === "true" });
            }}
          >
            <option value="">Sin definir</option>
            <option value="false">Natural</option>
            <option value="true">Jurídica</option>
          </select>
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const TIPOS = ["general", "comunicado", "evento", "urgente"];
const PRIORIDADES = ["normal", "alta"];

export default function Announcements() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ titulo: "", contenido: "", tipo: "comunicado", prioridad: "normal" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("todos");

  const load = () => {
    api.get("/announcements").then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/announcements", form);
      setShowModal(false);
      setForm({ titulo: "", contenido: "", tipo: "comunicado", prioridad: "normal" });
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este comunicado?")) return;
    await api.delete(`/announcements/${id}`);
    load();
  };

  const filtered = filter === "todos" ? items : items.filter((i) => i.tipo === filter);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Comunicados</h1>
          <p>Noticias y anuncios internos del equipo CTGlobal</p>
        </div>
        {user?.rol === "admin" && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nuevo comunicado
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {["todos", "comunicado", "evento", "urgente", "general"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-outline"}`}
            style={{ textTransform: "capitalize" }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h3>No hay comunicados</h3>
          <p>Aún no se han publicado comunicados en esta categoría.</p>
        </div>
      ) : (
        filtered.map((a) => (
          <div key={a.id} className={`announcement-card ${a.prioridad}`} style={{ marginBottom: "1rem" }}>
            <div className="announcement-card-header">
              <div>
                <div className="announcement-title" style={{ fontSize: "1.05rem" }}>{a.titulo}</div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                  <span className="badge badge-blue" style={{ textTransform: "capitalize" }}>{a.tipo}</span>
                  {a.prioridad === "alta" && <span className="badge badge-red">Alta prioridad</span>}
                </div>
              </div>
              {user?.rol === "admin" && (
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>
                  Eliminar
                </button>
              )}
            </div>
            <div className="announcement-body" style={{ marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>
              {a.contenido}
            </div>
            <div className="announcement-meta" style={{ marginTop: "0.75rem" }}>
              Publicado por <strong>{a.autor_nombre}</strong> ·{" "}
              {format(new Date(a.created_at), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
            </div>
          </div>
        ))
      )}

      {/* Modal crear */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Nuevo comunicado</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Título</label>
                  <input
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Título del comunicado"
                    required
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                      {TIPOS.map((t) => <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prioridad</label>
                    <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                      {PRIORIDADES.map((p) => <option key={p} value={p} style={{ textTransform: "capitalize" }}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Contenido</label>
                  <textarea
                    rows={5}
                    value={form.contenido}
                    onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                    placeholder="Escribe el contenido del comunicado..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Publicando..." : "Publicar comunicado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

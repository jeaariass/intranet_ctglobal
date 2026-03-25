import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function GeoProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre:"", descripcion:"", cliente:"", url:"",
    geoserverUrl:"", geoserverWorkspace:"", fechaInicio:"", fechaFin:"",
  });

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const load = () => {
    api.get("/geoprojects").then(r => setProjects(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/geoprojects", form);
      setShowModal(false);
      setForm({ nombre:"",descripcion:"",cliente:"",url:"",geoserverUrl:"",geoserverWorkspace:"",fechaInicio:"",fechaFin:"" });
      load();
    } finally { setSaving(false); }
  };

  const handleToggle = async (id) => {
    await api.patch(`/geoprojects/${id}/toggle`);
    load();
  };

  const daysUntil = (date) => {
    if (!date) return null;
    const diff = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Geovisores</h1>
          <p>Proyectos GIS activos y gestión de accesos por proyecto</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nuevo geovisor
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom:"1.5rem" }}>
        <div className="stat-card">
          <div className="stat-icon blue">🗺️</div>
          <div>
            <div className="stat-value">{projects.length}</div>
            <div className="stat-label">Total proyectos</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div>
            <div className="stat-value">{projects.filter(p => p.activo).length}</div>
            <div className="stat-label">Activos</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">👥</div>
          <div>
            <div className="stat-value">
              {projects.reduce((a, p) => a + (p._count?.projectUsers || 0), 0)}
            </div>
            <div className="stat-label">Usuarios totales</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">⚠️</div>
          <div>
            <div className="stat-value">
              {projects.filter(p => {
                const d = daysUntil(p.fecha_fin);
                return d !== null && d <= 30 && d >= 0 && p.activo;
              }).length}
            </div>
            <div className="stat-label">Contratos por vencer</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗺️</div>
          <h3>Sin geovisores</h3>
          <p>Crea el primer geovisor para comenzar.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {projects.map(p => {
            const dias = daysUntil(p.fecha_fin);
            const expirando = dias !== null && dias <= 30 && dias >= 0;
            const expirado = dias !== null && dias < 0;
            return (
              <div key={p.id} className="card" style={{ padding:"1.25rem 1.5rem" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"1rem" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"0.5rem" }}>
                      <span style={{ fontFamily:"monospace", fontSize:"0.8rem",
                        background:"var(--primary)", color:"#fff",
                        padding:"0.15rem 0.5rem", borderRadius:4, fontWeight:700 }}>
                        {p.codigo}
                      </span>
                      <span style={{ fontWeight:700, fontSize:"1rem" }}>{p.nombre}</span>
                      <span className={`badge ${p.activo ? "badge-green" : "badge-gray"}`}>
                        {p.activo ? "● Activo" : "⏸ Pausado"}
                      </span>
                      {expirando && (
                        <span className="badge badge-yellow">⚠️ Vence en {dias}d</span>
                      )}
                      {expirado && (
                        <span className="badge badge-red">❌ Contrato vencido</span>
                      )}
                    </div>
                    <div style={{ fontSize:"0.85rem", color:"var(--text-muted)", marginBottom:"0.6rem" }}>
                      {p.cliente && <span>🏢 {p.cliente} · </span>}
                      {p.descripcion}
                    </div>
                    <div style={{ display:"flex", gap:"1.5rem", fontSize:"0.82rem", flexWrap:"wrap" }}>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer"
                          style={{ color:"var(--primary)" }}>
                          🔗 Ver geovisor
                        </a>
                      )}
                      {p.geoserver_workspace && (
                        <span style={{ color:"var(--text-muted)" }}>
                          GeoServer: <code>{p.geoserver_workspace}</code>
                        </span>
                      )}
                      <span style={{ color:"var(--text-muted)" }}>
                        👥 {p._count?.projectUsers || 0} usuarios
                      </span>
                      <span style={{ color:"var(--text-muted)" }}>
                        📊 {p._count?.sessions || 0} sesiones totales
                      </span>
                      {p.fecha_fin && (
                        <span style={{ color: expirado ? "var(--danger)" : expirando ? "var(--warning)" : "var(--text-muted)" }}>
                          📅 Contrato hasta {format(new Date(p.fecha_fin), "d MMM yyyy", { locale:es })}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div style={{ display:"flex", gap:"0.5rem", flexShrink:0 }}>
                      <Link to={`/geovisores/${p.id}`} className="btn btn-outline btn-sm">
                        Gestionar
                      </Link>
                      <button
                        onClick={() => handleToggle(p.id)}
                        className={`btn btn-sm ${p.activo ? "btn-ghost" : "btn-accent"}`}>
                        {p.activo ? "⏸ Pausar" : "▶ Activar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nuevo geovisor */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:580 }}>
            <div className="modal-header">
              <h3>Nuevo geovisor</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre del proyecto</label>
                  <input value={form.nombre} onChange={e => setForm({...form,nombre:e.target.value})}
                    placeholder="Ej: Dosquebradas - Estratificación 360°" required />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Cliente / Entidad</label>
                    <input value={form.cliente} onChange={e => setForm({...form,cliente:e.target.value})}
                      placeholder="Ej: Alcaldía de Dosquebradas" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL del geovisor</label>
                    <input value={form.url} onChange={e => setForm({...form,url:e.target.value})}
                      placeholder="https://ctglobal.com.co/DOS_QUEBRADAS/" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL GeoServer</label>
                    <input value={form.geoserverUrl} onChange={e => setForm({...form,geoserverUrl:e.target.value})}
                      placeholder="http://200.7.107.14:8080/geoserver" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Workspace GeoServer</label>
                    <input value={form.geoserverWorkspace} onChange={e => setForm({...form,geoserverWorkspace:e.target.value})}
                      placeholder="dos_quebradas" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha inicio contrato</label>
                    <input type="date" value={form.fechaInicio} onChange={e => setForm({...form,fechaInicio:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha fin contrato</label>
                    <input type="date" value={form.fechaFin} onChange={e => setForm({...form,fechaFin:e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea rows={2} value={form.descripcion}
                    onChange={e => setForm({...form,descripcion:e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Creando..." : "Crear geovisor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre:"", descripcion:"", cliente:"", url:"",
    geoserverUrl:"", geoserverWorkspace:"", fechaInicio:"", fechaFin:"",
  });
  const [editForm, setEditForm] = useState({
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

  const handleEdit = (p) => {
    setEditingProject(p);
    setEditForm({
      nombre:             p.nombre             || "",
      descripcion:        p.descripcion        || "",
      cliente:            p.cliente            || "",
      url:                p.url                || "",
      geoserverUrl:       p.geoserver_url      || "",
      geoserverWorkspace: p.geoserver_workspace || "",
      fechaInicio:        p.fecha_inicio ? p.fecha_inicio.split("T")[0] : "",
      fechaFin:           p.fecha_fin    ? p.fecha_fin.split("T")[0]    : "",
    });
    setShowEditModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.put(`/geoprojects/${editingProject.id}`, editForm);
      setShowEditModal(false);
      setEditingProject(null);
      load();
    } finally { setSaving(false); }
  };

  const handleToggle = async (id) => {
    await api.patch(`/geoprojects/${id}/toggle`);
    load();
  };

  const daysUntil = (date) => {
    if (!date) return null;
    return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const formFields = (data, setter) => (
    <>
      <div className="form-group">
        <label className="form-label">Nombre del proyecto</label>
        <input value={data.nombre} onChange={e => setter({...data, nombre:e.target.value})}
          placeholder="Ej: Dosquebradas - Estratificación 360°" required />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Cliente / Entidad</label>
          <input value={data.cliente} onChange={e => setter({...data, cliente:e.target.value})}
            placeholder="Ej: Alcaldía de Dosquebradas" />
        </div>
        <div className="form-group">
          <label className="form-label">URL del geovisor</label>
          <input value={data.url} onChange={e => setter({...data, url:e.target.value})}
            placeholder="https://ctglobal.com.co/DOS_QUEBRADAS/" />
        </div>
        <div className="form-group">
          <label className="form-label">URL GeoServer</label>
          <input value={data.geoserverUrl} onChange={e => setter({...data, geoserverUrl:e.target.value})}
            placeholder="http://200.7.107.14:8080/geoserver" />
        </div>
        <div className="form-group">
          <label className="form-label">Workspace GeoServer</label>
          <input value={data.geoserverWorkspace} onChange={e => setter({...data, geoserverWorkspace:e.target.value})}
            placeholder="dos_quebradas" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha inicio contrato</label>
          <input type="date" value={data.fechaInicio} onChange={e => setter({...data, fechaInicio:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha fin contrato</label>
          <input type="date" value={data.fechaFin} onChange={e => setter({...data, fechaFin:e.target.value})} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Descripción</label>
        <textarea rows={2} value={data.descripcion}
          onChange={e => setter({...data, descripcion:e.target.value})} />
      </div>
    </>
  );

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
          <div><div className="stat-value">{projects.length}</div><div className="stat-label">Total proyectos</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div><div className="stat-value">{projects.filter(p => p.activo).length}</div><div className="stat-label">Activos</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">👥</div>
          <div>
            <div className="stat-value">{projects.reduce((a, p) => a + (p._count?.projectUsers || 0), 0)}</div>
            <div className="stat-label">Usuarios totales</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">⚠️</div>
          <div>
            <div className="stat-value">
              {projects.filter(p => { const d = daysUntil(p.fecha_fin); return d !== null && d <= 30 && d >= 0 && p.activo; }).length}
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
            const expirado  = dias !== null && dias < 0;
            return (
              <div key={p.id} className="card" style={{ padding:"1.25rem 1.5rem" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"1rem" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"0.5rem" }}>
                      <span style={{ fontFamily:"monospace", fontSize:"0.8rem", background:"var(--primary)",
                        color:"#fff", padding:"0.15rem 0.5rem", borderRadius:4, fontWeight:700 }}>
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
                        <span className="badge badge-red">📅 Contrato vencido — sigue activo hasta pausar</span>
                      )}
                    </div>
                    <div style={{ fontSize:"0.85rem", color:"var(--text-muted)", marginBottom:"0.6rem" }}>
                      {p.cliente && <span>🏢 {p.cliente} · </span>}
                      {p.descripcion}
                    </div>
                    <div style={{ display:"flex", gap:"1.5rem", fontSize:"0.82rem", flexWrap:"wrap" }}>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" style={{ color:"var(--primary)" }}>
                          🔗 Ver geovisor
                        </a>
                      )}
                      {p.geoserver_workspace && (
                        <span style={{ color:"var(--text-muted)" }}>
                          GeoServer: <code>{p.geoserver_workspace}</code>
                        </span>
                      )}
                      <span style={{ color:"var(--text-muted)" }}>👥 {p._count?.projectUsers || 0} usuarios</span>
                      <span style={{ color:"var(--text-muted)" }}>📊 {p._count?.sessions || 0} sesiones</span>
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
                      <button onClick={() => handleEdit(p)} className="btn btn-ghost btn-sm">
                        ✏️ Editar
                      </button>
                      <button onClick={() => handleToggle(p.id)}
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
              <div className="modal-body">{formFields(form, setForm)}</div>
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

      {/* Modal editar geovisor */}
      {showEditModal && editingProject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="modal" style={{ maxWidth:580 }}>
            <div className="modal-header">
              <h3>✏️ Editar — {editingProject.codigo}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
                {/* Alerta si está vencido */}
                {daysUntil(editingProject.fecha_fin) !== null && daysUntil(editingProject.fecha_fin) < 0 && (
                  <div className="alert alert-error" style={{ marginBottom:"1rem" }}>
                    ⚠️ El contrato venció el {format(new Date(editingProject.fecha_fin), "d MMM yyyy", { locale:es })}. 
                    Actualiza la fecha de fin para extenderlo, o pausa el proyecto si ya no está vigente.
                  </div>
                )}
                {formFields(editForm, setEditForm)}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancelar</button>
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

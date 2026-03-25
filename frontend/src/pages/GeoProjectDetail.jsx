import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function GeoProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("usuarios");
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ nombre:"", email:"", password:"", rol:"VIEWER", expiresAt:"" });
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const load = async () => {
    const [proj, anal] = await Promise.all([
      api.get(`/geoprojects/${id}`),
      api.get(`/reports/geovisor/${id}`),
    ]);
    setProject(proj.data);
    setAnalytics(anal.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleAddUser = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post(`/geoprojects/${id}/users`, userForm);
      setShowUserModal(false);
      setUserForm({ nombre:"",email:"",password:"",rol:"VIEWER",expiresAt:"" });
      load();
    } finally { setSaving(false); }
  };

  const handleToggleUser = async (uid) => {
    await api.patch(`/geoprojects/${id}/users/${uid}/toggle`);
    load();
  };

  const handleDeleteUser = async (uid) => {
    if (!confirm("¿Eliminar acceso de este usuario?")) return;
    await api.delete(`/geoprojects/${id}/users/${uid}`);
    load();
  };

  const handleRegenKey = async () => {
    if (!confirm("¿Regenerar la API key? El geovisor dejará de funcionar hasta que actualices la clave.")) return;
    const res = await api.post(`/geoprojects/${id}/regenerate-key`);
    setProject(prev => ({ ...prev, api_key: res.data.apiKey }));
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(project.api_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!project) return null;

  const tabs = ["usuarios","analytics","documentos","integracion"];

  return (
    <>
      <div style={{ marginBottom:"1rem" }}>
        <Link to="/geovisores" style={{ color:"var(--text-muted)", fontSize:"0.85rem" }}>
          ← Volver a Geovisores
        </Link>
      </div>

      {/* Header del proyecto */}
      <div style={{ background:"linear-gradient(135deg,var(--primary),var(--primary-light))",
        borderRadius:"var(--radius)", padding:"1.5rem 2rem", marginBottom:"1.5rem",
        color:"#fff", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ opacity:0.7, fontSize:"0.8rem", marginBottom:"0.3rem" }}>
            {project.codigo}
          </div>
          <h1 style={{ fontSize:"1.4rem", marginBottom:"0.3rem" }}>{project.nombre}</h1>
          <div style={{ opacity:0.75, fontSize:"0.88rem" }}>
            {project.cliente} · {project.geoserver_workspace}
          </div>
        </div>
        <div style={{ display:"flex", gap:"0.5rem" }}>
          {project.url && (
            <a href={project.url} target="_blank" rel="noreferrer"
              className="btn btn-sm"
              style={{ background:"rgba(255,255,255,0.2)", color:"#fff" }}>
              🔗 Abrir geovisor
            </a>
          )}
          <span className={`badge ${project.activo ? "badge-green" : "badge-gray"}`}>
            {project.activo ? "● Activo" : "⏸ Pausado"}
          </span>
        </div>
      </div>

      {/* Stats rápidos */}
      {analytics && (
        <div className="stats-grid" style={{ marginBottom:"1.5rem" }}>
          {[
            { icon:"👥", val: project._count?.projectUsers, label:"Usuarios" },
            { icon:"📊", val: analytics.metrics.totalSessions, label:"Sesiones totales" },
            { icon:"⏱️", val: `${analytics.metrics.avgDurationMin}m`, label:"Duración promedio" },
            { icon:"🗺️", val: analytics.metrics.totalLayerViews, label:"Capas consultadas" },
          ].map(({ icon, val, label }) => (
            <div key={label} className="stat-card">
              <div className="stat-icon blue">{icon}</div>
              <div>
                <div className="stat-value">{val ?? 0}</div>
                <div className="stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:"0.25rem", marginBottom:"1.5rem", borderBottom:"1px solid var(--border)", paddingBottom:"0" }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding:"0.65rem 1.25rem", background:"none", border:"none",
              cursor:"pointer", fontWeight: activeTab===tab ? 700 : 400,
              color: activeTab===tab ? "var(--primary)" : "var(--text-muted)",
              borderBottom: activeTab===tab ? "2px solid var(--primary)" : "2px solid transparent",
              fontSize:"0.9rem", textTransform:"capitalize" }}>
            { tab==="usuarios"?"👥 Usuarios":tab==="analytics"?"📊 Analytics":tab==="documentos"?"📁 Documentos":"⚙️ Integración" }
          </button>
        ))}
      </div>

      {/* Tab: Usuarios */}
      {activeTab === "usuarios" && (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"1rem" }}>
            <h2 style={{ fontSize:"1rem" }}>Usuarios con acceso al geovisor</h2>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowUserModal(true)}>
                + Agregar usuario
              </button>
            )}
          </div>
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th><th>Rol</th><th>Vence</th><th>Estado</th>
                    {canEdit && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {project.projectUsers.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:"center", color:"var(--text-muted)", padding:"2rem" }}>
                      Sin usuarios asignados
                    </td></tr>
                  ) : project.projectUsers.map(pu => {
                    const expired = pu.expiresAt && new Date(pu.expiresAt) < new Date();
                    return (
                      <tr key={pu.id}>
                        <td>
                          <div style={{ fontWeight:600 }}>{pu.nombre}</div>
                          <div style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>{pu.email}</div>
                        </td>
                        <td><span className={`badge ${pu.rol==="EDITOR"?"badge-blue":"badge-gray"}`}>{pu.rol}</span></td>
                        <td style={{ fontSize:"0.82rem" }}>
                          {pu.expiresAt ? (
                            <span style={{ color: expired ? "var(--danger)" : "inherit" }}>
                              {format(new Date(pu.expiresAt), "d MMM yyyy", { locale:es })}
                              {expired && " ⚠️"}
                            </span>
                          ) : "Sin límite"}
                        </td>
                        <td>
                          <span className={`badge ${pu.activo && !expired ? "badge-green" : "badge-red"}`}>
                            {pu.activo && !expired ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        {canEdit && (
                          <td>
                            <div style={{ display:"flex", gap:"0.4rem" }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleToggleUser(pu.id)}>
                                {pu.activo ? "Bloquear" : "Activar"}
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(pu.id)}>✕</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Tab: Analytics */}
      {activeTab === "analytics" && analytics && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>
          <div className="card">
            <div className="card-header"><h2>🗺️ Capas más consultadas</h2></div>
            <div className="card-body" style={{ padding:0 }}>
              {analytics.topLayers.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">🗺️</div><h3>Sin datos</h3></div>
              ) : (
                <table>
                  <thead><tr><th>Capa</th><th>Consultas</th><th>%</th></tr></thead>
                  <tbody>
                    {analytics.topLayers.map((l, i) => {
                      const max = analytics.topLayers[0]?.count || 1;
                      return (
                        <tr key={i}>
                          <td><span style={{ fontFamily:"monospace", fontSize:"0.85rem" }}>{l.title || l.name}</span></td>
                          <td style={{ fontWeight:700 }}>{l.count}</td>
                          <td style={{ width:200 }}>
                            <div style={{ background:"var(--border)", borderRadius:4, height:8, overflow:"hidden" }}>
                              <div style={{ width:`${(l.count/max)*100}%`, height:"100%", background:"var(--primary)", borderRadius:4 }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Documentos */}
      {activeTab === "documentos" && (
        <div className="card">
          <div className="table-wrapper">
            {project.documents.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📁</div>
                <h3>Sin documentos vinculados</h3>
                <Link to="/documentos" className="btn btn-outline btn-sm" style={{ marginTop:"0.75rem" }}>
                  Ir al repositorio
                </Link>
              </div>
            ) : (
              <table>
                <thead><tr><th>Documento</th><th>Subido por</th><th>Fecha</th></tr></thead>
                <tbody>
                  {project.documents.map(doc => (
                    <tr key={doc.id}>
                      <td><span style={{ fontWeight:600 }}>{doc.nombre}</span></td>
                      <td style={{ fontSize:"0.85rem" }}>{doc.subidoPor?.nombre}</td>
                      <td style={{ fontSize:"0.82rem", color:"var(--text-muted)" }}>
                        {format(new Date(doc.created_at), "d MMM yyyy", { locale:es })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab: Integración */}
      {activeTab === "integracion" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          <div className="card">
            <div className="card-header"><h2>⚙️ Credenciales de integración</h2></div>
            <div className="card-body">
              {[
                { label:"Código del proyecto", value: project.codigo },
                { label:"API Key", value: project.api_key, mono:true, secret:true },
                { label:"Endpoint de autenticación", value:`${window.location.origin.replace("5173","3001")}/api/geoauth/login`, mono:true },
              ].map(({ label, value, mono, secret }) => (
                <div key={label} style={{ marginBottom:"1rem" }}>
                  <div style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--text-muted)",
                    textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:"0.35rem" }}>
                    {label}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                    <code style={{ background:"#f1f5f9", padding:"0.4rem 0.75rem",
                      borderRadius:6, fontSize:"0.85rem", flex:1,
                      fontFamily: mono ? "monospace" : "inherit" }}>
                      {value}
                    </code>
                    <button className="btn btn-outline btn-sm" onClick={copyApiKey}>
                      {copiedKey ? "✅ Copiado" : "Copiar"}
                    </button>
                    {secret && canEdit && (
                      <button className="btn btn-ghost btn-sm" onClick={handleRegenKey}>
                        🔄 Regenerar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>📋 Snippet de integración</h2></div>
            <div className="card-body">
              <p style={{ fontSize:"0.88rem", color:"var(--text-muted)", marginBottom:"1rem" }}>
                Añade estas líneas a tu geovisor HTML/JS existente:
              </p>
              <pre style={{ background:"#1e293b", color:"#e2e8f0", padding:"1.25rem",
                borderRadius:8, fontSize:"0.82rem", overflowX:"auto", lineHeight:1.7 }}>
{`<!-- 1. Incluir el SDK -->
<script src="https://intranet.ctglobal.com.co/sdk/ctglobal-sdk.js"></script>

<script>
  // 2. Inicializar
  const ctg = new CTGlobalSDK({
    projectKey: '${project.codigo}',
    apiKey: '${project.api_key}',
    apiUrl: 'https://intranet.ctglobal.com.co/api',
    loginTitle: '${project.nombre}',
  });

  // 3. Proteger el geovisor (bloquea hasta autenticarse)
  ctg.requireAuth().then((user) => {
    console.log('Bienvenido,', user.nombre);
    
    // 4. Tu código OpenLayers igual que siempre
    const map = new ol.Map({ ... });
    
    // 5. Tracking automático de capas
    ctg.trackOpenLayersMap(map);
    
    // 6. Botón de logout
    ctg.addLogoutButton('map');
  });
</script>`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar usuario */}
      {showUserModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUserModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Agregar usuario al geovisor</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowUserModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre completo</label>
                    <input value={userForm.nombre} onChange={e => setUserForm({...userForm,nombre:e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo</label>
                    <input type="email" value={userForm.email} onChange={e => setUserForm({...userForm,email:e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña inicial</label>
                    <input type="password" value={userForm.password} onChange={e => setUserForm({...userForm,password:e.target.value})} placeholder="Mín. 8 caracteres" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rol</label>
                    <select value={userForm.rol} onChange={e => setUserForm({...userForm,rol:e.target.value})}>
                      <option value="VIEWER">Viewer (solo ver)</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de expiración del acceso (opcional)</label>
                  <input type="date" value={userForm.expiresAt} onChange={e => setUserForm({...userForm,expiresAt:e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowUserModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Agregando..." : "Agregar usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// frontend/src/pages/Equipment.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Receipt, ExternalLink, AlertTriangle, Eye, Download, X } from "lucide-react";

// ── Visor de archivo ──────────────────────────────────────────
function FileViewer({ url, nombre, onClose }) {
  const ext = url.split(".").pop().toLowerCase();
  return (
    <div style={{ position:"fixed",inset:0,zIndex:3000,background:"rgba(10,20,35,0.92)",
      display:"flex",flexDirection:"column",alignItems:"center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:"100%",background:"rgba(255,255,255,0.06)",
        borderBottom:"1px solid rgba(255,255,255,0.1)",
        padding:"0.75rem 1.5rem",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <span style={{ color:"#fff",fontSize:"0.875rem",fontWeight:600 }}>📄 {nombre}</span>
        <div style={{ display:"flex",gap:"0.75rem" }}>
          <a href={url} download target="_blank" rel="noreferrer"
            style={{ display:"flex",alignItems:"center",gap:"0.4rem",
              background:"rgba(255,255,255,0.12)",color:"#fff",
              padding:"0.4rem 0.85rem",borderRadius:"6px",fontSize:"0.8rem",
              fontWeight:600,textDecoration:"none",border:"1px solid rgba(255,255,255,0.15)" }}>
            <Download size={13} /> Descargar
          </a>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.12)",
            border:"1px solid rgba(255,255,255,0.15)",color:"#fff",borderRadius:"6px",
            padding:"0.4rem 0.6rem",cursor:"pointer",display:"flex",alignItems:"center" }}>
            <X size={16} />
          </button>
        </div>
      </div>
      <div style={{ flex:1,width:"100%",overflow:"auto",padding:"1.5rem",display:"flex",justifyContent:"center" }}>
        {ext === "pdf" ? (
          <iframe src={url} title="Factura"
            style={{ width:"100%",maxWidth:"900px",height:"calc(100vh - 120px)",
              border:"none",borderRadius:"8px",background:"#fff" }} />
        ) : (
          <img src={url} alt="Factura"
            style={{ maxWidth:"900px",maxHeight:"calc(100vh - 120px)",
              objectFit:"contain",borderRadius:"8px",boxShadow:"0 8px 40px rgba(0,0,0,0.4)" }} />
        )}
      </div>
    </div>
  );
}

const TIPOS   = ["DRONE","GPS","LAPTOP","CAMARA","SERVIDOR","LICENCIA","VEHICULO","OTRO"];
const ESTADOS = ["DISPONIBLE","EN_CAMPO","EN_MANTENIMIENTO","DANADO","DADO_DE_BAJA"];

const ESTADO_BADGE = {
  DISPONIBLE:"badge-green", EN_CAMPO:"badge-blue",
  EN_MANTENIMIENTO:"badge-yellow", DANADO:"badge-red", DADO_DE_BAJA:"badge-gray",
};
const ESTADO_LABEL = {
  DISPONIBLE:"Disponible", EN_CAMPO:"En campo",
  EN_MANTENIMIENTO:"En mantenimiento", DANADO:"Dañado", DADO_DE_BAJA:"Dado de baja",
};
const TIPO_ICON = {
  DRONE:"🚁", GPS:"📡", LAPTOP:"💻", CAMARA:"📷",
  SERVIDOR:"🖥️", LICENCIA:"🔑", VEHICULO:"🚙", OTRO:"📦",
};

// Acciones disponibles en el log
const ACCIONES = [
  { label:"Asignado a proyecto",      estado:"EN_CAMPO",          requiereProyecto: false },
  { label:"Devuelto a bodega",        estado:"DISPONIBLE",        requiereProyecto: false },
  { label:"Enviado a oficina",        estado:"EN_CAMPO",          requiereProyecto: false },
  { label:"Enviado a mantenimiento",  estado:"EN_MANTENIMIENTO",  requiereProyecto: false },
  { label:"Retornó de mantenimiento", estado:"DISPONIBLE",        requiereProyecto: false },
  { label:"Reportado con daño",       estado:"DANADO",            requiereProyecto: false },
];

// Modal de facturas de un equipo
function InvoiceModal({ equipo, onClose }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [viewer, setViewer]     = useState(null);

  const apiBase = window.location.origin.replace("5173","3001");

  useEffect(() => {
    api.get(`/equipment/${equipo.id}/invoices`)
      .then(r => setInvoices(r.data))
      .finally(() => setLoading(false));
  }, [equipo.id]);

  const MESES = ["","Ene","Feb","Mar","Abr","May","Jun",
                 "Jul","Ago","Sep","Oct","Nov","Dic"];

  // Totales separados por moneda — solo muestra los que tienen valor
  const pagadas = invoices.filter(i => i.estado === "PAGADO");

  const totalCOP = pagadas.reduce((a, i) => {
    let t = 0;
    if (i.moneda === "COP") t += parseFloat(i.monto) || 0;
    if (i.moneda_secundaria === "COP") t += parseFloat(i.monto_secundario) || 0;
    return a + t;
  }, 0);

  const totalUSD = pagadas.reduce((a, i) => {
    let t = 0;
    if (i.moneda === "USD") t += parseFloat(i.monto) || 0;
    if (i.moneda_secundaria === "USD") t += parseFloat(i.monto_secundario) || 0;
    return a + t;
  }, 0);

  // Formatea un monto según su moneda
  const fmt = (monto, moneda) => {
    const n = parseFloat(monto) || 0;
    if (moneda === "USD") return `USD ${n.toLocaleString("es-CO", { minimumFractionDigits:2 })}`;
    return `$${n.toLocaleString("es-CO", { maximumFractionDigits:0 })} COP`;
  };

  // Muestra el monto principal + secundario solo si existe y es distinto
  const fmtFila = (inv) => {
    const principal = fmt(inv.monto, inv.moneda);
    if (!inv.monto_secundario || !inv.moneda_secundaria) return principal;
    // Si el monto principal es 0, mostrar solo el secundario
    if (parseFloat(inv.monto) === 0) return fmt(inv.monto_secundario, inv.moneda_secundaria);
    return `${principal} + ${fmt(inv.monto_secundario, inv.moneda_secundaria)}`;
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:700 }}>
        <div className="modal-header">
          <h3 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
            <Receipt size={16} />
            Facturas — {equipo.nombre}
          </h3>
          <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
            <Link
              to={`/facturas?equipoId=${equipo.id}`}
              className="btn btn-outline btn-sm"
              style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}
              onClick={onClose}>
              <ExternalLink size={13} /> Ver en Facturación
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? (
            <div className="loader"><div className="spinner" /></div>
          ) : invoices.length === 0 ? (
            <div className="empty-state" style={{ padding:"2rem" }}>
              <div className="empty-state-icon"><Receipt size={32} strokeWidth={1} color="#e2e8f0" /></div>
              <h3>Sin facturas</h3>
              <p>Registra facturas desde el módulo de Facturación.</p>
            </div>
          ) : (
            <>
              {(totalCOP > 0 || totalUSD > 0) && (
                <div style={{ padding:"0.75rem 1.25rem", background:"var(--primary-50)",
                  borderBottom:"1px solid var(--border)", fontSize:"0.82rem",
                  color:"var(--primary)", fontWeight:600,
                  display:"flex", gap:"1.5rem", flexWrap:"wrap" }}>
                  <span>Total pagado:</span>
                  {totalCOP > 0 && (
                    <span>${totalCOP.toLocaleString("es-CO", { maximumFractionDigits:0 })} COP</span>
                  )}
                  {totalUSD > 0 && (
                    <span style={{ color:"#1d4ed8" }}>
                      USD {totalUSD.toLocaleString("es-CO", { minimumFractionDigits:2 })}
                    </span>
                  )}
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Concepto</th><th>Período</th>
                    <th>Monto</th><th>Estado</th><th>Archivo</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:"0.82rem" }}>{inv.concepto}</div>
                        <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                          {inv.proveedor}
                        </div>
                      </td>
                      <td style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>
                        {inv.periodo_mes && inv.periodo_anio
                          ? `${MESES[inv.periodo_mes]} ${inv.periodo_anio}`
                          : format(new Date(inv.fecha_emision), "d MMM yyyy", { locale:es })}
                      </td>
                      <td style={{ fontWeight:700, fontSize:"0.85rem" }}>
                        {fmtFila(inv)}
                      </td>
                      <td>
                        <span className={`badge ${
                          inv.estado==="PAGADO" ? "badge-green" :
                          inv.estado==="VENCIDO" ? "badge-red" :
                          inv.estado==="CANCELADO" ? "badge-gray" : "badge-yellow"
                        }`}>{inv.estado}</span>
                      </td>
                      <td>
                        {inv.archivo_pdf ? (
                          <button className="btn btn-ghost btn-sm"
                            style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                            onClick={() => setViewer({
                              url: `${apiBase}/uploads/invoices/${inv.archivo_pdf}`,
                              nombre: inv.concepto,
                            })}>
                            <Eye size={13} /> Ver
                          </button>
                        ) : (
                          <span style={{ color:"var(--text-light)", fontSize:"0.75rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
      {viewer && (
        <FileViewer url={viewer.url} nombre={viewer.nombre} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

export default function Equipment() {
  const { user } = useAuth();
  const [items, setItems]       = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState({ tipo:"", estado:"", q:"" });
  const [showModal, setShowModal]     = useState(false);
  const [showLogModal, setShowLogModal] = useState(null);  // equipo id
  const [showInvModal, setShowInvModal] = useState(null);  // equipo obj
  const [form, setForm] = useState({
    nombre:"", tipo:"DRONE", marca:"", modelo:"", serial:"",
    estado:"DISPONIBLE", descripcion:"", ubicacion:"",
    fechaCompra:"", valorCompra:"", proximoMantenimiento:"",
  });
  const [logForm, setLogForm] = useState({
    accion:"", notas:"", nuevoEstado:"", proyectoId:"",
  });
  const [projects, setProjects] = useState([]);
  const [saving, setSaving]     = useState(false);

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const load = async () => {
    const params = new URLSearchParams();
    if (filter.tipo)   params.set("tipo",   filter.tipo);
    if (filter.estado) params.set("estado", filter.estado);
    if (filter.q)      params.set("q",      filter.q);
    const [eq, al, pj] = await Promise.all([
      api.get(`/equipment?${params}`),
      api.get("/equipment/alerts"),
      api.get("/geoprojects"),
    ]);
    setItems(eq.data);
    setAlerts(al.data);
    setProjects(pj.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter.tipo, filter.estado]);

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post("/equipment", form);
      setShowModal(false);
      setForm({ nombre:"",tipo:"DRONE",marca:"",modelo:"",serial:"",estado:"DISPONIBLE",
        descripcion:"",ubicacion:"",fechaCompra:"",valorCompra:"",proximoMantenimiento:"" });
      load();
    } finally { setSaving(false); }
  };

  const handleLog = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post(`/equipment/${showLogModal}/log`, logForm);
      setShowLogModal(null);
      setLogForm({ accion:"", notas:"", nuevoEstado:"", proyectoId:"" });
      load();
    } finally { setSaving(false); }
  };

  // Cuando cambia la acción, pre-llenar el estado sugerido
  const handleAccionChange = (accion) => {
    const found = ACCIONES.find(a => a.label === accion);
    setLogForm(prev => ({
      ...prev,
      accion,
      nuevoEstado: found?.estado || "",
    }));
  };

  const filtered = items.filter(i =>
    !filter.q || i.nombre.toLowerCase().includes(filter.q.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventario de Equipos</h1>
          <p>Control de equipos, asignaciones, mantenimientos y facturas</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nuevo equipo
          </button>
        )}
      </div>

      {/* Alertas mantenimiento */}
      {alerts.length > 0 && (
        <div className="alert alert-error"
          style={{ display:"flex", alignItems:"flex-start", gap:"0.5rem", marginBottom:"1.5rem" }}>
          <AlertTriangle size={16} style={{ flexShrink:0, marginTop:2 }} />
          <div>
            <strong>{alerts.length} equipo(s) con mantenimiento próximo:</strong>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"0.5rem", marginTop:"0.35rem" }}>
              {alerts.map(a => (
                <span key={a.id} className="badge badge-red">
                  {a.nombre} — {format(new Date(a.proximo_mantenimiento), "d MMM", { locale:es })}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom:"1.5rem" }}>
        {["DISPONIBLE","EN_CAMPO","EN_MANTENIMIENTO","DANADO"].map(estado => (
          <div key={estado} className="stat-card">
            <div className={`stat-icon ${
              estado==="DISPONIBLE"?"green":estado==="EN_CAMPO"?"blue":
              estado==="EN_MANTENIMIENTO"?"yellow":"red"
            }`}>
              {estado==="DISPONIBLE"?"✅":estado==="EN_CAMPO"?"📍":
               estado==="EN_MANTENIMIENTO"?"🔧":"⚠️"}
            </div>
            <div>
              <div className="stat-value">{items.filter(i => i.estado === estado).length}</div>
              <div className="stat-label">{ESTADO_LABEL[estado]}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:"0.75rem", marginBottom:"1.5rem", flexWrap:"wrap", alignItems:"center" }}>
        <div className="search-box" style={{ flex:1, minWidth:200 }}>
          <span className="search-box-icon">🔍</span>
          <input placeholder="Buscar equipo..."
            value={filter.q} onChange={e => setFilter({ ...filter, q:e.target.value })} />
        </div>
        <select style={{ width:160 }} value={filter.tipo}
          onChange={e => setFilter({ ...filter, tipo:e.target.value })}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICON[t]} {t}</option>)}
        </select>
        <select style={{ width:180 }} value={filter.estado}
          onChange={e => setFilter({ ...filter, estado:e.target.value })}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h3>Sin equipos</h3>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Equipo</th><th>Serial</th><th>Estado</th>
                  <th>Proyecto actual</th><th>Próx. mant.</th>
                  <th>Facturas</th>
                  {canEdit && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                        <span style={{ fontSize:"1.2rem" }}>{TIPO_ICON[item.tipo]}</span>
                        <div>
                          <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{item.nombre}</div>
                          <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                            {item.marca} {item.modelo}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:"0.82rem", fontFamily:"monospace" }}>
                      {item.serial || "—"}
                    </td>
                    <td>
                      <span className={`badge ${ESTADO_BADGE[item.estado]}`}>
                        {ESTADO_LABEL[item.estado]}
                      </span>
                    </td>
                    <td style={{ fontSize:"0.82rem" }}>
                      {item.proyectoActual
                        ? <span className="badge badge-blue">{item.proyectoActual.codigo}</span>
                        : <span style={{ color:"var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ fontSize:"0.8rem" }}>
                      {item.proximo_mantenimiento ? (
                        <span style={{ color: new Date(item.proximo_mantenimiento) < new Date()
                          ? "var(--danger)" : "inherit" }}>
                          {format(new Date(item.proximo_mantenimiento), "d MMM yyyy", { locale:es })}
                        </span>
                      ) : "—"}
                    </td>
                    {/* Columna Facturas */}
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}
                        onClick={() => setShowInvModal(item)}>
                        <Receipt size={13} /> Ver
                      </button>
                    </td>
                    {canEdit && (
                      <td>
                        <button className="btn btn-outline btn-sm"
                          onClick={() => setShowLogModal(item.id)}>
                          Registrar movimiento
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nuevo equipo */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:600 }}>
            <div className="modal-header">
              <h3>Nuevo equipo</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input value={form.nombre} onChange={e => setForm({...form,nombre:e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select value={form.tipo} onChange={e => setForm({...form,tipo:e.target.value})}>
                      {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICON[t]} {t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Marca</label>
                    <input value={form.marca} onChange={e => setForm({...form,marca:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Modelo</label>
                    <input value={form.modelo} onChange={e => setForm({...form,modelo:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Serial</label>
                    <input value={form.serial} onChange={e => setForm({...form,serial:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ubicación</label>
                    <input value={form.ubicacion} onChange={e => setForm({...form,ubicacion:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de compra</label>
                    <input type="date" value={form.fechaCompra}
                      onChange={e => setForm({...form,fechaCompra:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Próximo mantenimiento</label>
                    <input type="date" value={form.proximoMantenimiento}
                      onChange={e => setForm({...form,proximoMantenimiento:e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea rows={2} value={form.descripcion}
                    onChange={e => setForm({...form,descripcion:e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Crear equipo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal registro movimiento */}
      {showLogModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLogModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Registrar movimiento</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLogModal(null)}>✕</button>
            </div>
            <form onSubmit={handleLog}>
              <div className="modal-body">
                {/* Acción */}
                <div className="form-group">
                  <label className="form-label">Acción *</label>
                  <select value={logForm.accion}
                    onChange={e => handleAccionChange(e.target.value)} required>
                    <option value="">Seleccionar...</option>
                    {ACCIONES.map(a => (
                      <option key={a.label} value={a.label}>{a.label}</option>
                    ))}
                  </select>
                </div>

                {/* Nuevo estado (pre-llenado pero editable) */}
                <div className="form-group">
                  <label className="form-label">Nuevo estado *</label>
                  <select value={logForm.nuevoEstado}
                    onChange={e => setLogForm({...logForm, nuevoEstado:e.target.value})} required>
                    <option value="">Seleccionar...</option>
                    {ESTADOS.filter(e => e !== "DADO_DE_BAJA").map(e => (
                      <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                    ))}
                  </select>
                </div>

                {/* Proyecto (opcional) */}
                <div className="form-group">
                  <label className="form-label">
                    Proyecto <span style={{ color:"var(--text-muted)",fontWeight:400 }}>
                      (opcional — dejar vacío si es transversal o uso en oficina)
                    </span>
                  </label>
                  <select value={logForm.proyectoId}
                    onChange={e => setLogForm({...logForm, proyectoId:e.target.value})}>
                    <option value="">Sin proyecto asignado</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Notas */}
                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <textarea rows={2} value={logForm.notas}
                    onChange={e => setLogForm({...logForm, notas:e.target.value})}
                    placeholder="Observaciones del movimiento..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowLogModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal facturas del equipo */}
      {showInvModal && (
        <InvoiceModal equipo={showInvModal} onClose={() => setShowInvModal(null)} />
      )}
    </>
  );
}
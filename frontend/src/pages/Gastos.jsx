// frontend/src/pages/Gastos.jsx
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Wallet, Plus, AlertTriangle, Eye, Download, X, Filter, TrendingDown,
} from "lucide-react";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "/api").replace(/\/api\/?$/, "");
const fileUrl = (name) => `${API_ORIGIN}/uploads/gastos/${name}`;

// ── Visor de archivo (PDF o imagen) ──────────────────────────
function FileViewer({ url, nombre, onClose }) {
  const ext = url.split(".").pop().toLowerCase();
  const isPdf = ext === "pdf";
  return (
    <div style={{ position:"fixed", inset:0, zIndex:3000, background:"rgba(10,20,35,0.92)",
      display:"flex", flexDirection:"column", alignItems:"center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width:"100%", background:"rgba(255,255,255,0.06)",
        borderBottom:"1px solid rgba(255,255,255,0.1)", padding:"0.75rem 1.5rem",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ color:"#fff", fontSize:"0.875rem", fontWeight:600 }}>📄 {nombre || "Archivo"}</span>
        <div style={{ display:"flex", gap:"0.75rem" }}>
          <a href={url} download target="_blank" rel="noreferrer"
            style={{ display:"flex", alignItems:"center", gap:"0.4rem",
              background:"rgba(255,255,255,0.12)", color:"#fff", padding:"0.4rem 0.85rem",
              borderRadius:"6px", fontSize:"0.8rem", fontWeight:600, textDecoration:"none",
              border:"1px solid rgba(255,255,255,0.15)" }}>
            <Download size={13} /> Descargar
          </a>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.12)",
            border:"1px solid rgba(255,255,255,0.15)", color:"#fff", borderRadius:"6px",
            padding:"0.4rem 0.6rem", cursor:"pointer", display:"flex", alignItems:"center" }}>
            <X size={16} />
          </button>
        </div>
      </div>
      <div style={{ flex:1, width:"100%", overflow:"auto", padding:"1.5rem", display:"flex", justifyContent:"center" }}>
        {isPdf ? (
          <iframe src={url} title="Archivo"
            style={{ width:"100%", maxWidth:"900px", height:"calc(100vh - 120px)",
              border:"none", borderRadius:"8px", background:"#fff" }} />
        ) : (
          <img src={url} alt="Archivo"
            style={{ maxWidth:"900px", maxHeight:"calc(100vh - 120px)",
              objectFit:"contain", borderRadius:"8px", boxShadow:"0 8px 40px rgba(0,0,0,0.4)" }} />
        )}
      </div>
    </div>
  );
}

// ── Constantes ──────────────────────────────────────────────
const CATEGORIAS = ["RECIBO_PUBLICO","ADMINISTRACION","CONTRATISTA","VUELO","VIATICO","OTRO"];
const RESUMEN_CATS = [...CATEGORIAS.slice(0,5), "DEPRECIACION", "OTRO"];
const CAT_LABEL = {
  RECIBO_PUBLICO:"Recibo público", ADMINISTRACION:"Administración",
  CONTRATISTA:"Pago contratista", VUELO:"Vuelo", VIATICO:"Viático",
  DEPRECIACION:"Depreciación", OTRO:"Otro",
};
const CAT_ICON = {
  RECIBO_PUBLICO:"💡", ADMINISTRACION:"🏢", CONTRATISTA:"👷",
  VUELO:"✈️", VIATICO:"🧳", DEPRECIACION:"📉", OTRO:"📌",
};
const CAT_BADGE = {
  RECIBO_PUBLICO:"badge-blue", ADMINISTRACION:"badge-gray", CONTRATISTA:"badge-green",
  VUELO:"badge-blue", VIATICO:"badge-yellow", DEPRECIACION:"badge-gray", OTRO:"badge-gray",
};
const ESTADOS = ["PENDIENTE","PAGADO","ANULADO"];
const ESTADO_BADGE = { PENDIENTE:"badge-yellow", PAGADO:"badge-green", ANULADO:"badge-gray" };
const SUBCATS_RECIBO = ["Energía","Agua","Gas","Internet","Telefonía","Aseo","Vigilancia","Otro"];
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmt(monto, moneda) {
  const n = parseFloat(monto) || 0;
  if (moneda === "USD") return `USD ${n.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`;
  if (moneda === "EUR") return `EUR ${n.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`;
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}
function fmtDoble(g) {
  const p = fmt(g.monto, g.moneda);
  if (!g.monto_secundario) return p;
  return `${p} + ${fmt(g.monto_secundario, g.moneda_secundaria)}`;
}
const cop0 = (n) => `$${(+n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;

const now = new Date();
const emptyForm = {
  categoria:"RECIBO_PUBLICO", subcategoria:"", concepto:"", proveedor:"",
  monto:"", moneda:"COP", monto_secundario:"", moneda_secundaria:"",
  fecha:"", fecha_vencimiento:"",
  periodo_mes:String(now.getMonth() + 1), periodo_anio:String(now.getFullYear()),
  estado:"PENDIENTE", persona_id:"", equipo_id:"", proyecto_id:"",
  recurrente:false, notas:"",
};

export default function Gastos() {
  const { user } = useAuth();
  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const [tab, setTab]         = useState("gastos");   // "gastos" | "depreciacion"
  const [gastos, setGastos]   = useState([]);
  const [resumen, setResumen] = useState(null);
  const [dep, setDep]         = useState(null);
  const [alerts, setAlerts]   = useState([]);
  const [users, setUsers]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [periodo, setPeriodo] = useState({ mes:String(now.getMonth() + 1), anio:String(now.getFullYear()) });
  const [filter, setFilter]   = useState({ categoria:"", estado:"", personaId:"", proyectoId:"", q:"" });

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [file, setFile]           = useState(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [viewer, setViewer]       = useState(null);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const loadListado = async () => {
    const p = new URLSearchParams();
    if (periodo.mes)  p.set("mes",  periodo.mes);
    if (periodo.anio) p.set("anio", periodo.anio);
    if (filter.categoria)  p.set("categoria",  filter.categoria);
    if (filter.estado)     p.set("estado",     filter.estado);
    if (filter.personaId)  p.set("personaId",  filter.personaId);
    if (filter.proyectoId) p.set("proyectoId", filter.proyectoId);
    if (filter.q)          p.set("q",          filter.q);
    const [g, r, al] = await Promise.all([
      api.get(`/gastos?${p}`),
      api.get(`/gastos/resumen?mes=${periodo.mes}&anio=${periodo.anio}`),
      api.get("/gastos/alerts"),
    ]);
    setGastos(g.data);
    setResumen(r.data);
    setAlerts(al.data);
  };

  const loadDep = async () => {
    const r = await api.get(`/gastos/depreciacion?mes=${periodo.mes}&anio=${periodo.anio}`);
    setDep(r.data);
  };

  useEffect(() => {
    Promise.all([
      api.get("/users").then(r => setUsers(r.data)),
      api.get("/geoprojects").then(r => setProjects(r.data)),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadListado(), loadDep()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo.mes, periodo.anio, filter.categoria, filter.estado, filter.personaId, filter.proyectoId, filter.q]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setFile(null); setError(""); setShowModal(true); };
  const openEdit = (g) => {
    setEditing(g.id);
    setError("");
    setForm({
      categoria: g.categoria, subcategoria: g.subcategoria || "",
      concepto: g.concepto, proveedor: g.proveedor || "",
      monto: g.monto, moneda: g.moneda,
      monto_secundario: g.monto_secundario || "", moneda_secundaria: g.moneda_secundaria || "",
      fecha: g.fecha?.split("T")[0] || "",
      fecha_vencimiento: g.fecha_vencimiento?.split("T")[0] || "",
      periodo_mes: g.periodo_mes ? String(g.periodo_mes) : "",
      periodo_anio: g.periodo_anio ? String(g.periodo_anio) : "",
      estado: g.estado,
      persona_id: g.persona_id ? String(g.persona_id) : "",
      equipo_id: g.equipo_id ? String(g.equipo_id) : "",
      proyecto_id: g.proyecto_id ? String(g.proyecto_id) : "",
      recurrente: !!g.recurrente,
      notas: g.notas || "",
    });
    setFile(null);
    setShowModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "recurrente") { fd.append(k, v ? "true" : "false"); return; }
        if (v !== "" && v != null) fd.append(k, v);
      });
      if (file) fd.append("archivo", file);
      if (editing) await api.put(`/gastos/${editing}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      else         await api.post("/gastos", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShowModal(false);
      loadListado();
    } catch (err) {
      setError(err.response?.data?.error || "Error al guardar el gasto");
    } finally { setSaving(false); }
  };

  const marcarEstado = async (id, estado) => {
    await api.patch(`/gastos/${id}/estado`, { estado });
    loadListado();
  };
  const borrar = async (id) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    await api.delete(`/gastos/${id}`);
    loadListado();
  };

  const personaLabel = (u) => `${u.nombre} ${u.apellido}${u.cargo ? ` — ${u.cargo}` : ""}`;
  const cat = form.categoria;
  const showPersona   = ["CONTRATISTA","VUELO","VIATICO"].includes(cat);
  const personaReq    = cat === "CONTRATISTA";
  const showProyecto  = ["CONTRATISTA","VUELO","VIATICO","OTRO"].includes(cat);
  const showProveedor = ["RECIBO_PUBLICO","ADMINISTRACION","VUELO","OTRO"].includes(cat);
  const showVenc      = ["RECIBO_PUBLICO","ADMINISTRACION","OTRO"].includes(cat);
  const showRecurrente = ["RECIBO_PUBLICO","ADMINISTRACION"].includes(cat);

  const maxHist = useMemo(
    () => Math.max(1, ...(resumen?.historico || []).map(h => h.total_cop)),
    [resumen]
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Gastos</h1>
          <p>Recibos públicos, administración, contratistas, vuelos, viáticos y depreciación</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Nuevo gasto
          </button>
        )}
      </div>

      {/* Alertas por vencer */}
      {alerts.length > 0 && (
        <div className="alert alert-error" style={{ display:"flex", alignItems:"flex-start", gap:"0.75rem", marginBottom:"1.5rem" }}>
          <AlertTriangle size={16} style={{ flexShrink:0, marginTop:2 }} />
          <div>
            <strong>{alerts.length} gasto(s) pendiente(s) por vencer en 5 días:</strong>
            <div style={{ marginTop:"0.35rem", display:"flex", flexWrap:"wrap", gap:"0.5rem" }}>
              {alerts.map(a => (
                <span key={a.id} className="badge badge-red">
                  {a.concepto} — vence {format(new Date(a.fecha_vencimiento), "d MMM", { locale:es })}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selector de período */}
      <div style={{ display:"flex", gap:"0.6rem", alignItems:"center", marginBottom:"1rem", flexWrap:"wrap" }}>
        <span style={{ fontSize:"0.8rem", color:"var(--text-muted)", fontWeight:600 }}>Período contable</span>
        <select style={{ width:140 }} value={periodo.mes}
          onChange={e => setPeriodo({ ...periodo, mes:e.target.value })}>
          {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select style={{ width:110 }} value={periodo.anio}
          onChange={e => setPeriodo({ ...periodo, anio:e.target.value })}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Resumen del mes */}
      {resumen && (
        <div style={{ marginBottom:"1.5rem" }}>
          <div className="stats-grid" style={{ marginBottom:"0.75rem" }}>
            {RESUMEN_CATS.map(c => {
              const d = resumen.categorias[c] || { count:0, total_cop:0, total_usd:0 };
              return (
                <div key={c} className="stat-card">
                  <div className="stat-icon blue" style={{ fontSize:"1rem" }}>{CAT_ICON[c]}</div>
                  <div>
                    <div style={{ fontSize:"0.65rem", color:"var(--text-muted)", fontWeight:600,
                      textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:2 }}>
                      {CAT_LABEL[c]}
                    </div>
                    <div style={{ fontWeight:700, fontSize:"0.95rem", color:"var(--text)" }}>
                      {cop0(d.total_cop)}
                    </div>
                    {d.total_usd > 0 && (
                      <div style={{ fontWeight:600, fontSize:"0.8rem", color:"#1d4ed8", marginTop:1 }}>
                        USD {(+d.total_usd).toLocaleString("es-CO", { minimumFractionDigits:2 })}
                      </div>
                    )}
                    <div className="stat-label">
                      {c === "DEPRECIACION" ? `${d.count} equipo(s)` : `${d.count} registro(s)`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total del mes */}
          <div style={{ background:"#0f172a", color:"#fff", borderRadius:"var(--radius-sm)",
            padding:"1rem 1.25rem", display:"flex", alignItems:"center",
            justifyContent:"space-between", flexWrap:"wrap", gap:"0.75rem" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
              <Wallet size={22} strokeWidth={1.75} />
              <div>
                <div style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.05em",
                  opacity:0.7, fontWeight:600 }}>
                  Gasto total — {MESES[+resumen.mes]} {resumen.anio}
                </div>
                <div style={{ fontSize:"1.5rem", fontWeight:700, letterSpacing:"-0.02em" }}>
                  {cop0(resumen.total_mes_cop)} COP
                </div>
              </div>
            </div>
            {resumen.total_mes_usd > 0 && (
              <div style={{ fontSize:"1rem", fontWeight:700, color:"#93c5fd" }}>
                + USD {(+resumen.total_mes_usd).toLocaleString("es-CO", { minimumFractionDigits:2 })}
              </div>
            )}
          </div>

          {/* Mini tendencia 13 meses (COP, incluye depreciación) */}
          {resumen.historico?.length > 0 && (
            <div style={{ marginTop:"0.75rem", display:"flex", alignItems:"flex-end", gap:"3px",
              height:64, padding:"0 0.25rem" }}>
              {resumen.historico.map((h, i) => (
                <div key={i} title={`${MESES[h.mes]} ${h.anio}: ${cop0(h.total_cop)}`}
                  style={{ flex:1, background: i === resumen.historico.length - 1 ? "var(--primary,#2563eb)" : "#cbd5e1",
                    height:`${Math.max(4, (h.total_cop / maxHist) * 100)}%`, borderRadius:"3px 3px 0 0" }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:"0.25rem", borderBottom:"1px solid var(--border)", marginBottom:"1rem" }}>
        {[["gastos","Gastos"],["depreciacion","Depreciación"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className="btn btn-ghost btn-sm"
            style={{ borderRadius:0, borderBottom: tab === k ? "2px solid var(--primary)" : "2px solid transparent",
              fontWeight: tab === k ? 700 : 500, color: tab === k ? "var(--primary)" : "var(--text-muted)" }}>
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : tab === "gastos" ? (
        <>
          {/* Filtros */}
          <div style={{ display:"flex", gap:"0.75rem", marginBottom:"1.25rem", flexWrap:"wrap", alignItems:"center" }}>
            <Filter size={15} color="var(--text-muted)" />
            <div className="search-box" style={{ flex:1, minWidth:180 }}>
              <span className="search-box-icon">🔍</span>
              <input placeholder="Buscar concepto, proveedor, notas…"
                value={filter.q} onChange={e => setFilter({ ...filter, q:e.target.value })} />
            </div>
            <select style={{ width:170 }} value={filter.categoria}
              onChange={e => setFilter({ ...filter, categoria:e.target.value })}>
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select>
            <select style={{ width:140 }} value={filter.estado}
              onChange={e => setFilter({ ...filter, estado:e.target.value })}>
              <option value="">Todos los estados</option>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select style={{ width:170 }} value={filter.personaId}
              onChange={e => setFilter({ ...filter, personaId:e.target.value })}>
              <option value="">Toda persona</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.nombre} {u.apellido}</option>)}
            </select>
            <select style={{ width:160 }} value={filter.proyectoId}
              onChange={e => setFilter({ ...filter, proyectoId:e.target.value })}>
              <option value="">Todo proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.codigo}</option>)}
            </select>
          </div>

          {gastos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Wallet size={40} strokeWidth={1} color="#e2e8f0" /></div>
              <h3>Sin gastos en este período</h3>
              <p>Registra el primero con el botón de arriba.</p>
            </div>
          ) : (
            <div className="card">
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Concepto</th><th>Proveedor / Persona</th><th>Período</th>
                      <th>Monto</th><th>Vence</th><th>Estado</th><th>Archivo</th>
                      {canEdit && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map(g => {
                      const vencida = g.fecha_vencimiento && new Date(g.fecha_vencimiento) < new Date();
                      return (
                        <tr key={g.id}>
                          <td>
                            <div style={{ fontWeight:600, fontSize:"0.85rem", display:"flex", alignItems:"center", gap:"0.4rem" }}>
                              <span>{CAT_ICON[g.categoria]}</span> {g.concepto}
                            </div>
                            <div style={{ fontSize:"0.72rem", color:"var(--text-muted)", display:"flex", gap:"0.3rem", flexWrap:"wrap", alignItems:"center", marginTop:2 }}>
                              <span className={`badge ${CAT_BADGE[g.categoria]}`} style={{ fontSize:"0.66rem" }}>
                                {CAT_LABEL[g.categoria]}
                              </span>
                              {g.subcategoria && <span>{g.subcategoria}</span>}
                              {g.proyecto_codigo && <span className="badge badge-blue" style={{ fontSize:"0.66rem" }}>{g.proyecto_codigo}</span>}
                            </div>
                            {g.notas && <div style={{ fontSize:"0.72rem", color:"var(--text-muted)", marginTop:2 }}>{g.notas}</div>}
                          </td>
                          <td style={{ fontSize:"0.82rem" }}>
                            {g.persona_nombre || g.proveedor || "—"}
                          </td>
                          <td style={{ fontSize:"0.8rem", color:"var(--text-muted)" }}>
                            {g.periodo_mes && g.periodo_anio
                              ? `${MESES[g.periodo_mes]} ${g.periodo_anio}`
                              : format(new Date(g.fecha), "d MMM yyyy", { locale:es })}
                          </td>
                          <td style={{ fontWeight:700, fontSize:"0.86rem" }}>{fmtDoble(g)}</td>
                          <td style={{ fontSize:"0.8rem", color: vencida && g.estado === "PENDIENTE" ? "var(--danger)" : "inherit" }}>
                            {g.fecha_vencimiento ? format(new Date(g.fecha_vencimiento), "d MMM yyyy", { locale:es }) : "—"}
                          </td>
                          <td><span className={`badge ${ESTADO_BADGE[g.estado]}`}>{g.estado}</span></td>
                          <td>
                            {g.archivo ? (
                              <button className="btn btn-ghost btn-sm"
                                style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                                onClick={() => setViewer({ url:fileUrl(g.archivo), nombre:g.concepto })}>
                                <Eye size={13} /> Ver
                              </button>
                            ) : <span style={{ color:"var(--text-light)", fontSize:"0.78rem" }}>—</span>}
                          </td>
                          {canEdit && (
                            <td>
                              <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
                                {g.estado === "PENDIENTE" && (
                                  <button className="btn btn-sm"
                                    style={{ background:"var(--success-bg)", color:"var(--success)", border:"1px solid #bbf7d0" }}
                                    onClick={() => marcarEstado(g.id, "PAGADO")}>✓ Pagar</button>
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)}>Editar</button>
                                <button className="btn btn-danger btn-sm" onClick={() => borrar(g.id)}>✕</button>
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
          )}
        </>
      ) : (
        /* ── Tab Depreciación ── */
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Equipo</th><th>Valor compra</th><th>Vida útil</th>
                  <th>Depreciación/mes</th><th>Meses</th><th>Dep. acumulada</th><th>Valor en libros</th>
                </tr>
              </thead>
              <tbody>
                {(dep?.items || []).length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--text-muted)", padding:"1.5rem" }}>
                    Ningún equipo con valor de compra registrado.
                  </td></tr>
                ) : dep.items.map(it => (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight:600, fontSize:"0.84rem" }}>{it.nombre}</div>
                      <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                        {it.identificador || "—"}{it.categoria ? ` · ${it.categoria}` : ""}
                        {!it.depreciable && " · no depreciable"}
                      </div>
                    </td>
                    <td style={{ fontSize:"0.83rem" }}>{cop0(it.valor_compra)}</td>
                    <td style={{ fontSize:"0.82rem" }}>{it.vida_util_meses} meses</td>
                    <td style={{ fontWeight:700, fontSize:"0.84rem" }}>{cop0(it.dep_mensual)}</td>
                    <td style={{ fontSize:"0.82rem" }}>{it.meses_transcurridos}/{it.vida_util_meses}</td>
                    <td style={{ fontSize:"0.83rem" }}>{cop0(it.depreciacion_acumulada)}</td>
                    <td style={{ fontWeight:600, fontSize:"0.83rem" }}>{cop0(it.valor_en_libros)}</td>
                  </tr>
                ))}
              </tbody>
              {(dep?.items || []).length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight:700 }}>
                    <td colSpan={3} style={{ textAlign:"right" }}>Depreciación total del mes</td>
                    <td>{cop0(dep.total_dep_mensual)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div style={{ padding:"0.75rem 1rem", fontSize:"0.72rem", color:"var(--text-muted)", display:"flex", alignItems:"center", gap:"0.4rem" }}>
            <TrendingDown size={13} />
            Método lineal en COP. Configura vida útil y valor residual en cada equipo (Inventario → Editar).
          </div>
        </div>
      )}

      {/* Modal crear / editar */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:620 }}>
            <div className="modal-header">
              <h3 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                <Wallet size={16} /> {editing ? "Editar gasto" : "Nuevo gasto"}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Categoría *</label>
                    <select value={form.categoria}
                      onChange={e => setForm({ ...form, categoria:e.target.value, subcategoria:"" })}>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_ICON[c]} {CAT_LABEL[c]}</option>)}
                    </select>
                  </div>
                  {cat === "RECIBO_PUBLICO" && (
                    <div className="form-group">
                      <label className="form-label">Tipo de recibo *</label>
                      <select value={form.subcategoria} required
                        onChange={e => setForm({ ...form, subcategoria:e.target.value })}>
                        <option value="">— Seleccionar —</option>
                        {SUBCATS_RECIBO.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Concepto *</label>
                  <input value={form.concepto} required
                    onChange={e => setForm({ ...form, concepto:e.target.value })}
                    placeholder="Ej: Energía oficina — Agosto 2026" />
                </div>

                {showPersona && (
                  <div className="form-group">
                    <label className="form-label">
                      Persona {personaReq ? "*" : <span style={{ color:"var(--text-muted)", fontWeight:400 }}>(opcional — vacío = gasto suelto)</span>}
                    </label>
                    <select value={form.persona_id} required={personaReq}
                      onChange={e => setForm({ ...form, persona_id:e.target.value })}>
                      <option value="">{personaReq ? "— Seleccionar —" : "Sin persona (gasto suelto)"}</option>
                      {users.map(u => <option key={u.id} value={u.id}>{personaLabel(u)}</option>)}
                    </select>
                  </div>
                )}

                <div className="form-grid">
                  {showProveedor && (
                    <div className="form-group">
                      <label className="form-label">
                        {cat === "VUELO" ? "Aerolínea" : "Proveedor"}
                      </label>
                      <input value={form.proveedor}
                        onChange={e => setForm({ ...form, proveedor:e.target.value })}
                        placeholder={cat === "RECIBO_PUBLICO" ? "Ej: EPM, Claro" : ""} />
                    </div>
                  )}
                  {showProyecto && (
                    <div className="form-group">
                      <label className="form-label">Proyecto (centro de costo)</label>
                      <select value={form.proyecto_id}
                        onChange={e => setForm({ ...form, proyecto_id:e.target.value })}>
                        <option value="">Sin proyecto</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Monto *</label>
                    <input type="number" step="0.01" min="0" required value={form.monto}
                      onChange={e => setForm({ ...form, monto:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Moneda</label>
                    <select value={form.moneda} onChange={e => setForm({ ...form, moneda:e.target.value })}>
                      <option value="COP">COP — Peso</option>
                      <option value="USD">USD — Dólar</option>
                      <option value="EUR">EUR — Euro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monto adicional (otra moneda)</label>
                    <input type="number" step="0.01" min="0" value={form.monto_secundario}
                      onChange={e => setForm({ ...form, monto_secundario:e.target.value })}
                      placeholder="Opcional" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Moneda adicional</label>
                    <select value={form.moneda_secundaria}
                      onChange={e => setForm({ ...form, moneda_secundaria:e.target.value })}>
                      <option value="">— Ninguna —</option>
                      <option value="COP">COP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Fecha del gasto *</label>
                    <input type="date" required value={form.fecha}
                      onChange={e => setForm({ ...form, fecha:e.target.value })} />
                  </div>
                  {showVenc && (
                    <div className="form-group">
                      <label className="form-label">Fecha de vencimiento</label>
                      <input type="date" value={form.fecha_vencimiento}
                        onChange={e => setForm({ ...form, fecha_vencimiento:e.target.value })} />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Mes contable</label>
                    <select value={form.periodo_mes}
                      onChange={e => setForm({ ...form, periodo_mes:e.target.value })}>
                      <option value="">—</option>
                      {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Año contable</label>
                    <select value={form.periodo_anio}
                      onChange={e => setForm({ ...form, periodo_anio:e.target.value })}>
                      <option value="">—</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select value={form.estado} onChange={e => setForm({ ...form, estado:e.target.value })}>
                      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>

                {showRecurrente && (
                  <label style={{ display:"flex", alignItems:"center", gap:"0.5rem", fontSize:"0.82rem", margin:"0.25rem 0 0.5rem" }}>
                    <input type="checkbox" style={{ width:15, height:15, flex:"0 0 15px" }}
                      checked={form.recurrente}
                      onChange={e => setForm({ ...form, recurrente:e.target.checked })} />
                    Gasto recurrente (se repite cada mes)
                  </label>
                )}

                <div className="form-group">
                  <label className="form-label">Archivo (recibo / soporte)</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setFile(e.target.files[0])} style={{ padding:"0.35rem" }} />
                  <span style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>PDF o imagen. Máx 20 MB.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <textarea rows={2} value={form.notas}
                    onChange={e => setForm({ ...form, notas:e.target.value })}
                    placeholder={cat === "VUELO" ? "Ruta, fecha de vuelo, reserva…" : "Observaciones…"} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar gasto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewer && <FileViewer url={viewer.url} nombre={viewer.nombre} onClose={() => setViewer(null)} />}
    </>
  );
}

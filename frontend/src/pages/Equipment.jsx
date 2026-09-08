// frontend/src/pages/Equipment.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Receipt, ExternalLink, AlertTriangle, Eye, Download, X,
  Pencil, RefreshCw, FolderCog, FileSpreadsheet, Trash2, Plus,
  ImagePlus, FileText, Undo2, UploadCloud,
} from "lucide-react";
import { Link } from "react-router-dom";

const API_ORIGIN = (import.meta.env.VITE_API_URL || "/api").replace(/\/api\/?$/, "");
const fileUrl = (name) => `${API_ORIGIN}/uploads/equipment/${name}`;

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
          <iframe src={url} title="Archivo"
            style={{ width:"100%",maxWidth:"900px",height:"calc(100vh - 120px)",
              border:"none",borderRadius:"8px",background:"#fff" }} />
        ) : (
          <img src={url} alt="Archivo"
            style={{ maxWidth:"900px",maxHeight:"calc(100vh - 120px)",
              objectFit:"contain",borderRadius:"8px",boxShadow:"0 8px 40px rgba(0,0,0,0.4)" }} />
        )}
      </div>
    </div>
  );
}

const ESTADOS = ["DISPONIBLE","EN_CAMPO","EN_MANTENIMIENTO","DANADO","DADO_DE_BAJA"];
const ESTADO_BADGE = {
  DISPONIBLE:"badge-green", EN_CAMPO:"badge-blue",
  EN_MANTENIMIENTO:"badge-yellow", DANADO:"badge-red", DADO_DE_BAJA:"badge-gray",
};
const ESTADO_LABEL = {
  DISPONIBLE:"Disponible", EN_CAMPO:"En campo",
  EN_MANTENIMIENTO:"En mantenimiento", DANADO:"Dañado", DADO_DE_BAJA:"Dado de baja",
};

const ACCIONES = [
  { label:"Asignado a proyecto",      estado:"EN_CAMPO" },
  { label:"Devuelto a bodega",        estado:"DISPONIBLE" },
  { label:"Enviado a oficina",        estado:"EN_CAMPO" },
  { label:"Enviado a mantenimiento",  estado:"EN_MANTENIMIENTO" },
  { label:"Retornó de mantenimiento", estado:"DISPONIBLE" },
  { label:"Reportado con daño",       estado:"DANADO" },
];

const emptyForm = {
  nombre:"", categoriaId:"", subtipoId:"", identificador:"",
  marca:"", modelo:"", serial:"", estado:"DISPONIBLE",
  descripcion:"", ubicacion:"", fechaCompra:"", valorCompra:"", proximoMantenimiento:"",
  foto1:null, foto2:null, foto3:null, factura:null,
};

// ── Slot de foto: dropzone + preview, no se reinicia al escribir en el form ──
function PhotoSlot({ label, file, existingUrl, onPick, onClearStaged, onDeleteExisting, onView }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview || existingUrl;
  const pick  = () => inputRef.current?.click();

  return (
    <div className="eq-slot">
      {shown ? (
        <>
          <img className="eq-slot-img" src={shown} alt={label}
            onClick={() => onView(shown)} />
          <div className="eq-slot-actions">
            <button type="button" title="Ver" onClick={() => onView(shown)}><Eye size={14} /></button>
            <button type="button" title="Cambiar" onClick={pick}><ImagePlus size={14} /></button>
            {file ? (
              <button type="button" title="Deshacer" onClick={onClearStaged}><Undo2 size={14} /></button>
            ) : (
              <button type="button" title="Quitar" className="danger" onClick={onDeleteExisting}><Trash2 size={14} /></button>
            )}
          </div>
          {file && <span className="eq-slot-tag">nueva</span>}
        </>
      ) : (
        <button type="button" className="eq-slot-drop" onClick={pick}>
          <ImagePlus size={20} />
          <span>{label}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }} />
    </div>
  );
}

// ── Slot de factura: PDF o imagen ───────────────────────────
function FacturaSlot({ file, existingUrl, existingName, onPick, onClearStaged, onView }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const isImg = file ? file.type.startsWith("image/")
    : /\.(png|jpe?g|webp|gif)$/i.test(existingName || existingUrl || "");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const has  = !!file || !!existingUrl;
  const pick = () => inputRef.current?.click();
  const viewUrl = file && !isImg ? null : (preview || existingUrl);

  return (
    <div className="eq-slot eq-slot--wide">
      {has ? (
        <>
          {isImg && viewUrl ? (
            <img className="eq-slot-img" src={viewUrl} alt="Factura" onClick={() => viewUrl && onView(viewUrl)} />
          ) : (
            <button type="button" className="eq-slot-file" onClick={() => existingUrl && onView(existingUrl)}>
              <FileText size={22} />
              <span>{file ? file.name : "Factura de compra"}</span>
            </button>
          )}
          <div className="eq-slot-actions">
            {(isImg ? viewUrl : existingUrl) && (
              <button type="button" title="Ver" onClick={() => onView(isImg ? viewUrl : existingUrl)}><Eye size={14} /></button>
            )}
            <button type="button" title="Cambiar" onClick={pick}><UploadCloud size={14} /></button>
            {file && <button type="button" title="Deshacer" onClick={onClearStaged}><Undo2 size={14} /></button>}
          </div>
          {file && <span className="eq-slot-tag">nueva</span>}
        </>
      ) : (
        <button type="button" className="eq-slot-drop" onClick={pick}>
          <UploadCloud size={20} />
          <span>Factura de compra</span>
          <small>PDF o imagen</small>
        </button>
      )}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }} />
    </div>
  );
}

const EQ_MODAL_CSS = `
.eq-section { margin-top: 1.25rem; }
.eq-section-title {
  display:flex; align-items:center; gap:.5rem;
  font-size:.8rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color:var(--text-muted); margin:0 0 .6rem;
}
.eq-section-title::after { content:""; flex:1; height:1px; background:var(--border); }
.eq-slots { display:flex; flex-wrap:wrap; gap:.75rem; }
.eq-slot {
  position:relative; width:132px; height:132px; border-radius:12px; overflow:hidden;
  background:var(--bg-subtle, #f1f5f9); flex:0 0 auto;
}
.eq-slot--wide { width:280px; }
.eq-slot-img { width:100%; height:100%; object-fit:cover; cursor:zoom-in; display:block; }
.eq-slot-file {
  width:100%; height:100%; border:none; background:linear-gradient(135deg,#eef2ff,#e0e7ff);
  color:#4338ca; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.4rem; cursor:pointer; padding:.5rem; text-align:center;
}
.eq-slot-file span { font-size:.72rem; font-weight:600; word-break:break-word; line-height:1.2; }
.eq-slot-drop {
  width:100%; height:100%; border:1.5px dashed var(--border);
  background:transparent; border-radius:12px; cursor:pointer;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.35rem;
  color:var(--text-muted); font-size:.75rem; font-weight:600; transition:all .15s;
}
.eq-slot-drop small { font-size:.65rem; font-weight:500; opacity:.75; }
.eq-slot-drop:hover { border-color:var(--primary); color:var(--primary); background:var(--primary-50,#eff6ff); }
.eq-slot-actions {
  position:absolute; inset:auto 0 0 0; display:flex; gap:.25rem; justify-content:center;
  padding:.4rem; background:linear-gradient(to top, rgba(2,8,20,.78), transparent);
  opacity:0; transition:opacity .15s;
}
.eq-slot:hover .eq-slot-actions { opacity:1; }
.eq-slot-actions button {
  width:26px; height:26px; border-radius:6px; border:none; cursor:pointer;
  background:rgba(255,255,255,.92); color:#0f172a;
  display:flex; align-items:center; justify-content:center;
}
.eq-slot-actions button:hover { background:#fff; }
.eq-slot-actions button.danger:hover { background:#fee2e2; color:#b91c1c; }
.eq-slot-tag {
  position:absolute; top:.4rem; left:.4rem; font-size:.6rem; font-weight:700;
  text-transform:uppercase; letter-spacing:.04em;
  background:var(--primary,#2563eb); color:#fff; padding:.1rem .4rem; border-radius:5px;
}
`;

// ── Modal facturas del módulo de Facturación ─────────────────
function InvoiceModal({ equipo, onClose }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [viewer, setViewer]     = useState(null);
  const invBase = `${API_ORIGIN}/uploads/invoices`;

  useEffect(() => {
    api.get(`/equipment/${equipo.id}/invoices`)
      .then(r => setInvoices(r.data))
      .finally(() => setLoading(false));
  }, [equipo.id]);

  const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const fmt = (m, mon) => {
    const n = parseFloat(m) || 0;
    return mon === "USD"
      ? `USD ${n.toLocaleString("es-CO",{minimumFractionDigits:2})}`
      : `$${n.toLocaleString("es-CO",{maximumFractionDigits:0})} COP`;
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:700 }}>
        <div className="modal-header">
          <h3 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
            <Receipt size={16} /> Facturas — {equipo.nombre}
          </h3>
          <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
            <Link to={`/facturas?equipoId=${equipo.id}`} className="btn btn-outline btn-sm"
              style={{ display:"flex", alignItems:"center", gap:"0.3rem" }} onClick={onClose}>
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
            <table>
              <thead>
                <tr><th>Concepto</th><th>Período</th><th>Monto</th><th>Estado</th><th>Archivo</th></tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight:600, fontSize:"0.82rem" }}>{inv.concepto}</div>
                      <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>{inv.proveedor}</div>
                    </td>
                    <td style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>
                      {inv.periodo_mes && inv.periodo_anio
                        ? `${MESES[inv.periodo_mes]} ${inv.periodo_anio}`
                        : format(new Date(inv.fecha_emision), "d MMM yyyy", { locale:es })}
                    </td>
                    <td style={{ fontWeight:700, fontSize:"0.85rem" }}>{fmt(inv.monto, inv.moneda)}</td>
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
                          onClick={() => setViewer({ url:`${invBase}/${inv.archivo_pdf}`, nombre:inv.concepto })}>
                          <Eye size={13} /> Ver
                        </button>
                      ) : <span style={{ color:"var(--text-light)", fontSize:"0.75rem" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {viewer && <FileViewer url={viewer.url} nombre={viewer.nombre} onClose={() => setViewer(null)} />}
    </div>
  );
}

// ── Modal gestión de categorías / subtipos ──────────────────
function CategoriasModal({ categorias, onClose, onChange }) {
  const [nuevaCat, setNuevaCat] = useState({ nombre:"", prefijo:"", icono:"📦" });
  const [subInputs, setSubInputs] = useState({});   // { [catId]: "texto" }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const wrap = (fn) => async () => {
    setBusy(true); setError("");
    try { await fn(); await onChange(); }
    catch (e) { setError(e.response?.data?.error || "Error"); }
    finally { setBusy(false); }
  };

  const crearCat = wrap(async () => {
    if (!nuevaCat.nombre.trim() || !nuevaCat.prefijo.trim()) throw { response:{ data:{ error:"Nombre y prefijo requeridos" } } };
    await api.post("/equipment/categorias", nuevaCat);
    setNuevaCat({ nombre:"", prefijo:"", icono:"📦" });
  });
  const editarCat = (c, patch) => wrap(() => api.put(`/equipment/categorias/${c.id}`, { ...c, ...patch }))();
  const borrarCat = (c) => {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    wrap(() => api.delete(`/equipment/categorias/${c.id}`))();
  };
  const crearSub = (catId) => wrap(async () => {
    const nombre = (subInputs[catId] || "").trim();
    if (!nombre) return;
    await api.post(`/equipment/categorias/${catId}/subtipos`, { nombre });
    setSubInputs(s => ({ ...s, [catId]: "" }));
  })();
  const borrarSub = (s) => {
    if (!confirm(`¿Eliminar el subtipo "${s.nombre}"?`)) return;
    wrap(() => api.delete(`/equipment/subtipos/${s.id}`))();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:640 }}>
        <div className="modal-header">
          <h3 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
            <FolderCog size={16} /> Categorías y subtipos
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          {/* Crear categoría */}
          <div className="form-grid" style={{ alignItems:"end", marginBottom:"1rem" }}>
            <div className="form-group">
              <label className="form-label">Nueva categoría</label>
              <input placeholder="Ej. Mobiliario" value={nuevaCat.nombre}
                onChange={e => setNuevaCat({ ...nuevaCat, nombre:e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Prefijo</label>
              <input placeholder="MOB" value={nuevaCat.prefijo} maxLength={8}
                onChange={e => setNuevaCat({ ...nuevaCat, prefijo:e.target.value.toUpperCase() })} />
            </div>
            <div className="form-group" style={{ maxWidth:80 }}>
              <label className="form-label">Ícono</label>
              <input value={nuevaCat.icono}
                onChange={e => setNuevaCat({ ...nuevaCat, icono:e.target.value })} />
            </div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={crearCat}>
              <Plus size={13} /> Añadir
            </button>
          </div>

          {/* Lista de categorías */}
          {categorias.map(c => (
            <div key={c.id} className="card" style={{ marginBottom:"0.75rem" }}>
              <div className="card-body" style={{ padding:"0.75rem 1rem" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", flexWrap:"wrap" }}>
                  <input style={{ width:44, textAlign:"center" }} defaultValue={c.icono}
                    onBlur={e => e.target.value !== c.icono && editarCat(c, { icono:e.target.value })} />
                  <input style={{ flex:1, minWidth:120, fontWeight:600 }} defaultValue={c.nombre}
                    onBlur={e => e.target.value !== c.nombre && editarCat(c, { nombre:e.target.value })} />
                  <input style={{ width:90 }} defaultValue={c.prefijo} maxLength={8}
                    onBlur={e => e.target.value.toUpperCase() !== c.prefijo && editarCat(c, { prefijo:e.target.value.toUpperCase() })} />
                  <span style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                    {c._count?.equipos ?? 0} equipos
                  </span>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => borrarCat(c)}
                    title="Eliminar categoría">
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Subtipos */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:"0.35rem", marginTop:"0.6rem" }}>
                  {(c.subtipos || []).map(s => (
                    <span key={s.id} className="badge badge-blue"
                      style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}>
                      {s.nombre}
                      <button onClick={() => borrarSub(s)}
                        style={{ background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, color:"inherit" }}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display:"flex", gap:"0.4rem", marginTop:"0.5rem" }}>
                  <input placeholder="Nuevo subtipo…" style={{ flex:1 }}
                    value={subInputs[c.id] || ""}
                    onChange={e => setSubInputs(s => ({ ...s, [c.id]:e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && crearSub(c.id)} />
                  <button className="btn btn-outline btn-sm" disabled={busy}
                    onClick={() => crearSub(c.id)}>Añadir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}

export default function Equipment() {
  const { user } = useAuth();
  const [items, setItems]       = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const [filter, setFilter]     = useState({ q:"", estado:"", categoriaId:"", subtipoId:"" });
  const [equipoModal, setEquipoModal] = useState(null);  // { mode:"create" } | { mode:"edit", item }
  const [form, setForm]         = useState(emptyForm);
  const [showLogModal, setShowLogModal] = useState(null);
  const [showInvModal, setShowInvModal] = useState(null);
  const [showCatModal, setShowCatModal] = useState(false);
  const [viewer, setViewer]     = useState(null);
  const [logForm, setLogForm]   = useState({ accion:"", notas:"", nuevoEstado:"", proyectoId:"" });
  const [exporting, setExporting] = useState(false);

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const loadCategorias = () =>
    api.get("/equipment/categorias").then(r => setCategorias(r.data));

  const load = async () => {
    const params = new URLSearchParams();
    if (filter.estado)      params.set("estado", filter.estado);
    if (filter.categoriaId) params.set("categoriaId", filter.categoriaId);
    if (filter.subtipoId)   params.set("subtipoId", filter.subtipoId);
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

  useEffect(() => { loadCategorias(); }, []);
  useEffect(() => { load(); }, [filter.estado, filter.categoriaId, filter.subtipoId]);

  const subtiposDe = (catId) =>
    categorias.find(c => String(c.id) === String(catId))?.subtipos || [];

  // Identificador propuesto al elegir categoría/fecha (solo al crear)
  useEffect(() => {
    if (equipoModal?.mode !== "create" || !form.categoriaId) return;
    let cancel = false;
    api.get("/equipment/next-identificador", {
      params: { categoriaId: form.categoriaId, fecha: form.fechaCompra || undefined },
    }).then(r => { if (!cancel) setForm(f => ({ ...f, identificador: r.data.identificador })); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [form.categoriaId, form.fechaCompra, equipoModal]);

  const openCreate = () => { setForm(emptyForm); setError(""); setEquipoModal({ mode:"create" }); };
  const openEdit = (item) => {
    setError("");
    setForm({
      ...emptyForm,
      nombre: item.nombre || "",
      categoriaId: item.categoria?.id ? String(item.categoria.id) : "",
      subtipoId: item.subtipo?.id ? String(item.subtipo.id) : "",
      identificador: item.identificador || "",
      marca: item.marca || "", modelo: item.modelo || "", serial: item.serial || "",
      estado: item.estado, descripcion: item.descripcion || "", ubicacion: item.ubicacion || "",
      fechaCompra: item.fecha_compra ? item.fecha_compra.slice(0,10) : "",
      valorCompra: item.valor_compra ?? "",
      proximoMantenimiento: item.proximo_mantenimiento ? item.proximo_mantenimiento.slice(0,10) : "",
    });
    setEquipoModal({ mode:"edit", item });
  };

  const regenerarId = () => {
    if (!form.categoriaId) return;
    api.get("/equipment/next-identificador", {
      params: { categoriaId: form.categoriaId, fecha: form.fechaCompra || undefined },
    }).then(r => setForm(f => ({ ...f, identificador: r.data.identificador }))).catch(() => {});
  };

  const quitarFoto = async (n) => {
    if (!equipoModal?.item) return;
    if (!confirm("¿Quitar esta foto?")) return;
    await api.delete(`/equipment/${equipoModal.item.id}/foto/${n}`);
    const fresh = await api.get(`/equipment/${equipoModal.item.id}`);
    setEquipoModal({ mode:"edit", item: fresh.data });
    load();
  };

  const submitEquipo = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const fd = new FormData();
      const map = {
        nombre:"nombre", categoriaId:"categoriaId", subtipoId:"subtipoId",
        identificador:"identificador", marca:"marca", modelo:"modelo", serial:"serial",
        estado:"estado", descripcion:"descripcion", ubicacion:"ubicacion",
        fechaCompra:"fechaCompra", valorCompra:"valorCompra", proximoMantenimiento:"proximoMantenimiento",
      };
      for (const k of Object.keys(map)) if (form[k] !== "" && form[k] != null) fd.append(map[k], form[k]);
      for (const f of ["foto1","foto2","foto3","factura"]) if (form[f]) fd.append(f, form[f]);

      if (equipoModal.mode === "create") await api.post("/equipment", fd);
      else await api.put(`/equipment/${equipoModal.item.id}`, fd);

      setEquipoModal(null);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Error al guardar el equipo");
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
  const handleAccionChange = (accion) => {
    const found = ACCIONES.find(a => a.label === accion);
    setLogForm(prev => ({ ...prev, accion, nuevoEstado: found?.estado || "" }));
  };

  const exportarExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get("/equipment/export.xlsx", { responseType:"blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventario-equipos-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      [i.nombre, i.identificador, i.serial, i.marca, i.modelo]
        .some(v => (v || "").toLowerCase().includes(q))
    );
  }, [items, filter.q]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventario de Equipos</h1>
          <p>Control de equipos, asignaciones, mantenimientos y facturas</p>
        </div>
        <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
          <button className="btn btn-outline" disabled={exporting} onClick={exportarExcel}
            style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}>
            <FileSpreadsheet size={15} /> {exporting ? "Generando…" : "Exportar Excel"}
          </button>
          {canEdit && (
            <button className="btn btn-outline" onClick={() => setShowCatModal(true)}
              style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}>
              <FolderCog size={15} /> Categorías
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={openCreate}>+ Nuevo equipo</button>
          )}
        </div>
      </div>

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
              estado==="EN_MANTENIMIENTO"?"yellow":"red"}`}>
              {estado==="DISPONIBLE"?"✅":estado==="EN_CAMPO"?"📍":estado==="EN_MANTENIMIENTO"?"🔧":"⚠️"}
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
          <input placeholder="Buscar por nombre, identificador, serial…"
            value={filter.q} onChange={e => setFilter({ ...filter, q:e.target.value })} />
        </div>
        <select style={{ width:180 }} value={filter.categoriaId}
          onChange={e => setFilter({ ...filter, categoriaId:e.target.value, subtipoId:"" })}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
        </select>
        <select style={{ width:170 }} value={filter.subtipoId} disabled={!filter.categoriaId}
          onChange={e => setFilter({ ...filter, subtipoId:e.target.value })}>
          <option value="">Todos los subtipos</option>
          {subtiposDe(filter.categoriaId).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
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
        <div className="empty-state"><div className="empty-state-icon">📦</div><h3>Sin equipos</h3></div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Equipo</th><th>Identificador</th><th>Serial</th><th>Estado</th>
                  <th>Proyecto actual</th><th>Próx. mant.</th><th>Facturas</th>
                  {canEdit && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                        {item.foto1 ? (
                          <img src={fileUrl(item.foto1)} alt=""
                            onClick={() => setViewer({ url:fileUrl(item.foto1), nombre:item.nombre })}
                            style={{ width:38, height:38, objectFit:"cover", borderRadius:6,
                              cursor:"pointer", flexShrink:0, border:"1px solid var(--border)" }} />
                        ) : (
                          <span style={{ fontSize:"1.2rem" }}>{item.categoria?.icono || "📦"}</span>
                        )}
                        <div>
                          <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{item.nombre}</div>
                          <div style={{ fontSize:"0.72rem", color:"var(--text-muted)",
                            display:"flex", gap:"0.3rem", flexWrap:"wrap", alignItems:"center" }}>
                            {item.categoria && <span className="badge badge-gray">{item.categoria.nombre}</span>}
                            {item.subtipo && <span>{item.subtipo.nombre}</span>}
                            {(item.marca || item.modelo) && <span>· {item.marca} {item.modelo}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize:"0.8rem", fontFamily:"monospace" }}>{item.identificador || "—"}</td>
                    <td style={{ fontSize:"0.82rem", fontFamily:"monospace" }}>{item.serial || "—"}</td>
                    <td><span className={`badge ${ESTADO_BADGE[item.estado]}`}>{ESTADO_LABEL[item.estado]}</span></td>
                    <td style={{ fontSize:"0.82rem" }}>
                      {item.proyectoActual
                        ? <span className="badge badge-blue">{item.proyectoActual.codigo}</span>
                        : <span style={{ color:"var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ fontSize:"0.8rem" }}>
                      {item.proximo_mantenimiento ? (
                        <span style={{ color: new Date(item.proximo_mantenimiento) < new Date() ? "var(--danger)" : "inherit" }}>
                          {format(new Date(item.proximo_mantenimiento), "d MMM yyyy", { locale:es })}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}
                        onClick={() => setShowInvModal(item)}>
                        <Receipt size={13} /> Ver
                      </button>
                    </td>
                    {canEdit && (
                      <td style={{ whiteSpace:"nowrap" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}
                          style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => setShowLogModal(item.id)}>
                          Movimiento
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

      {/* Modal crear / editar equipo */}
      {equipoModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEquipoModal(null)}>
          <style>{EQ_MODAL_CSS}</style>
          <div className="modal" style={{ maxWidth:640 }}>
            <div className="modal-header">
              <h3>{equipoModal.mode === "create" ? "Nuevo equipo" : `Editar ${equipoModal.item.nombre}`}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEquipoModal(null)}>✕</button>
            </div>
            <form onSubmit={submitEquipo}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre *</label>
                    <input value={form.nombre} onChange={e => setForm({ ...form, nombre:e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoría *</label>
                    <select value={form.categoriaId} required
                      onChange={e => setForm({ ...form, categoriaId:e.target.value, subtipoId:"" })}>
                      <option value="">Seleccionar…</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subtipo</label>
                    <select value={form.subtipoId} disabled={!form.categoriaId}
                      onChange={e => setForm({ ...form, subtipoId:e.target.value })}>
                      <option value="">Seleccionar…</option>
                      {subtiposDe(form.categoriaId).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Identificador interno</label>
                    <div style={{ display:"flex", gap:"0.35rem" }}>
                      <input value={form.identificador} style={{ fontFamily:"monospace" }}
                        onChange={e => setForm({ ...form, identificador:e.target.value })}
                        placeholder="PC-20240404-001" />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={regenerarId}
                        title="Regenerar" disabled={!form.categoriaId}>
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Marca</label>
                    <input value={form.marca} onChange={e => setForm({ ...form, marca:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Modelo</label>
                    <input value={form.modelo} onChange={e => setForm({ ...form, modelo:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Serial</label>
                    <input value={form.serial} onChange={e => setForm({ ...form, serial:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ubicación</label>
                    <input value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select value={form.estado} onChange={e => setForm({ ...form, estado:e.target.value })}>
                      {ESTADOS.filter(x => x !== "DADO_DE_BAJA").map(x => (
                        <option key={x} value={x}>{ESTADO_LABEL[x]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de compra</label>
                    <input type="date" value={form.fechaCompra}
                      onChange={e => setForm({ ...form, fechaCompra:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Valor de compra</label>
                    <input type="number" step="0.01" value={form.valorCompra}
                      onChange={e => setForm({ ...form, valorCompra:e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Próximo mantenimiento</label>
                    <input type="date" value={form.proximoMantenimiento}
                      onChange={e => setForm({ ...form, proximoMantenimiento:e.target.value })} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea rows={2} value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion:e.target.value })} />
                </div>

                {/* Fotos */}
                <div className="eq-section">
                  <h4 className="eq-section-title"><ImagePlus size={14} /> Fotos del equipo</h4>
                  <div className="eq-slots">
                    {[1,2,3].map(n => {
                      const campo  = `foto${n}`;
                      const actual = equipoModal.mode === "edit" ? equipoModal.item[campo] : null;
                      return (
                        <PhotoSlot
                          key={n}
                          label={`Foto ${n}`}
                          file={form[campo]}
                          existingUrl={actual ? fileUrl(actual) : null}
                          onPick={(f) => setForm(prev => ({ ...prev, [campo]: f }))}
                          onClearStaged={() => setForm(prev => ({ ...prev, [campo]: null }))}
                          onDeleteExisting={() => quitarFoto(n)}
                          onView={(url) => setViewer({ url, nombre: `Foto ${n} — ${form.nombre || "equipo"}` })}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Factura */}
                <div className="eq-section">
                  <h4 className="eq-section-title"><FileText size={14} /> Factura de compra</h4>
                  <div className="eq-slots">
                    <FacturaSlot
                      file={form.factura}
                      existingUrl={equipoModal.mode === "edit" && equipoModal.item.factura_archivo
                        ? fileUrl(equipoModal.item.factura_archivo) : null}
                      existingName={equipoModal.mode === "edit" ? equipoModal.item.factura_archivo : null}
                      onPick={(f) => setForm(prev => ({ ...prev, factura: f }))}
                      onClearStaged={() => setForm(prev => ({ ...prev, factura: null }))}
                      onView={(url) => setViewer({ url, nombre: "Factura de compra" })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEquipoModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : equipoModal.mode === "create" ? "Crear equipo" : "Guardar cambios"}
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
                <div className="form-group">
                  <label className="form-label">Acción *</label>
                  <select value={logForm.accion} onChange={e => handleAccionChange(e.target.value)} required>
                    <option value="">Seleccionar...</option>
                    {ACCIONES.map(a => <option key={a.label} value={a.label}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Nuevo estado *</label>
                  <select value={logForm.nuevoEstado}
                    onChange={e => setLogForm({ ...logForm, nuevoEstado:e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {ESTADOS.filter(e => e !== "DADO_DE_BAJA").map(e => (
                      <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Proyecto <span style={{ color:"var(--text-muted)", fontWeight:400 }}>
                      (opcional — dejar vacío si es transversal o uso en oficina)
                    </span>
                  </label>
                  <select value={logForm.proyectoId}
                    onChange={e => setLogForm({ ...logForm, proyectoId:e.target.value })}>
                    <option value="">Sin proyecto asignado</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <textarea rows={2} value={logForm.notas}
                    onChange={e => setLogForm({ ...logForm, notas:e.target.value })}
                    placeholder="Observaciones del movimiento..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowLogModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvModal && <InvoiceModal equipo={showInvModal} onClose={() => setShowInvModal(null)} />}
      {showCatModal && (
        <CategoriasModal categorias={categorias} onClose={() => setShowCatModal(false)}
          onChange={loadCategorias} />
      )}
      {viewer && <FileViewer url={viewer.url} nombre={viewer.nombre} onClose={() => setViewer(null)} />}
    </>
  );
}

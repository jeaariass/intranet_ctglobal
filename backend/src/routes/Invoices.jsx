// frontend/src/pages/Invoices.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Receipt, Plus, AlertTriangle, CheckCircle,
  Clock, XCircle, Download, Filter
} from "lucide-react";

const TIPOS = ["COMPRA","SERVICIO_MENSUAL","SERVICIO_ANUAL","MANTENIMIENTO","OTRO"];
const ESTADOS = ["PENDIENTE","PAGADO","VENCIDO","CANCELADO"];
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const TIPO_LABEL = {
  COMPRA:"Compra", SERVICIO_MENSUAL:"Servicio mensual",
  SERVICIO_ANUAL:"Servicio anual", MANTENIMIENTO:"Mantenimiento", OTRO:"Otro",
};

const ESTADO_BADGE = {
  PENDIENTE:"badge-yellow", PAGADO:"badge-green",
  VENCIDO:"badge-red", CANCELADO:"badge-gray",
};

const ESTADO_ICON = {
  PENDIENTE: Clock, PAGADO: CheckCircle,
  VENCIDO: XCircle, CANCELADO: XCircle,
};

function formatMonto(monto, moneda) {
  const n = parseFloat(monto);
  if (moneda === "USD") return `USD ${n.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`;
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

const emptyForm = {
  concepto:"", tipo:"SERVICIO_MENSUAL", estado:"PENDIENTE", proveedor:"",
  monto:"", moneda:"COP", fecha_emision:"", fecha_vencimiento:"",
  periodo_mes:"", periodo_anio: new Date().getFullYear().toString(),
  equipo_id:"", notas:"",
};

export default function Invoices() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const equipoIdParam = searchParams.get("equipoId") || "";

  const [invoices, setInvoices]   = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [summary, setSummary]     = useState(null);
  const [equipos, setEquipos]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [file, setFile]           = useState(null);
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState({
    tipo:"", estado:"", mes:"", anio:"",
    equipoId: equipoIdParam,   // pre-cargado desde URL
  });

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);
  const apiBase = typeof window !== "undefined"
    ? window.location.origin.replace("5173","3001") : "";

  const load = async () => {
    const params = new URLSearchParams();
    if (filter.tipo)     params.set("tipo",     filter.tipo);
    if (filter.estado)   params.set("estado",   filter.estado);
    if (filter.mes)      params.set("mes",       filter.mes);
    if (filter.anio)     params.set("anio",      filter.anio);
    if (filter.equipoId) params.set("equipoId",  filter.equipoId);

    const [inv, al, sum, eq] = await Promise.all([
      api.get(`/invoices?${params}`),
      api.get("/invoices/alerts"),
      api.get("/invoices/summary"),
      api.get("/equipment"),
    ]);
    setInvoices(inv.data);
    setAlerts(al.data);
    setSummary(sum.data);
    setEquipos(eq.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter.tipo, filter.estado, filter.mes, filter.anio, filter.equipoId]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFile(null);
    setShowModal(true);
  };

  const openEdit = (inv) => {
    setEditing(inv.id);
    setForm({
      concepto:          inv.concepto,
      tipo:              inv.tipo,
      estado:            inv.estado,
      proveedor:         inv.proveedor || "",
      monto:             inv.monto,
      moneda:            inv.moneda,
      fecha_emision:     inv.fecha_emision?.split("T")[0] || "",
      fecha_vencimiento: inv.fecha_vencimiento?.split("T")[0] || "",
      periodo_mes:       inv.periodo_mes  || "",
      periodo_anio:      inv.periodo_anio || "",
      equipo_id:         inv.equipo_id   || "",
      notas:             inv.notas        || "",
    });
    setFile(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== "") fd.append(k, v); });
      if (file) fd.append("archivo_pdf", file);

      if (editing) {
        await api.put(`/invoices/${editing}`, fd,
          { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await api.post("/invoices", fd,
          { headers: { "Content-Type": "multipart/form-data" } });
      }
      setShowModal(false);
      load();
    } finally { setSaving(false); }
  };

  const handleEstado = async (id, estado) => {
    await api.patch(`/invoices/${id}/estado`, { estado });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar esta factura?")) return;
    await api.delete(`/invoices/${id}`);
    load();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Facturación</h1>
          <p>Control de facturas de equipos y servicios recurrentes</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Nueva factura
          </button>
        )}
      </div>

      {/* Banner si viene de un equipo específico */}
      {filter.equipoId && (
        <div style={{ background:"var(--primary-50)", border:"1px solid var(--primary-100)",
          borderRadius:"var(--radius-sm)", padding:"0.65rem 1rem", marginBottom:"1rem",
          fontSize:"0.82rem", color:"var(--primary)", display:"flex",
          justifyContent:"space-between", alignItems:"center" }}>
          <span>
            Mostrando facturas del equipo seleccionado
          </span>
          <button className="btn btn-ghost btn-sm"
            onClick={() => setFilter({ ...filter, equipoId:"" })}>
            Ver todas
          </button>
        </div>
      )}

      {/* Alertas por vencer */}
      {alerts.length > 0 && (
        <div className="alert alert-error" style={{ display:"flex", alignItems:"flex-start", gap:"0.75rem", marginBottom:"1.5rem" }}>
          <AlertTriangle size={16} style={{ flexShrink:0, marginTop:2 }} />
          <div>
            <strong>{alerts.length} factura(s) por vencer en los próximos 5 días:</strong>
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

      {/* Resumen del mes */}
      {summary && (
        <div className="stats-grid" style={{ marginBottom:"1.5rem" }}>
          <div className="stat-card">
            <div className="stat-icon green"><CheckCircle size={17} strokeWidth={1.75} /></div>
            <div>
              <div className="stat-value" style={{ fontSize:"1.2rem" }}>
                {formatMonto(summary.pagados.total, "COP")}
              </div>
              <div className="stat-label">Pagado este mes ({summary.pagados.count})</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon yellow"><Clock size={17} strokeWidth={1.75} /></div>
            <div>
              <div className="stat-value" style={{ fontSize:"1.2rem" }}>
                {formatMonto(summary.pendientes.total, "COP")}
              </div>
              <div className="stat-label">Pendiente este mes ({summary.pendientes.count})</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red"><XCircle size={17} strokeWidth={1.75} /></div>
            <div>
              <div className="stat-value" style={{ fontSize:"1.2rem" }}>
                {summary.vencidos.count}
              </div>
              <div className="stat-label">Facturas vencidas sin pagar</div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display:"flex", gap:"0.75rem", marginBottom:"1.25rem", flexWrap:"wrap", alignItems:"center" }}>
        <Filter size={15} color="var(--text-muted)" />
        <select style={{ width:180 }} value={filter.tipo}
          onChange={e => setFilter({ ...filter, tipo: e.target.value })}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
        </select>
        <select style={{ width:160 }} value={filter.estado}
          onChange={e => setFilter({ ...filter, estado: e.target.value })}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select style={{ width:130 }} value={filter.mes}
          onChange={e => setFilter({ ...filter, mes: e.target.value })}>
          <option value="">Todos los meses</option>
          {MESES.slice(1).map((m, i) => (
            <option key={i+1} value={i+1}>{m}</option>
          ))}
        </select>
        <select style={{ width:110 }} value={filter.anio}
          onChange={e => setFilter({ ...filter, anio: e.target.value })}>
          <option value="">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(filter.tipo || filter.estado || filter.mes || filter.anio) && (
          <button className="btn btn-ghost btn-sm"
            onClick={() => setFilter({ tipo:"", estado:"", mes:"", anio:"" })}>
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Receipt size={40} strokeWidth={1} color="#e2e8f0" /></div>
          <h3>Sin facturas</h3>
          <p>Registra la primera factura con el botón de arriba.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Proveedor</th>
                  <th>Tipo</th>
                  <th>Período</th>
                  <th>Monto</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th>PDF</th>
                  {canEdit && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const EstadoIcon = ESTADO_ICON[inv.estado] || Clock;
                  const vencida = inv.fecha_vencimiento && new Date(inv.fecha_vencimiento) < new Date();
                  return (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{inv.concepto}</div>
                        {inv.equipo && (
                          <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                            📦 {inv.equipo.nombre}
                          </div>
                        )}
                        {inv.notas && (
                          <div style={{ fontSize:"0.72rem", color:"var(--text-muted)", marginTop:2 }}>
                            {inv.notas}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize:"0.83rem" }}>{inv.proveedor || "—"}</td>
                      <td>
                        <span className="badge badge-gray" style={{ fontSize:"0.68rem" }}>
                          {TIPO_LABEL[inv.tipo]}
                        </span>
                      </td>
                      <td style={{ fontSize:"0.82rem", color:"var(--text-muted)" }}>
                        {inv.periodo_mes && inv.periodo_anio
                          ? `${MESES[inv.periodo_mes]} ${inv.periodo_anio}`
                          : format(new Date(inv.fecha_emision), "d MMM yyyy", { locale:es })}
                      </td>
                      <td style={{ fontWeight:700, fontSize:"0.88rem" }}>
                        {formatMonto(inv.monto, inv.moneda)}
                      </td>
                      <td style={{ fontSize:"0.82rem", color: vencida && inv.estado==="PENDIENTE" ? "var(--danger)" : "inherit" }}>
                        {inv.fecha_vencimiento
                          ? format(new Date(inv.fecha_vencimiento), "d MMM yyyy", { locale:es })
                          : "—"}
                      </td>
                      <td>
                        <span className={`badge ${ESTADO_BADGE[inv.estado]}`}
                          style={{ display:"flex", alignItems:"center", gap:"0.3rem", width:"fit-content" }}>
                          <EstadoIcon size={11} />
                          {inv.estado}
                        </span>
                      </td>
                      <td>
                        {inv.archivo_pdf ? (
                          <a href={`${apiBase}/uploads/invoices/${inv.archivo_pdf}`}
                            target="_blank" rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}>
                            <Download size={13} /> PDF
                          </a>
                        ) : (
                          <span style={{ color:"var(--text-light)", fontSize:"0.78rem" }}>—</span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
                            {inv.estado === "PENDIENTE" && (
                              <button className="btn btn-sm"
                                style={{ background:"var(--success-bg)", color:"var(--success)", border:"1px solid #bbf7d0" }}
                                onClick={() => handleEstado(inv.id, "PAGADO")}>
                                ✓ Pagar
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => openEdit(inv)}>
                              Editar
                            </button>
                            <button className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(inv.id)}>
                              ✕
                            </button>
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

      {/* Modal crear / editar */}
      {showModal && (
        <div className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:600 }}>
            <div className="modal-header">
              <h3 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
                <Receipt size={16} />
                {editing ? "Editar factura" : "Nueva factura"}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {/* Concepto */}
                <div className="form-group">
                  <label className="form-label">Concepto *</label>
                  <input value={form.concepto}
                    onChange={e => setForm({ ...form, concepto: e.target.value })}
                    placeholder="Ej: Suscripción Claude AI - Marzo 2025"
                    required />
                </div>

                <div className="form-grid">
                  {/* Tipo */}
                  <div className="form-group">
                    <label className="form-label">Tipo *</label>
                    <select value={form.tipo}
                      onChange={e => setForm({ ...form, tipo: e.target.value })}>
                      {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                    </select>
                  </div>
                  {/* Estado */}
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select value={form.estado}
                      onChange={e => setForm({ ...form, estado: e.target.value })}>
                      {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  {/* Proveedor */}
                  <div className="form-group">
                    <label className="form-label">Proveedor</label>
                    <input value={form.proveedor}
                      onChange={e => setForm({ ...form, proveedor: e.target.value })}
                      placeholder="Ej: Anthropic, Hosdite, OpenAI" />
                  </div>
                  {/* Monto */}
                  <div className="form-group">
                    <label className="form-label">Monto *</label>
                    <input type="number" step="0.01" min="0"
                      value={form.monto}
                      onChange={e => setForm({ ...form, monto: e.target.value })}
                      placeholder="185000" required />
                  </div>
                  {/* Moneda */}
                  <div className="form-group">
                    <label className="form-label">Moneda</label>
                    <select value={form.moneda}
                      onChange={e => setForm({ ...form, moneda: e.target.value })}>
                      <option value="COP">COP — Peso colombiano</option>
                      <option value="USD">USD — Dólar</option>
                      <option value="EUR">EUR — Euro</option>
                    </select>
                  </div>
                  {/* Equipo (opcional) */}
                  <div className="form-group">
                    <label className="form-label">Equipo (opcional)</label>
                    <select value={form.equipo_id}
                      onChange={e => setForm({ ...form, equipo_id: e.target.value })}>
                      <option value="">Sin equipo (servicio independiente)</option>
                      {equipos.map(eq => (
                        <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {/* Fecha emisión */}
                  <div className="form-group">
                    <label className="form-label">Fecha emisión *</label>
                    <input type="date" value={form.fecha_emision}
                      onChange={e => setForm({ ...form, fecha_emision: e.target.value })}
                      required />
                  </div>
                  {/* Fecha vencimiento */}
                  <div className="form-group">
                    <label className="form-label">Fecha vencimiento</label>
                    <input type="date" value={form.fecha_vencimiento}
                      onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} />
                  </div>
                </div>

                {/* Período (solo para servicios recurrentes) */}
                {(form.tipo === "SERVICIO_MENSUAL" || form.tipo === "SERVICIO_ANUAL") && (
                  <div className="form-grid" style={{ marginTop:0 }}>
                    <div className="form-group">
                      <label className="form-label">Mes del período</label>
                      <select value={form.periodo_mes}
                        onChange={e => setForm({ ...form, periodo_mes: e.target.value })}>
                        <option value="">— Seleccionar —</option>
                        {MESES.slice(1).map((m, i) => (
                          <option key={i+1} value={i+1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Año del período</label>
                      <select value={form.periodo_anio}
                        onChange={e => setForm({ ...form, periodo_anio: e.target.value })}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* PDF */}
                <div className="form-group">
                  <label className="form-label">
                    Factura PDF {form.tipo !== "COMPRA" ? "(opcional)" : ""}
                  </label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setFile(e.target.files[0])}
                    style={{ padding:"0.35rem" }} />
                  <span style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                    PDF o imagen. Máx 20 MB.
                  </span>
                </div>

                {/* Notas */}
                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <textarea rows={2} value={form.notas}
                    onChange={e => setForm({ ...form, notas: e.target.value })}
                    placeholder="Observaciones adicionales..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost"
                  onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : editing ? "Guardar cambios" : "Registrar factura"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

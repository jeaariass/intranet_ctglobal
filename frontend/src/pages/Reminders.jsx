// frontend/src/pages/Reminders.jsx
// Gestión de recordatorios programables enviados por WhatsApp.

import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Bell, Plus, Filter, Pause, Play, Trash2, Send, History,
  AlertTriangle, CheckCircle2, Clock, Repeat, CalendarDays, User as UserIcon,
} from "lucide-react";

const TIPOS = [
  { value: "PAGO",      label: "Pago",      icon: "💵" },
  { value: "ENTREGA",   label: "Entrega",   icon: "📦" },
  { value: "DOCUMENTO", label: "Documento", icon: "📄" },
  { value: "REUNION",   label: "Reunión",   icon: "🤝" },
  { value: "GENERAL",   label: "General",   icon: "🔔" },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.value, t.label]));
const TIPO_ICON  = Object.fromEntries(TIPOS.map(t => [t.value, t.icon]));

const FRECS = [
  { value: "UNICA",       label: "Una sola vez" },
  { value: "DIARIA",      label: "Diaria" },
  { value: "SEMANAL",     label: "Semanal" },
  { value: "MENSUAL",     label: "Mensual" },
  { value: "CADA_N_DIAS", label: "Cada N días" },
];
const FREC_LABEL = Object.fromEntries(FRECS.map(f => [f.value, f.label]));

const DIAS_SEMANA = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

const emptyForm = {
  titulo: "", mensaje: "", tipo: "GENERAL",
  destinatario_id: "", telefono_manual: "",
  frecuencia: "UNICA",
  intervalo_dias: 7, dia_semana: 1, dia_mes: 1,
  hora: "09:00",
  fecha_inicio: new Date().toISOString().split("T")[0],
  fecha_caducidad: "",
};

function describirFrecuencia(r) {
  switch (r.frecuencia) {
    case "UNICA":       return `Una vez · ${format(new Date(r.fecha_inicio), "d MMM yyyy", { locale: es })} ${r.hora}`;
    case "DIARIA":      return `Diario a las ${r.hora}`;
    case "SEMANAL":     return `Cada ${DIAS_SEMANA[r.dia_semana ?? 1]?.label} a las ${r.hora}`;
    case "MENSUAL":     return `Día ${r.dia_mes} de cada mes a las ${r.hora}`;
    case "CADA_N_DIAS": return `Cada ${r.intervalo_dias} días a las ${r.hora}`;
    default:            return r.frecuencia;
  }
}

export default function Reminders() {
  const { user } = useAuth();
  const canEdit = ["ADMIN", "EDITOR"].includes(user?.rol);

  const [items, setItems]         = useState([]);
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState({ tipo: "", activo: "true", q: "" });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [logsModal, setLogsModal] = useState(null);
  const [logs, setLogs]           = useState([]);

  const load = async () => {
    const params = new URLSearchParams();
    if (filter.tipo)   params.set("tipo",   filter.tipo);
    if (filter.activo) params.set("activo", filter.activo);
    if (filter.q)      params.set("q",      filter.q);
    const [r, u] = await Promise.all([
      api.get(`/reminders?${params}`),
      api.get("/users"),
    ]);
    setItems(r.data);
    setUsers(u.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter.tipo, filter.activo]);

  const filtered = useMemo(() => {
    if (!filter.q) return items;
    const q = filter.q.toLowerCase();
    return items.filter(r =>
      r.titulo.toLowerCase().includes(q) ||
      r.mensaje.toLowerCase().includes(q)
    );
  }, [items, filter.q]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditing(r.id);
    setForm({
      titulo:          r.titulo,
      mensaje:         r.mensaje,
      tipo:            r.tipo,
      destinatario_id: r.destinatario_id || "",
      telefono_manual: r.telefono_manual || "",
      frecuencia:      r.frecuencia,
      intervalo_dias:  r.intervalo_dias || 7,
      dia_semana:      r.dia_semana ?? 1,
      dia_mes:         r.dia_mes || 1,
      hora:            r.hora || "09:00",
      fecha_inicio:    r.fecha_inicio?.split("T")[0] || "",
      fecha_caducidad: r.fecha_caducidad?.split("T")[0] || "",
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const payload = { ...form };
      if (!payload.destinatario_id) payload.destinatario_id = null;
      else payload.destinatario_id = +payload.destinatario_id;
      if (!payload.fecha_caducidad) payload.fecha_caducidad = null;

      if (editing) await api.put(`/reminders/${editing}`, payload);
      else         await api.post("/reminders", payload);
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  };

  const handleTogglePause = async (id) => {
    await api.patch(`/reminders/${id}/toggle-pause`);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Desactivar este recordatorio? Conservará el historial pero no se enviará más.")) return;
    await api.delete(`/reminders/${id}`);
    load();
  };

  const handleTest = async (id) => {
    if (!confirm("Enviar AHORA un mensaje de prueba al destinatario? No afecta el ciclo programado.")) return;
    try {
      const res = await api.post(`/reminders/${id}/test`);
      alert(res.data.log?.exito ? "✅ Enviado correctamente" : `❌ Error: ${res.data.log?.error || "desconocido"}`);
      load();
    } catch (err) {
      alert(`Error: ${err.response?.data?.error || err.message}`);
    }
  };

  const openLogs = async (r) => {
    setLogsModal(r);
    const res = await api.get(`/reminders/${r.id}/logs`);
    setLogs(res.data);
  };

  const userOpts = users
    .filter(u => u.telefono_whatsapp)  // solo usuarios con WhatsApp configurado
    .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Bell size={18} /> Recordatorios
          </h1>
          <p>Mensajes programados de WhatsApp para el equipo (pagos, entregas, documentos)</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Nuevo recordatorio
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
        {[
          { val: items.filter(r => r.activo && !r.pausado).length, label: "Activos",   color: "green",  icon: <CheckCircle2 size={17} /> },
          { val: items.filter(r => r.pausado).length,              label: "Pausados",  color: "yellow", icon: <Pause size={17} /> },
          { val: items.filter(r => !r.activo).length,              label: "Inactivos", color: "red",    icon: <AlertTriangle size={17} /> },
          { val: items.reduce((a, r) => a + (r._count?.logs || 0), 0), label: "Envíos totales", color: "blue", icon: <Send size={17} /> },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon ${s.color}`}>{s.icon}</div>
            <div>
              <div className="stat-value">{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <Filter size={15} color="var(--text-muted)" />
        <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
          <span className="search-box-icon">🔍</span>
          <input placeholder="Buscar por título o mensaje..." value={filter.q}
            onChange={e => setFilter({ ...filter, q: e.target.value })} />
        </div>
        <select style={{ width: 160 }} value={filter.tipo}
          onChange={e => setFilter({ ...filter, tipo: e.target.value })}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>
        <select style={{ width: 140 }} value={filter.activo}
          onChange={e => setFilter({ ...filter, activo: e.target.value })}>
          <option value="">Todos</option>
          <option value="true">Solo activos</option>
          <option value="false">Solo inactivos</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Bell size={40} strokeWidth={1} color="#e2e8f0" /></div>
          <h3>Sin recordatorios</h3>
          <p>Crea el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Recordatorio</th>
                  <th>Destinatario</th>
                  <th>Frecuencia</th>
                  <th>Próximo envío</th>
                  <th>Estado</th>
                  <th>Envíos</th>
                  {canEdit && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const estadoBadge =
                    !r.activo ? { txt: "Inactivo",  cls: "badge-gray" } :
                    r.pausado ? { txt: "Pausado",   cls: "badge-yellow" } :
                                { txt: "Activo",    cls: "badge-green" };
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                          <span style={{ fontSize: "1.1rem" }}>{TIPO_ICON[r.tipo]}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{r.titulo}</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                              {TIPO_LABEL[r.tipo]} · creado por {r.creado_por?.nombre || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {r.destinatario
                          ? <>
                              <div style={{ fontWeight: 600 }}>{r.destinatario.nombre} {r.destinatario.apellido}</div>
                              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{r.destinatario.telefono_whatsapp || "sin WhatsApp"}</div>
                            </>
                          : <span style={{ fontFamily: "monospace" }}>{r.telefono_manual}</span>}
                      </td>
                      <td style={{ fontSize: "0.78rem" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <Repeat size={11} /> {describirFrecuencia(r)}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                        {r.activo && !r.pausado
                          ? format(new Date(r.proximo_envio), "d MMM yyyy, HH:mm", { locale: es })
                          : "—"}
                      </td>
                      <td>
                        <span className={`badge ${estadoBadge.cls}`}>{estadoBadge.txt}</span>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{r._count?.logs ?? 0}</td>
                      {canEdit && (
                        <td>
                          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                            <button className="btn btn-ghost btn-sm" title="Ver historial"
                              onClick={() => openLogs(r)}>
                              <History size={13} />
                            </button>
                            <button className="btn btn-ghost btn-sm" title="Enviar prueba ahora"
                              onClick={() => handleTest(r.id)}>
                              <Send size={13} />
                            </button>
                            {r.activo && (
                              <button className="btn btn-ghost btn-sm" title={r.pausado ? "Reanudar" : "Pausar"}
                                onClick={() => handleTogglePause(r.id)}>
                                {r.pausado ? <Play size={13} /> : <Pause size={13} />}
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                              Editar
                            </button>
                            {r.activo && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>
                                <Trash2 size={13} />
                              </button>
                            )}
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

      {/* Modal crear/editar */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Bell size={16} /> {editing ? "Editar recordatorio" : "Nuevo recordatorio"}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}

                {/* Identificación */}
                <div className="form-group">
                  <label className="form-label">Título *</label>
                  <input value={form.titulo} required maxLength={120}
                    onChange={e => setForm({ ...form, titulo: e.target.value })}
                    placeholder="Ej: Recordar pagar factura Hosdite" />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select value={form.tipo}
                      onChange={e => setForm({ ...form, tipo: e.target.value })}>
                      {TIPOS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hora del día (Bogotá)</label>
                    <input type="time" value={form.hora}
                      onChange={e => setForm({ ...form, hora: e.target.value })} />
                  </div>
                </div>

                {/* Destinatario */}
                <div style={{ background: "var(--primary-50)", border: "1px solid var(--primary-100)",
                  borderRadius: "var(--radius-sm)", padding: "0.75rem 1rem", marginBottom: "0.875rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--primary)",
                    marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <UserIcon size={13} /> Destinatario
                  </div>
                  <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                    <label className="form-label">Usuario interno (recomendado)</label>
                    <select value={form.destinatario_id}
                      onChange={e => setForm({ ...form, destinatario_id: e.target.value })}>
                      <option value="">— Sin usuario interno —</option>
                      {userOpts.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.nombre} {u.apellido} ({u.telefono_whatsapp})
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Solo aparecen usuarios con WhatsApp configurado en su perfil.
                    </span>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">o teléfono manual</label>
                    <input value={form.telefono_manual}
                      onChange={e => setForm({ ...form, telefono_manual: e.target.value })}
                      placeholder="+573001234567" />
                  </div>
                </div>

                {/* Frecuencia */}
                <div className="form-group">
                  <label className="form-label">Frecuencia *</label>
                  <select value={form.frecuencia}
                    onChange={e => setForm({ ...form, frecuencia: e.target.value })}>
                    {FRECS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>

                {/* Campos condicionales según frecuencia */}
                {form.frecuencia === "SEMANAL" && (
                  <div className="form-group">
                    <label className="form-label">Día de la semana *</label>
                    <select value={form.dia_semana}
                      onChange={e => setForm({ ...form, dia_semana: +e.target.value })}>
                      {DIAS_SEMANA.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                )}
                {form.frecuencia === "MENSUAL" && (
                  <div className="form-group">
                    <label className="form-label">Día del mes (1-31) *</label>
                    <input type="number" min={1} max={31}
                      value={form.dia_mes}
                      onChange={e => setForm({ ...form, dia_mes: +e.target.value })} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Si el mes no tiene ese día (ej. 31 en febrero), se enviará el último día del mes.
                    </span>
                  </div>
                )}
                {form.frecuencia === "CADA_N_DIAS" && (
                  <div className="form-group">
                    <label className="form-label">Cada cuántos días *</label>
                    <input type="number" min={1} max={365}
                      value={form.intervalo_dias}
                      onChange={e => setForm({ ...form, intervalo_dias: +e.target.value })} />
                  </div>
                )}

                {/* Fechas */}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Fecha de inicio *</label>
                    <input type="date" required value={form.fecha_inicio}
                      onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de caducidad (opcional)</label>
                    <input type="date" value={form.fecha_caducidad}
                      onChange={e => setForm({ ...form, fecha_caducidad: e.target.value })} />
                  </div>
                </div>

                {/* Mensaje */}
                <div className="form-group">
                  <label className="form-label">Mensaje WhatsApp *</label>
                  <textarea rows={5} maxLength={4000} required
                    value={form.mensaje}
                    onChange={e => setForm({ ...form, mensaje: e.target.value })}
                    placeholder="Ej: Hola, recuerda pagar la factura de Hosdite que vence hoy 🧾" />
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    Soporta emojis y formato *negrita* / _cursiva_ de WhatsApp. Máx 4000 chars.
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear recordatorio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal logs */}
      {logsModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setLogsModal(null)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <History size={16} /> Historial — {logsModal.titulo}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setLogsModal(null)}>✕</button>
            </div>
            <div className="card-body" style={{ padding: 0, maxHeight: "65vh", overflowY: "auto" }}>
              {logs.length === 0 ? (
                <div className="empty-state" style={{ padding: "2rem" }}>
                  <div className="empty-state-icon"><Clock size={32} strokeWidth={1} color="#e2e8f0" /></div>
                  <h3>Sin envíos registrados aún</h3>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Teléfono</th><th>Estado</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontSize: "0.82rem" }}>
                          {format(new Date(l.enviado_at), "d MMM yyyy, HH:mm:ss", { locale: es })}
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: "0.78rem" }}>{l.destinatario_snapshot || "—"}</td>
                        <td>
                          <span className={`badge ${l.exito ? "badge-green" : "badge-red"}`}>
                            {l.exito ? "✓ Enviado" : "✗ Falló"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.78rem", color: "var(--danger)" }}>{l.error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

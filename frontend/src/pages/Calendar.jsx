// frontend/src/pages/Calendar.jsx
import { useEffect, useMemo, useState } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isValid,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Bell, Mail, MessageCircle, Pencil, X, Plus } from "lucide-react";

const TIPOS_EVENTO = ["REUNION","CAPACITACION","FESTIVO","ENTREGA","VENCIMIENTO","LICITACION","OTRO"];
const TIPO_COLORS  = {
  REUNION:"badge-blue", CAPACITACION:"badge-green",
  FESTIVO:"badge-yellow", ENTREGA:"badge-green",
  VENCIMIENTO:"badge-red", LICITACION:"badge-purple", OTRO:"badge-gray",
};

// Antelaciones predefinidas (minutos antes del evento)
const OFFSETS = [
  { min: 10080, label: "1 semana antes" },
  { min: 4320,  label: "3 días antes" },
  { min: 2880,  label: "2 días antes" },
  { min: 1440,  label: "1 día antes" },
  { min: 30,    label: "30 minutos antes" },
];
const UNIDADES = { minutos: 1, horas: 60, días: 1440 };

function etiquetaOffset(min) {
  const pre = OFFSETS.find(o => o.min === min);
  if (pre) return pre.label;
  if (min % 1440 === 0) return `${min / 1440} día${min / 1440 === 1 ? "" : "s"} antes`;
  if (min % 60 === 0)   return `${min / 60} hora${min / 60 === 1 ? "" : "s"} antes`;
  return `${min} minuto${min === 1 ? "" : "s"} antes`;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isValid(d) ? d : null;
}
const toInput = (iso) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

const emptyForm = {
  id: null, titulo: "", descripcion: "", fecha_inicio: "", fecha_fin: "", tipo: "REUNION",
  destinatarios: [], canalEmail: true, canalWhatsapp: true, offsets: [1440],
};

export default function Calendar() {
  const { user } = useAuth();
  const [events, setEvents]           = useState([]);
  const [users, setUsers]             = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [modal, setModal]             = useState(null); // "create" | "edit"
  const [form, setForm]               = useState(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [userSearch, setUserSearch]   = useState("");
  const [custom, setCustom]           = useState({ val: "", unit: "días" });

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const load = () => api.get("/events").then(r => setEvents(r.data));
  useEffect(() => { load(); api.get("/users").then(r => setUsers(r.data)).catch(() => {}); }, []);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate), end: endOfMonth(currentDate),
  });
  const firstDayOfWeek = (getDay(startOfMonth(currentDate)) + 6) % 7;
  const paddingDays    = Array(firstDayOfWeek).fill(null);

  const eventsForDay = (day) =>
    events.filter(e => { const d = parseDate(e.fecha_inicio); return d && isSameDay(d, day); });

  const openCreate = (day) => {
    setForm({
      ...emptyForm,
      destinatarios: user?.id ? [user.id] : [],
      fecha_inicio: day ? `${format(day, "yyyy-MM-dd")}T09:00` : "",
    });
    setCustom({ val: "", unit: "días" });
    setModal("create");
  };

  const openEdit = (ev) => {
    const r = ev.recordatorio;
    setForm({
      id: ev.id,
      titulo: ev.titulo || "",
      descripcion: ev.descripcion || "",
      fecha_inicio: toInput(ev.fecha_inicio),
      fecha_fin: toInput(ev.fecha_fin),
      tipo: ev.tipo || "REUNION",
      destinatarios: r?.destinatarios || [],
      canalEmail: r ? r.canalEmail : true,
      canalWhatsapp: r ? r.canalWhatsapp : true,
      offsets: r?.offsets?.length ? r.offsets : [1440],
    });
    setCustom({ val: "", unit: "días" });
    setModal("edit");
  };

  const closeModal = () => { setModal(null); setForm(emptyForm); setUserSearch(""); };

  const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const addCustomOffset = () => {
    const n = Math.round(Number(custom.val) * (UNIDADES[custom.unit] || 1));
    if (!Number.isFinite(n) || n <= 0) return;
    setForm(f => ({ ...f, offsets: f.offsets.includes(n) ? f.offsets : [...f.offsets, n].sort((a,b) => b-a) }));
    setCustom({ val: "", unit: custom.unit });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        titulo: form.titulo,
        descripcion: form.descripcion,
        fechaInicio: form.fecha_inicio,
        fechaFin: form.fecha_fin || null,
        tipo: form.tipo,
        recordatorio: {
          destinatarios: form.destinatarios,
          canalEmail: form.canalEmail,
          canalWhatsapp: form.canalWhatsapp,
          offsets: form.offsets,
        },
      };
      if (modal === "edit") await api.put(`/events/${form.id}`, payload);
      else await api.post("/events", payload);
      closeModal();
      load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este evento?")) return;
    await api.delete(`/events/${id}`);
    load();
  };

  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : [];
  const usuariosFiltrados = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(q));
  }, [users, userSearch]);
  const nombreUser = (id) => {
    const u = users.find(x => x.id === id);
    return u ? `${u.nombre} ${u.apellido}` : `#${id}`;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Calendario corporativo</h1>
          <p>Eventos, entregas y fechas importantes de CTGlobal</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => openCreate(selectedDay)}>
            + Nuevo evento
          </button>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:"1.5rem" }}
        className="calendar-page-grid">

        {/* Calendario */}
        <div className="card">
          <div className="card-header">
            <button className="btn btn-ghost btn-sm"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1))}>←</button>
            <h2 style={{ textTransform:"capitalize" }}>
              {format(currentDate, "MMMM yyyy", { locale:es })}
            </h2>
            <button className="btn btn-ghost btn-sm"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1))}>→</button>
          </div>
          <div className="card-body">
            <div className="calendar-grid" style={{ marginBottom:"0.5rem" }}>
              {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
                <div key={d} className="calendar-day-name">{d}</div>
              ))}
            </div>
            <div className="calendar-grid">
              {paddingDays.map((_, i) => <div key={`pad-${i}`} />)}
              {daysInMonth.map(day => {
                const dayEvents = eventsForDay(day);
                const isToday    = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <div key={day.toISOString()}
                    className={`calendar-day ${isToday ? "today" : ""} ${dayEvents.length && !isToday ? "has-event" : ""}`}
                    style={{ cursor:"pointer",
                      border: isSelected && !isToday ? "2px solid var(--primary)" : "2px solid transparent",
                      position:"relative" }}
                    onClick={() => setSelectedDay(isSameDay(day, selectedDay) ? null : day)}>
                    {format(day, "d")}
                    {dayEvents.length > 0 && (
                      <div style={{ position:"absolute", bottom:2, right:2, width:5, height:5,
                        borderRadius:"50%", background: isToday ? "#fff" : "var(--accent)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel lateral */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {selectedDay && (
            <div className="card">
              <div className="card-header" style={{ justifyContent:"space-between", display:"flex", alignItems:"center" }}>
                <h2 style={{ textTransform:"capitalize", fontSize:"0.875rem" }}>
                  {format(selectedDay, "EEEE d 'de' MMMM", { locale:es })}
                </h2>
                {canEdit && (
                  <button className="btn btn-ghost btn-sm" onClick={() => openCreate(selectedDay)}>
                    <Plus size={13} />
                  </button>
                )}
              </div>
              <div className="card-body" style={{ padding:"0.75rem" }}>
                {selectedEvents.length === 0 ? (
                  <div style={{ color:"var(--text-muted)", fontSize:"0.82rem", textAlign:"center", padding:"1rem 0" }}>
                    Sin eventos este día
                  </div>
                ) : selectedEvents.map(ev => (
                  <div key={ev.id}
                    style={{ borderLeft:"3px solid var(--primary)", paddingLeft:"0.75rem", marginBottom:"0.75rem" }}>
                    <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{ev.titulo}</div>
                    <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                      {format(new Date(ev.fecha_inicio), "HH:mm")} h
                    </div>
                    {ev.descripcion && (
                      <div style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>{ev.descripcion}</div>
                    )}
                    <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", marginTop:"0.35rem", flexWrap:"wrap" }}>
                      <span className={`badge ${TIPO_COLORS[ev.tipo]}`}
                        style={{ textTransform:"capitalize", fontSize:"0.65rem" }}>{ev.tipo?.toLowerCase()}</span>
                      {ev.recordatorio && (ev.recordatorio.canalEmail || ev.recordatorio.canalWhatsapp) && (
                        <span className="badge badge-gray" style={{ fontSize:"0.6rem", display:"inline-flex", gap:3, alignItems:"center" }}>
                          <Bell size={10} /> {ev.recordatorio.offsets?.length || 0}
                        </span>
                      )}
                      {canEdit && (
                        <>
                          <button className="btn btn-ghost btn-sm" style={{ padding:"0.1rem 0.35rem" }}
                            onClick={() => openEdit(ev)}><Pencil size={12} /></button>
                          <button className="btn btn-danger btn-sm" style={{ padding:"0.1rem 0.4rem" }}
                            onClick={() => handleDelete(ev.id)}>✕</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><h2>Próximos eventos</h2></div>
            <div className="card-body" style={{ padding:"0.5rem 0" }}>
              {events.length === 0 ? (
                <div style={{ color:"var(--text-muted)", fontSize:"0.82rem", textAlign:"center", padding:"1rem 0" }}>
                  Sin eventos
                </div>
              ) : (
                events.filter(e => parseDate(e.fecha_inicio) >= new Date(Date.now() - 864e5)).slice(0, 8).map(ev => {
                  const d = parseDate(ev.fecha_inicio);
                  if (!d) return null;
                  return (
                    <div key={ev.id}
                      style={{ display:"flex", gap:"0.75rem", alignItems:"flex-start",
                        padding:"0.5rem 0.75rem", borderBottom:"1px solid var(--border)", cursor: canEdit ? "pointer" : "default" }}
                      onClick={() => canEdit && openEdit(ev)}>
                      <div style={{ background:"var(--primary)", color:"#fff", borderRadius:6, padding:"0.25rem 0.4rem",
                        fontSize:"0.7rem", fontWeight:700, textAlign:"center", minWidth:36, flexShrink:0 }}>
                        <div style={{ fontSize:"1rem" }}>{format(d, "d")}</div>
                        <div style={{ opacity:0.7, textTransform:"uppercase" }}>{format(d, "MMM", { locale:es })}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:"0.82rem" }}>{ev.titulo}</div>
                        <div style={{ fontSize:"0.68rem", color:"var(--text-muted)" }}>
                          {format(d, "d MMM, HH:mm", { locale:es })} h
                        </div>
                        <span className={`badge ${TIPO_COLORS[ev.tipo]}`}
                          style={{ fontSize:"0.63rem", marginTop:"0.2rem", textTransform:"capitalize" }}>
                          {ev.tipo?.toLowerCase()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal crear / editar evento */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth:560 }}>
            <div className="modal-header">
              <h3>{modal === "edit" ? "Editar evento" : "Nuevo evento"}</h3>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Título *</label>
                  <input value={form.titulo} onChange={e => setForm({ ...form, titulo:e.target.value })} required />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Inicio *</label>
                    <input type="datetime-local" value={form.fecha_inicio}
                      onChange={e => setForm({ ...form, fecha_inicio:e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fin (opcional)</label>
                    <input type="datetime-local" value={form.fecha_fin}
                      onChange={e => setForm({ ...form, fecha_fin:e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo:e.target.value })}>
                    {TIPOS_EVENTO.map(t => (
                      <option key={t} value={t} style={{ textTransform:"capitalize" }}>{t.toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea rows={2} value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion:e.target.value })} />
                </div>

                {/* Recordatorios */}
                <div style={{ borderTop:"1px solid var(--border)", margin:"0.5rem 0 0.75rem", paddingTop:"0.75rem" }}>
                  <h4 style={{ display:"flex", alignItems:"center", gap:"0.4rem", fontSize:"0.8rem",
                    textTransform:"uppercase", letterSpacing:"0.04em", color:"var(--text-muted)", margin:"0 0 0.6rem" }}>
                    <Bell size={14} /> Recordatorios
                  </h4>

                  <div style={{ display:"flex", gap:"1rem", marginBottom:"0.75rem", flexWrap:"wrap" }}>
                    <label style={{ display:"flex", alignItems:"center", gap:"0.4rem", fontSize:"0.85rem", cursor:"pointer" }}>
                      <input type="checkbox" checked={form.canalEmail}
                        onChange={e => setForm({ ...form, canalEmail:e.target.checked })} />
                      <Mail size={14} /> Correo
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:"0.4rem", fontSize:"0.85rem", cursor:"pointer" }}>
                      <input type="checkbox" checked={form.canalWhatsapp}
                        onChange={e => setForm({ ...form, canalWhatsapp:e.target.checked })} />
                      <MessageCircle size={14} /> WhatsApp
                    </label>
                  </div>

                  <label className="form-label">Antelación</label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"0.4rem", marginBottom:"0.5rem" }}>
                    {OFFSETS.map(o => (
                      <label key={o.min}
                        style={{ display:"flex", alignItems:"center", gap:"0.3rem", fontSize:"0.8rem",
                          border:"1px solid var(--border)", borderRadius:6, padding:"0.25rem 0.5rem", cursor:"pointer",
                          background: form.offsets.includes(o.min) ? "var(--primary-50,#eff6ff)" : "transparent" }}>
                        <input type="checkbox" checked={form.offsets.includes(o.min)}
                          onChange={() => setForm(f => ({ ...f, offsets: toggle(f.offsets, o.min) }))} />
                        {o.label}
                      </label>
                    ))}
                  </div>

                  {/* Personalizadas ya agregadas (no predefinidas) */}
                  {form.offsets.filter(m => !OFFSETS.some(o => o.min === m)).length > 0 && (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"0.35rem", marginBottom:"0.5rem" }}>
                      {form.offsets.filter(m => !OFFSETS.some(o => o.min === m)).map(m => (
                        <span key={m} className="badge badge-blue"
                          style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}>
                          {etiquetaOffset(m)}
                          <button type="button" onClick={() => setForm(f => ({ ...f, offsets: f.offsets.filter(x => x !== m) }))}
                            style={{ background:"none", border:"none", cursor:"pointer", padding:0, color:"inherit", lineHeight:1 }}>
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display:"flex", gap:"0.35rem", alignItems:"center", marginBottom:"0.75rem" }}>
                    <span style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>Otra:</span>
                    <input type="number" min="1" value={custom.val} placeholder="Ej. 4" style={{ width:70 }}
                      onChange={e => setCustom({ ...custom, val:e.target.value })} />
                    <select value={custom.unit} onChange={e => setCustom({ ...custom, unit:e.target.value })} style={{ width:100 }}>
                      {Object.keys(UNIDADES).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button type="button" className="btn btn-outline btn-sm" onClick={addCustomOffset}>Agregar</button>
                  </div>

                  <label className="form-label">Notificar a</label>
                  {form.destinatarios.length > 0 && (
                    <div style={{ fontSize:"0.72rem", color:"var(--text-muted)", marginBottom:"0.35rem" }}>
                      {form.destinatarios.map(nombreUser).join(", ")}
                    </div>
                  )}
                  <input placeholder="Buscar usuario…" value={userSearch}
                    onChange={e => setUserSearch(e.target.value)} style={{ marginBottom:"0.35rem" }} />
                  <div style={{ maxHeight:150, overflowY:"auto", border:"1px solid var(--border)", borderRadius:6, padding:"0.35rem" }}>
                    {usuariosFiltrados.map(u => (
                      <label key={u.id}
                        style={{ display:"flex", alignItems:"center", gap:"0.5rem", fontSize:"0.82rem",
                          padding:"0.2rem 0.15rem", cursor:"pointer" }}>
                        <input type="checkbox" checked={form.destinatarios.includes(u.id)}
                          onChange={() => setForm(f => ({ ...f, destinatarios: toggle(f.destinatarios, u.id) }))} />
                        {u.nombre} {u.apellido}
                        <span style={{ color:"var(--text-muted)", fontSize:"0.72rem" }}>{u.area || u.email}</span>
                      </label>
                    ))}
                    {usuariosFiltrados.length === 0 && (
                      <div style={{ fontSize:"0.75rem", color:"var(--text-muted)", padding:"0.3rem" }}>Sin resultados</div>
                    )}
                  </div>
                  <div style={{ fontSize:"0.7rem", color:"var(--text-muted)", marginTop:"0.3rem" }}>
                    El correo y el WhatsApp se toman del perfil de cada usuario.
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : modal === "edit" ? "Guardar cambios" : "Crear evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

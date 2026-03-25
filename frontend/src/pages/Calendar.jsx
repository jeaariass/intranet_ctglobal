// frontend/src/pages/Calendar.jsx
import { useEffect, useState } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, parseISO, isValid
} from "date-fns";
import { es } from "date-fns/locale";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

const TIPOS_EVENTO = ["REUNION","CAPACITACION","FESTIVO","ENTREGA","VENCIMIENTO","LICITACION","OTRO"];
const TIPO_COLORS  = {
  REUNION:"badge-blue", CAPACITACION:"badge-green",
  FESTIVO:"badge-yellow", ENTREGA:"badge-green",
  VENCIMIENTO:"badge-red", LICITACION:"badge-purple", OTRO:"badge-gray",
};

// Parsear fechas que vienen como TIMESTAMPTZ o como DATE string
function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isValid(d) ? d : null;
}

export default function Calendar() {
  const { user } = useAuth();
  const [events, setEvents]         = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm] = useState({
    titulo:"", descripcion:"", fecha_inicio:"", fecha_fin:"", tipo:"REUNION",
  });
  const [saving, setSaving]   = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  const canEdit = ["ADMIN","EDITOR"].includes(user?.rol);

  const load = () => {
    api.get("/events").then(r => setEvents(r.data));
  };

  useEffect(() => { load(); }, []);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end:   endOfMonth(currentDate),
  });

  // Lunes primero
  const firstDayOfWeek = (getDay(startOfMonth(currentDate)) + 6) % 7;
  const paddingDays    = Array(firstDayOfWeek).fill(null);

  const eventsForDay = (day) =>
    events.filter(e => {
      const d = parseDate(e.fecha_inicio);
      return d && isSameDay(d, day);
    });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/events", form);
      setShowModal(false);
      setForm({ titulo:"", descripcion:"", fecha_inicio:"", fecha_fin:"", tipo:"REUNION" });
      load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este evento?")) return;
    await api.delete(`/events/${id}`);
    load();
  };

  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Calendario corporativo</h1>
          <p>Eventos, entregas y fechas importantes de CTGlobal</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
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
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1))}>
              ←
            </button>
            <h2 style={{ textTransform:"capitalize" }}>
              {format(currentDate, "MMMM yyyy", { locale:es })}
            </h2>
            <button className="btn btn-ghost btn-sm"
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1))}>
              →
            </button>
          </div>
          <div className="card-body">
            {/* Días de la semana */}
            <div className="calendar-grid" style={{ marginBottom:"0.5rem" }}>
              {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
                <div key={d} className="calendar-day-name">{d}</div>
              ))}
            </div>
            {/* Días del mes */}
            <div className="calendar-grid">
              {paddingDays.map((_, i) => <div key={`pad-${i}`} />)}
              {daysInMonth.map(day => {
                const dayEvents = eventsForDay(day);
                const isToday    = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <div key={day.toISOString()}
                    className={`calendar-day ${isToday ? "today" : ""} ${dayEvents.length && !isToday ? "has-event" : ""}`}
                    style={{
                      cursor:"pointer",
                      border: isSelected && !isToday ? "2px solid var(--primary)" : "2px solid transparent",
                      position:"relative",
                    }}
                    onClick={() => setSelectedDay(isSameDay(day, selectedDay) ? null : day)}>
                    {format(day, "d")}
                    {dayEvents.length > 0 && (
                      <div style={{ position:"absolute", bottom:2, right:2,
                        width:5, height:5, borderRadius:"50%",
                        background: isToday ? "#fff" : "var(--accent)" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel lateral */}
        <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
          {/* Día seleccionado */}
          {selectedDay && (
            <div className="card">
              <div className="card-header">
                <h2 style={{ textTransform:"capitalize", fontSize:"0.875rem" }}>
                  {format(selectedDay, "EEEE d 'de' MMMM", { locale:es })}
                </h2>
              </div>
              <div className="card-body" style={{ padding:"0.75rem" }}>
                {selectedEvents.length === 0 ? (
                  <div style={{ color:"var(--text-muted)", fontSize:"0.82rem",
                    textAlign:"center", padding:"1rem 0" }}>
                    Sin eventos este día
                  </div>
                ) : selectedEvents.map(ev => (
                  <div key={ev.id}
                    style={{ borderLeft:"3px solid var(--primary)", paddingLeft:"0.75rem",
                      marginBottom:"0.75rem" }}>
                    <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{ev.titulo}</div>
                    {ev.descripcion && (
                      <div style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
                        {ev.descripcion}
                      </div>
                    )}
                    <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginTop:"0.3rem" }}>
                      <span className={`badge ${TIPO_COLORS[ev.tipo]}`}
                        style={{ textTransform:"capitalize", fontSize:"0.65rem" }}>
                        {ev.tipo?.toLowerCase()}
                      </span>
                      {canEdit && (
                        <button className="btn btn-danger btn-sm"
                          style={{ padding:"0.1rem 0.4rem" }}
                          onClick={() => handleDelete(ev.id)}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Próximos eventos */}
          <div className="card">
            <div className="card-header"><h2>Próximos eventos</h2></div>
            <div className="card-body" style={{ padding:"0.5rem 0" }}>
              {events.length === 0 ? (
                <div style={{ color:"var(--text-muted)", fontSize:"0.82rem",
                  textAlign:"center", padding:"1rem 0" }}>
                  Sin eventos
                </div>
              ) : (
                events.slice(0, 8).map(ev => {
                  const d = parseDate(ev.fecha_inicio);
                  if (!d) return null;
                  return (
                    <div key={ev.id}
                      style={{ display:"flex", gap:"0.75rem", alignItems:"flex-start",
                        padding:"0.5rem 0.75rem", borderBottom:"1px solid var(--border)" }}>
                      <div style={{ background:"var(--primary)", color:"#fff",
                        borderRadius:6, padding:"0.25rem 0.4rem",
                        fontSize:"0.7rem", fontWeight:700, textAlign:"center",
                        minWidth:36, flexShrink:0 }}>
                        <div style={{ fontSize:"1rem" }}>{format(d, "d")}</div>
                        <div style={{ opacity:0.7, textTransform:"uppercase" }}>
                          {format(d, "MMM", { locale:es })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:"0.82rem" }}>{ev.titulo}</div>
                        <span className={`badge ${TIPO_COLORS[ev.tipo]}`}
                          style={{ fontSize:"0.63rem", marginTop:"0.2rem",
                            textTransform:"capitalize" }}>
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

      {/* Modal nuevo evento */}
      {showModal && (
        <div className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Nuevo evento</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Título *</label>
                  <input value={form.titulo}
                    onChange={e => setForm({...form, titulo:e.target.value})} required />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Fecha inicio *</label>
                    <input type="date" value={form.fecha_inicio}
                      onChange={e => setForm({...form, fecha_inicio:e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha fin (opcional)</label>
                    <input type="date" value={form.fecha_fin}
                      onChange={e => setForm({...form, fecha_fin:e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select value={form.tipo}
                    onChange={e => setForm({...form, tipo:e.target.value})}>
                    {TIPOS_EVENTO.map(t => (
                      <option key={t} value={t} style={{ textTransform:"capitalize" }}>
                        {t.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <textarea rows={2} value={form.descripcion}
                    onChange={e => setForm({...form, descripcion:e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost"
                  onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Crear evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

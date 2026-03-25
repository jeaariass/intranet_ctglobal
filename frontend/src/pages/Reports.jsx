import { useEffect, useState } from "react";
import api from "../services/api";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Reports() {
  const [dashboard, setDashboard] = useState(null);
  const [overview, setOverview] = useState([]);
  const [equipment, setEquipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("general");

  useEffect(() => {
    Promise.all([
      api.get("/reports/dashboard"),
      api.get("/reports/overview"),
      api.get("/reports/equipment"),
    ]).then(([d, o, e]) => {
      setDashboard(d.data);
      setOverview(o.data);
      setEquipment(e.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Reportes</h1>
          <p>Vista ejecutiva de proyectos, geovisores y recursos</p>
        </div>
        <div style={{ fontSize:"0.8rem", color:"var(--text-muted)" }}>
          Actualizado: {format(new Date(), "d MMM yyyy HH:mm", { locale:es })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:"0.25rem", marginBottom:"1.5rem",
        borderBottom:"1px solid var(--border)" }}>
        {[["general","📊 General"],["geovisores","🗺️ Geovisores"],["equipos","🖥️ Equipos"]].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding:"0.65rem 1.25rem", background:"none", border:"none", cursor:"pointer",
              fontWeight: tab===key ? 700 : 400,
              color: tab===key ? "var(--primary)" : "var(--text-muted)",
              borderBottom: tab===key ? "2px solid var(--primary)" : "2px solid transparent",
              fontSize:"0.9rem" }}>
            {label}
          </button>
        ))}
      </div>

      {/* TAB: General */}
      {tab === "general" && dashboard && (
        <>
          {/* Stats globales */}
          <div className="stats-grid" style={{ marginBottom:"2rem" }}>
            {[
              { icon:"👥", val:dashboard.stats.totalUsers, label:"Colaboradores", color:"blue" },
              { icon:"🗺️", val:dashboard.stats.activeProjects, label:"Proyectos activos", color:"green" },
              { icon:"📁", val:dashboard.stats.totalDocs, label:"Documentos", color:"yellow" },
              { icon:"🖥️", val:dashboard.stats.availableEquipment, label:"Equipos disponibles", color:"blue" },
            ].map(({ icon, val, label, color }) => (
              <div key={label} className="stat-card">
                <div className={`stat-icon ${color}`}>{icon}</div>
                <div>
                  <div className="stat-value">{val}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-grid">
            {/* Sesiones activas ahora */}
            <div className="card">
              <div className="card-header">
                <h2>🟢 Usuarios conectados ahora</h2>
                <span className="badge badge-green">
                  {dashboard.stats.activeSessionsCount} en línea
                </span>
              </div>
              <div className="card-body" style={{ padding:0 }}>
                {dashboard.recentSessions.length === 0 ? (
                  <div className="empty-state" style={{ padding:"2rem" }}>
                    <div className="empty-state-icon">😴</div>
                    <h3>Nadie conectado ahora mismo</h3>
                  </div>
                ) : (
                  <table>
                    <tbody>
                      {dashboard.recentSessions.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ fontWeight:600, fontSize:"0.9rem" }}>
                              {s.projectUser?.nombre}
                            </div>
                            <div style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>
                              Desde {format(new Date(s.started_at), "HH:mm", { locale:es })}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-blue">{s.proyecto?.codigo}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Eventos próximos */}
            <div className="card">
              <div className="card-header"><h2>📅 Próximos 30 días</h2></div>
              <div className="card-body" style={{ padding:0 }}>
                {dashboard.upcomingEvents.length === 0 && dashboard.expiringProjects.length === 0 ? (
                  <div className="empty-state" style={{ padding:"2rem" }}>
                    <div className="empty-state-icon">✅</div>
                    <h3>Sin eventos urgentes</h3>
                  </div>
                ) : (
                  <table>
                    <tbody>
                      {dashboard.expiringProjects.map(p => (
                        <tr key={`p-${p.id}`}>
                          <td>
                            <div style={{ fontWeight:600, fontSize:"0.85rem", color:"var(--danger)" }}>
                              ⚠️ Contrato vence: {p.nombre}
                            </div>
                            <div style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>
                              {format(new Date(p.fecha_fin), "d MMM yyyy", { locale:es })}
                            </div>
                          </td>
                          <td>
                            <Link to={`/geovisores/${p.id}`} className="btn btn-outline btn-sm">Ver</Link>
                          </td>
                        </tr>
                      ))}
                      {dashboard.upcomingEvents.map(ev => (
                        <tr key={`e-${ev.id}`}>
                          <td>
                            <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{ev.titulo}</div>
                            <div style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>
                              {format(new Date(ev.fecha_inicio), "d MMM yyyy", { locale:es })}
                              {ev.proyecto && ` · ${ev.proyecto.codigo}`}
                            </div>
                          </td>
                          <td><span className="badge badge-blue" style={{ textTransform:"capitalize" }}>{ev.tipo?.toLowerCase()}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAB: Geovisores */}
      {tab === "geovisores" && (
        <div className="card">
          <div className="card-header">
            <h2>Uso de geovisores — últimos 30 días</h2>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Proyecto</th><th>Cliente</th><th>Usuarios</th>
                  <th>Sesiones 30d</th><th>Duración prom.</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {overview.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight:600 }}>{p.nombre}</div>
                      <div style={{ fontSize:"0.78rem", color:"var(--text-muted)", fontFamily:"monospace" }}>
                        {p.codigo}
                      </div>
                    </td>
                    <td style={{ fontSize:"0.85rem" }}>{p.cliente || "—"}</td>
                    <td style={{ textAlign:"center", fontWeight:700 }}>
                      {p._count?.projectUsers || 0}
                    </td>
                    <td style={{ textAlign:"center", fontWeight:700 }}>
                      {p.stats30d.sesiones30d}
                    </td>
                    <td style={{ textAlign:"center" }}>
                      {p.stats30d.avgDurMin > 0 ? `${p.stats30d.avgDurMin} min` : "—"}
                    </td>
                    <td>
                      <span className={`badge ${p.activo ? "badge-green" : "badge-gray"}`}>
                        {p.activo ? "Activo" : "Pausado"}
                      </span>
                    </td>
                    <td>
                      <Link to={`/geovisores/${p.id}`} className="btn btn-ghost btn-sm">
                        Detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Equipos */}
      {tab === "equipos" && equipment && (
        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.5rem" }}>
            <div className="card">
              <div className="card-header"><h2>Por estado</h2></div>
              <div className="card-body" style={{ padding:0 }}>
                <table>
                  <tbody>
                    {equipment.byEstado.map(row => (
                      <tr key={row.estado}>
                        <td style={{ fontWeight:600 }}>{row.estado}</td>
                        <td style={{ fontWeight:700, fontSize:"1.2rem", textAlign:"right" }}>
                          {row._count.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2>Por tipo</h2></div>
              <div className="card-body" style={{ padding:0 }}>
                <table>
                  <tbody>
                    {equipment.byTipo.map(row => (
                      <tr key={row.tipo}>
                        <td style={{ fontWeight:600 }}>{row.tipo}</td>
                        <td style={{ fontWeight:700, fontSize:"1.2rem", textAlign:"right" }}>
                          {row._count.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h2>Últimos movimientos</h2></div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Equipo</th><th>Acción</th><th>Proyecto</th><th>Por</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {equipment.recentLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontWeight:600 }}>{log.equipo?.nombre}</td>
                      <td><span className="badge badge-gray">{log.accion}</span></td>
                      <td>{log.proyecto?.codigo || "—"}</td>
                      <td style={{ fontSize:"0.85rem" }}>{log.usuario?.nombre || "—"}</td>
                      <td style={{ fontSize:"0.82rem", color:"var(--text-muted)" }}>
                        {format(new Date(log.fecha_inicio), "d MMM HH:mm", { locale:es })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

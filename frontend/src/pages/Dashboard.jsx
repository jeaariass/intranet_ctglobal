// frontend/src/pages/Dashboard.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Users, Map, FileText, Monitor, Radio,
  AlertTriangle, ChevronRight, ArrowUpRight,
  Megaphone, CalendarDays, FolderOpen, BookOpen,
  Receipt, Clock
} from "lucide-react";

export default function Dashboard() {
  const { user }  = useAuth();
  const [data, setData]           = useState(null);
  const [invoiceAlerts, setInvoiceAlerts] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/reports/dashboard"),
      api.get("/invoices/alerts"),
    ]).then(([d, inv]) => {
      setData(d.data);
      setInvoiceAlerts(inv.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 18) return "Buenas tardes";
    return "Buenas noches";
  };

  const stats = data?.stats || {};

  // Combinar alertas de equipos + facturas
  const totalAlertas = (data?.expiringProjects?.length || 0) +
                       (data?.equipmentAlerts?.length  || 0) +
                       invoiceAlerts.length;

  return (
    <>
      {/* Hero banner */}
      <div style={{
        background:"linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 50%, var(--primary-light) 100%)",
        borderRadius:"var(--radius-lg)", padding:"1.75rem 2rem",
        marginBottom:"1.75rem", color:"#fff",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:"1rem", position:"relative", overflow:"hidden",
      }}>
        <div style={{
          position:"absolute",inset:0,
          backgroundImage:"linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)",
          backgroundSize:"32px 32px", borderRadius:"inherit",
        }} />
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:"0.75rem",opacity:0.55,marginBottom:"0.35rem",
            letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:600 }}>
            {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale:es })}
          </div>
          <h1 style={{ fontSize:"1.5rem",letterSpacing:"-0.03em",marginBottom:"0.35rem" }}>
            {greeting()}, {user?.nombre}
          </h1>
          <p style={{ opacity:0.6, fontSize:"0.825rem" }}>
            Portal interno de Conexión Territorial Global
          </p>
        </div>
        <div style={{ position:"relative", zIndex:1, opacity:0.12 }}>
          <Map size={72} strokeWidth={0.75} />
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { icon:Users,    color:"blue",   val:stats.totalUsers,          label:"Colaboradores" },
          { icon:Map,      color:"green",  val:stats.activeProjects,      label:"Geovisores activos" },
          { icon:FileText, color:"yellow", val:stats.totalDocs,           label:"Documentos" },
          { icon:Monitor,  color:"purple", val:stats.availableEquipment,  label:"Equipos disponibles" },
          { icon:Radio,    color:"red",    val:stats.activeSessionsCount, label:"Usuarios en línea" },
        ].map(({ icon:Icon, color, val, label }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon ${color}`}>
              <Icon size={17} strokeWidth={1.75} />
            </div>
            <div>
              <div className="stat-value">{val ?? 0}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Panel de alertas */}
        <div className="card">
          <div className="card-header">
            <h2 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
              <AlertTriangle size={15} color="var(--warning)" />
              Requiere atención
              {totalAlertas > 0 && (
                <span className="badge badge-red" style={{ fontSize:"0.68rem" }}>
                  {totalAlertas}
                </span>
              )}
            </h2>
            <Link to="/reportes" className="btn btn-ghost btn-sm"
              style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}>
              Ver todo <ChevronRight size={13} />
            </Link>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {totalAlertas === 0 ? (
              <div className="empty-state" style={{ padding:"2rem" }}>
                <div className="empty-state-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#e2e8f0" strokeWidth="1.5"/>
                    <path d="M9 12l2 2 4-4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3>Todo en orden</h3>
                <p>Sin alertas pendientes</p>
              </div>
            ) : (
              <table>
                <tbody>
                  {/* Facturas por vencer */}
                  {invoiceAlerts.map(inv => (
                    <tr key={`inv-${inv.id}`}>
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
                          <div style={{ width:6,height:6,borderRadius:"50%",
                            background:"var(--accent)",flexShrink:0 }} />
                          <div>
                            <div style={{ fontWeight:600, fontSize:"0.825rem" }}>
                              Factura por vencer
                            </div>
                            <div style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
                              {inv.concepto}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign:"right" }}>
                        <Link to="/facturas">
                          <span className="badge badge-yellow">
                            <Clock size={10} style={{ marginRight:3 }} />
                            {format(new Date(inv.fecha_vencimiento), "d MMM", { locale:es })}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {/* Contratos por vencer */}
                  {data.expiringProjects?.map(p => (
                    <tr key={`p-${p.id}`}>
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
                          <div style={{ width:6,height:6,borderRadius:"50%",
                            background:"var(--danger)",flexShrink:0 }} />
                          <div>
                            <div style={{ fontWeight:600, fontSize:"0.825rem" }}>
                              Contrato por vencer
                            </div>
                            <div style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
                              {p.nombre}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign:"right" }}>
                        <Link to={`/geovisores/${p.id}`}>
                          <span className="badge badge-red">
                            {format(new Date(p.fecha_fin), "d MMM", { locale:es })}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {/* Mantenimientos próximos */}
                  {data.equipmentAlerts?.map(e => (
                    <tr key={`e-${e.id}`}>
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
                          <div style={{ width:6,height:6,borderRadius:"50%",
                            background:"var(--warning)",flexShrink:0 }} />
                          <div>
                            <div style={{ fontWeight:600, fontSize:"0.825rem" }}>
                              Mantenimiento próximo
                            </div>
                            <div style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
                              {e.nombre}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign:"right" }}>
                        <Link to="/equipos">
                          <span className="badge badge-yellow">
                            {format(new Date(e.proximo_mantenimiento), "d MMM", { locale:es })}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Usuarios en línea */}
        <div className="card">
          <div className="card-header">
            <h2 style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
              <Radio size={15} color="var(--success)" />
              Usuarios conectados
            </h2>
            <span className="badge badge-green">
              {stats.activeSessionsCount || 0} en línea
            </span>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {!data?.recentSessions?.length ? (
              <div className="empty-state" style={{ padding:"2rem" }}>
                <div className="empty-state-icon">
                  <Users size={36} strokeWidth={1} color="#e2e8f0" />
                </div>
                <h3>Sin sesiones activas</h3>
              </div>
            ) : (
              <table>
                <tbody>
                  {data.recentSessions.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
                          <div style={{
                            width:28,height:28,borderRadius:"50%",
                            background:"var(--primary-50)",border:"1px solid var(--primary-100)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:"0.65rem",fontWeight:700,color:"var(--primary)",flexShrink:0,
                          }}>
                            {s.projectUser?.nombre?.[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:"0.825rem" }}>
                              {s.projectUser?.nombre}
                            </div>
                            <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>
                              desde {format(new Date(s.started_at), "HH:mm")}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign:"right" }}>
                        <span className="badge badge-blue">{s.proyecto?.codigo}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Accesos rápidos */}
        <div className="card col-full">
          <div className="card-header"><h2>Accesos rápidos</h2></div>
          <div className="card-body">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:"0.75rem" }}>
              {[
                { to:"/comunicados", icon:Megaphone,    label:"Comunicados",  bg:"#dbeafe", color:"#1d4ed8" },
                { to:"/documentos",  icon:FolderOpen,   label:"Documentos",   bg:"#dcfce7", color:"#15803d" },
                { to:"/directorio",  icon:Users,        label:"Directorio",   bg:"#fef3c7", color:"#a16207" },
                { to:"/calendario",  icon:CalendarDays, label:"Calendario",   bg:"#fce7f3", color:"#9d174d" },
                { to:"/wiki",        icon:BookOpen,     label:"Wiki",         bg:"#f3e8ff", color:"#7e22ce" },
                { to:"/geovisores",  icon:Map,          label:"Geovisores",   bg:"#e0f2fe", color:"#0369a1" },
                { to:"/equipos",     icon:Monitor,      label:"Inventario",   bg:"#f1f5f9", color:"#475569" },
                { to:"/facturas",    icon:Receipt,      label:"Facturación",  bg:"#fff7ed", color:"#c2410c" },
              ].map(({ to, icon:Icon, label, bg, color }) => (
                <Link key={to} to={to} style={{
                  display:"flex", flexDirection:"column", alignItems:"flex-start",
                  gap:"0.75rem", padding:"1rem", background:bg,
                  borderRadius:"var(--radius)", textDecoration:"none",
                  transition:"var(--transition)", position:"relative",
                  border:"1px solid transparent",
                }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform="translateY(-1px)";
                    e.currentTarget.style.boxShadow="var(--shadow-md)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform="translateY(0)";
                    e.currentTarget.style.boxShadow="none";
                  }}
                >
                  <Icon size={20} color={color} strokeWidth={1.75} />
                  <div style={{ fontSize:"0.8rem", fontWeight:600, color:"var(--text)" }}>
                    {label}
                  </div>
                  <ArrowUpRight size={13} color={color}
                    style={{ position:"absolute", top:"0.75rem", right:"0.75rem", opacity:0.5 }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

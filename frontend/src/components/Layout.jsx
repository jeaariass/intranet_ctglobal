import { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Home, Megaphone, FolderOpen, Users, CalendarDays,
  BookOpen, Monitor, Map, BarChart2, Settings,
  LogOut, Menu, ChevronRight, Globe, Receipt
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Principal",
    items: [
      { to: "/",            icon: Home,         label: "Inicio",          end: true },
      { to: "/comunicados", icon: Megaphone,     label: "Comunicados" },
      { to: "/calendario",  icon: CalendarDays,  label: "Calendario" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/documentos",  icon: FolderOpen,    label: "Documentos" },
      { to: "/wiki",        icon: BookOpen,      label: "Buenas Prácticas" },
      { to: "/equipos",     icon: Monitor,       label: "Inventario" },
      { to: "/directorio",  icon: Users,         label: "Directorio" },
    ],
  },
  {
    label: "Geovisores",
    items: [
      { to: "/geovisores",  icon: Map,           label: "Proyectos GIS" },
      { to: "/reportes",    icon: BarChart2,      label: "Reportes" },
      { to: "/facturas",    icon: Receipt,       label: "Facturación" },
    ],
  },
];

const PAGE_TITLES = {
  "/":            "Inicio",
  "/comunicados": "Comunicados",
  "/documentos":  "Documentos",
  "/directorio":  "Directorio",
  "/calendario":  "Calendario",
  "/wiki":        "Buenas Prácticas",
  "/equipos":     "Inventario de Equipos",
  "/geovisores":  "Proyectos GIS",
  "/reportes":    "Reportes",
  "/facturas":    "Facturación",
  "/perfil":      "Mi Perfil",
  "/admin":       "Administración",
};

function getInitials(n, a) {
  return `${n?.[0] || ""}${a?.[0] || ""}`.toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Título de la página actual
  const pathBase = "/" + location.pathname.split("/")[1];
  const title = PAGE_TITLES[pathBase] || "Intranet";
  const today = format(new Date(), "d 'de' MMMM, yyyy", { locale: es });

  return (
    <div className="layout">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <Globe size={22} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">CTGlobal</span>
            <span className="sidebar-logo-sub">Intranet v2</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-section">
              <div className="nav-section-label">{group.label}</div>
              {group.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={15} className="nav-icon" strokeWidth={1.75} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}

          {user?.rol === "ADMIN" && (
            <div className="nav-section">
              <div className="nav-section-label">Sistema</div>
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Settings size={15} className="nav-icon" strokeWidth={1.75} />
                Administración
              </NavLink>
            </div>
          )}
        </nav>

        {/* User */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {getInitials(user?.nombre, user?.apellido)}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.nombre} {user?.apellido}</div>
            <div className="sidebar-user-role">
              {user?.rol === "ADMIN" ? "Administrador" : user?.rol === "EDITOR" ? "Editor" : "Colaborador"}
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            title="Cerrar sesión"
            style={{ background:"none",border:"none",color:"rgba(255,255,255,0.3)",
              cursor:"pointer",padding:"0.25rem",display:"flex",alignItems:"center",
              borderRadius:4,transition:"color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color="rgba(255,255,255,0.7)"}
            onMouseLeave={e => e.currentTarget.style.color="rgba(255,255,255,0.3)"}
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="main-content">
        <header className="topbar">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="menu-toggle"
            style={{ display:"none",background:"none",border:"none",
              color:"var(--text-muted)",cursor:"pointer",padding:"0.25rem",
              borderRadius:4 }}
          >
            <Menu size={20} />
          </button>

          {/* Breadcrumb */}
          <div style={{ display:"flex",alignItems:"center",gap:"0.4rem" }}>
            <span style={{ fontSize:"0.72rem",color:"var(--text-light)" }}>CTGlobal</span>
            <ChevronRight size={12} color="var(--text-light)" />
            <span className="topbar-title">{title}</span>
          </div>

          <div style={{ flex:1 }} />

          <span className="topbar-date" style={{ textTransform:"capitalize" }}>{today}</span>

          <NavLink to="/perfil" className="topbar-user">
            <div className="avatar avatar-sm">
              {getInitials(user?.nombre, user?.apellido)}
            </div>
            <span>{user?.nombre}</span>
            <ChevronRight size={12} color="var(--text-light)" />
          </NavLink>
        </header>

        <main className="page-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

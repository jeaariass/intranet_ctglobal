import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Announcements from "./pages/Announcements";
import Documents from "./pages/Documents";
import Directory from "./pages/Directory";
import Calendar from "./pages/Calendar";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import Wiki from "./pages/Wiki";
import WikiPage from "./pages/WikiPage";
import Equipment from "./pages/Equipment";
import GeoProjects from "./pages/GeoProjects";
import GeoProjectDetail from "./pages/GeoProjectDetail";
import Reports from "./pages/Reports";
import Invoices from "./pages/Invoices";
import NotFound from "./pages/NotFound";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader"><div className="spinner" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.rol !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="comunicados" element={<Announcements />} />
            <Route path="documentos" element={<Documents />} />
            <Route path="directorio" element={<Directory />} />
            <Route path="calendario" element={<Calendar />} />
            <Route path="wiki" element={<Wiki />} />
            <Route path="wiki/:slug" element={<WikiPage />} />
            <Route path="equipos" element={<Equipment />} />
            <Route path="geovisores" element={<GeoProjects />} />
            <Route path="geovisores/:id" element={<GeoProjectDetail />} />
            <Route path="reportes" element={<Reports />} />
            <Route path="facturas" element={<Invoices />} />
            <Route path="perfil" element={<Profile />} />
            <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

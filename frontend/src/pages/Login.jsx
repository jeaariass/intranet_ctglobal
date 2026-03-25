import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Globe, Lock, Mail, ArrowRight, CheckCircle } from "lucide-react";

const FEATURES = [
  "Comunicados y gestión documental",
  "Wiki de buenas prácticas técnicas",
  "Inventario de equipos y activos",
  "Gestión centralizada de geovisores",
  "Analytics de uso y sesiones",
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Panel izquierdo */}
      <div className="login-left">
        <div className="login-brand">
          {/* Logo */}
          <img
            src="https://ctglobal.com.co/wp-content/uploads/2024/01/Logo-CTGlobal-05.png"
            alt="CTGlobal"
            onError={e => { e.target.style.display="none"; }}
          />
          <h1>Portal interno<br />CTGlobal</h1>
          <p>
            Plataforma centralizada para la gestión de proyectos,
            documentos y geovisores de Conexión Territorial Global.
          </p>

          <div className="login-features">
            {FEATURES.map(f => (
              <div key={f} className="login-feature">
                <div className="login-feature-dot" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="login-right">
        <div className="login-form-box">
          {/* Ícono */}
          <div style={{
            width:44, height:44, background:"var(--primary-50)",
            borderRadius:10, display:"flex", alignItems:"center",
            justifyContent:"center", marginBottom:"1.25rem",
            border:"1px solid var(--primary-100)",
          }}>
            <Globe size={22} color="var(--primary)" strokeWidth={1.75} />
          </div>

          <h2>Bienvenido</h2>
          <p>Ingresa tus credenciales para acceder al portal</p>

          {error && (
            <div className="alert alert-error" style={{ display:"flex",alignItems:"center",gap:"0.5rem" }}>
              <Lock size={14} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Correo corporativo</label>
              <div style={{ position:"relative" }}>
                <Mail
                  size={15}
                  color="var(--text-light)"
                  style={{ position:"absolute",left:"0.75rem",top:"50%",transform:"translateY(-50%)" }}
                />
                <input
                  type="email"
                  placeholder="usuario@ctglobal.com.co"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  style={{ paddingLeft:"2.25rem" }}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <div style={{ position:"relative" }}>
                <Lock
                  size={15}
                  color="var(--text-light)"
                  style={{ position:"absolute",left:"0.75rem",top:"50%",transform:"translateY(-50%)" }}
                />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  style={{ paddingLeft:"2.25rem" }}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width:"100%",justifyContent:"center",padding:"0.65rem",
                fontSize:"0.875rem",marginTop:"0.25rem",gap:"0.5rem" }}
              disabled={loading}
            >
              {loading ? "Verificando..." : (
                <>Ingresar <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="login-hint">
            <strong>Demo:</strong> admin@ctglobal.com.co / Admin2024*
          </div>

          <p style={{ fontSize:"0.73rem",color:"var(--text-light)",
            marginTop:"1.5rem",textAlign:"center",lineHeight:1.6 }}>
            ¿Problemas para ingresar? Contacta al área de TI<br />
            <a href="mailto:contactenos@ctglobal.com.co"
              style={{ color:"var(--primary)" }}>
              contactenos@ctglobal.com.co
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

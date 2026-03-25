import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Wiki() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [pages, setPages] = useState([]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewPage, setShowNewPage] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [form, setForm] = useState({ titulo: "", contenido: "", categoriaId: "" });
  const [catForm, setCatForm] = useState({ nombre: "", icono: "📄" });
  const [saving, setSaving] = useState(false);

  const canEdit = ["ADMIN", "EDITOR"].includes(user?.rol);

  const load = async () => {
    const [cats, pgs] = await Promise.all([
      api.get("/wiki/categories"),
      api.get("/wiki/pages"),
    ]);
    setCategories(cats.data);
    setPages(pgs.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = pages.filter(p => {
    const matchCat = !catFilter || p.categoriaId === catFilter;
    const matchSearch = !search || p.titulo.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleCreatePage = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/wiki/pages", form);
      setShowNewPage(false);
      setForm({ titulo: "", contenido: "", categoriaId: "" });
      load();
    } finally { setSaving(false); }
  };

  const handleCreateCat = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/wiki/categories", catForm);
      setShowNewCat(false);
      setCatForm({ nombre: "", icono: "📄" });
      load();
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Buenas Prácticas</h1>
          <p>Wiki interno — protocolos, guías técnicas y procedimientos de CTGlobal</p>
        </div>
        {canEdit && (
          <div style={{ display:"flex", gap:"0.5rem" }}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowNewCat(true)}>
              + Categoría
            </button>
            <button className="btn btn-primary" onClick={() => setShowNewPage(true)}>
              + Nueva página
            </button>
          </div>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:"1.5rem" }}>
        {/* Sidebar categorías */}
        <div>
          <div className="card">
            <div className="card-body" style={{ padding:"0.5rem 0" }}>
              <button
                onClick={() => setCatFilter(null)}
                className={`nav-item ${!catFilter ? "active" : ""}`}
                style={{ width:"100%", borderRadius:0 }}>
                📚 Todas las páginas
                <span className="badge badge-gray" style={{ marginLeft:"auto" }}>
                  {pages.length}
                </span>
              </button>
              {categories.map(cat => (
                <button key={cat.id}
                  onClick={() => setCatFilter(catFilter === cat.id ? null : cat.id)}
                  className={`nav-item ${catFilter === cat.id ? "active" : ""}`}
                  style={{ width:"100%", borderRadius:0 }}>
                  {cat.icono} {cat.nombre}
                  <span className="badge badge-gray" style={{ marginLeft:"auto" }}>
                    {cat._count?.pages || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Lista de páginas */}
        <div>
          <div className="search-box" style={{ marginBottom:"1rem" }}>
            <span className="search-box-icon">🔍</span>
            <input placeholder="Buscar páginas..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="loader"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>Sin páginas</h3>
              <p>Aún no hay contenido en esta categoría.</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
              {filtered.map(page => (
                <Link key={page.id} to={`/wiki/${page.slug}`}
                  style={{ textDecoration:"none" }}>
                  <div className="card" style={{
                    padding:"1rem 1.25rem", transition:"var(--transition)",
                    cursor:"pointer",
                  }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow="var(--shadow-md)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow="var(--shadow)"}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:"0.95rem", color:"var(--primary)" }}>
                          {page.categoria?.icono} {page.titulo}
                        </div>
                        {page.categoria && (
                          <span className="badge badge-blue" style={{ marginTop:"0.3rem" }}>
                            {page.categoria.nombre}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:"0.75rem", color:"var(--text-muted)", textAlign:"right", flexShrink:0 }}>
                        <div>v{page.revision}</div>
                        <div>
                          {format(new Date(page.updated_at), "d MMM yyyy", { locale: es })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal nueva página */}
      {showNewPage && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewPage(false)}>
          <div className="modal" style={{ maxWidth:640 }}>
            <div className="modal-header">
              <h3>Nueva página</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewPage(false)}>✕</button>
            </div>
            <form onSubmit={handleCreatePage}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Título</label>
                  <input value={form.titulo}
                    onChange={e => setForm({ ...form, titulo: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select value={form.categoriaId}
                    onChange={e => setForm({ ...form, categoriaId: e.target.value })}>
                    <option value="">Sin categoría</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Contenido (Markdown)</label>
                  <textarea rows={10} value={form.contenido}
                    onChange={e => setForm({ ...form, contenido: e.target.value })}
                    placeholder="# Título&#10;&#10;Escribe el contenido en Markdown..." />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewPage(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Crear página"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nueva categoría */}
      {showNewCat && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewCat(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Nueva categoría</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewCat(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCat}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input value={catForm.nombre}
                      onChange={e => setCatForm({ ...catForm, nombre: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ícono (emoji)</label>
                    <input value={catForm.icono}
                      onChange={e => setCatForm({ ...catForm, icono: e.target.value })}
                      maxLength={4} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewCat(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Crear categoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

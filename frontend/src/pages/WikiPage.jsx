import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Renderizador de Markdown liviano (sin librería externa)
function renderMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[h|u|o|l|p|c|h|p|b|i|a|s])/gm, "<p>")
    .replace(/(?<![>])\n(?!<)/g, "<br>");
}

export default function WikiPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ titulo: "", contenido: "", categoriaId: "" });
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);

  const canEdit = ["ADMIN", "EDITOR"].includes(user?.rol);

  useEffect(() => {
    Promise.all([
      api.get(`/wiki/pages/${slug}`),
      api.get("/wiki/categories"),
    ]).then(([p, cats]) => {
      setPage(p.data);
      setCategories(cats.data);
      setForm({
        titulo: p.data.titulo,
        contenido: p.data.contenido,
        categoriaId: p.data.categoriaId || "",
      });
    }).catch(() => navigate("/wiki"))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/wiki/pages/${page.id}`, form);
      const updated = await api.get(`/wiki/pages/${slug}`);
      setPage(updated.data);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("¿Archivar esta página?")) return;
    await api.delete(`/wiki/pages/${page.id}`);
    navigate("/wiki");
  };

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (!page) return null;

  return (
    <>
      <div style={{ marginBottom:"1rem" }}>
        <Link to="/wiki" style={{ color:"var(--text-muted)", fontSize:"0.85rem" }}>
          ← Volver al wiki
        </Link>
      </div>

      {editing ? (
        <div className="card">
          <div className="card-header">
            <h2>Editando: {page.titulo}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>✕ Cancelar</button>
          </div>
          <form onSubmit={handleSave}>
            <div className="card-body">
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
                <textarea rows={20} value={form.contenido}
                  onChange={e => setForm({ ...form, contenido: e.target.value })}
                  style={{ fontFamily:"monospace", fontSize:"0.88rem" }} />
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop:"1px solid var(--border)", padding:"1rem 1.5rem", display:"flex", justifyContent:"flex-end", gap:"0.75rem" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 260px", gap:"1.5rem" }}>
          {/* Contenido principal */}
          <div className="card">
            <div className="card-header">
              <div>
                <h1 style={{ fontSize:"1.4rem" }}>{page.titulo}</h1>
                {page.categoria && (
                  <span className="badge badge-blue" style={{ marginTop:"0.3rem" }}>
                    {page.categoria.icono} {page.categoria.nombre}
                  </span>
                )}
              </div>
              {canEdit && (
                <div style={{ display:"flex", gap:"0.5rem" }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
                    ✏️ Editar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                    Archivar
                  </button>
                </div>
              )}
            </div>
            <div className="card-body">
              <div
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(page.contenido) }}
                style={{
                  lineHeight: 1.8,
                  "& h1": { color: "var(--primary)" },
                }}
              />
            </div>
          </div>

          {/* Sidebar info */}
          <div style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
            <div className="card">
              <div className="card-body" style={{ padding:"1rem" }}>
                <div style={{ fontSize:"0.8rem", color:"var(--text-muted)", marginBottom:"0.5rem",
                  fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                  Información
                </div>
                {[
                  { label:"Versión", value:`v${page.revision}` },
                  { label:"Autor", value:`${page.autor?.nombre || "—"}` },
                  { label:"Actualizado", value: format(new Date(page.updated_at), "d MMM yyyy", { locale:es }) },
                  { label:"Creado", value: format(new Date(page.created_at), "d MMM yyyy", { locale:es }) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display:"flex", justifyContent:"space-between",
                    padding:"0.4rem 0", borderBottom:"1px solid var(--border)",
                    fontSize:"0.82rem" }}>
                    <span style={{ color:"var(--text-muted)" }}>{label}</span>
                    <span style={{ fontWeight:500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {page.revisions?.length > 0 && (
              <div className="card">
                <div className="card-body" style={{ padding:"1rem" }}>
                  <div style={{ fontSize:"0.8rem", color:"var(--text-muted)", marginBottom:"0.75rem",
                    fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>
                    Historial
                  </div>
                  {page.revisions.map(r => (
                    <div key={r.id} style={{ fontSize:"0.8rem", padding:"0.3rem 0",
                      borderBottom:"1px solid var(--border)", color:"var(--text-muted)" }}>
                      v{r.revision} — {r.autor?.nombre} · {format(new Date(r.created_at), "d MMM", { locale:es })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .wiki-content h1 { color: var(--primary); font-size: 1.5rem; margin: 1.5rem 0 0.75rem; }
        .wiki-content h2 { color: var(--primary); font-size: 1.2rem; margin: 1.25rem 0 0.6rem; }
        .wiki-content h3 { font-size: 1rem; margin: 1rem 0 0.5rem; }
        .wiki-content p { margin: 0.5rem 0; }
        .wiki-content ul { padding-left: 1.5rem; margin: 0.5rem 0; }
        .wiki-content li { margin: 0.25rem 0; }
        .wiki-content code { background: #f1f5f9; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; font-family: monospace; }
        .wiki-content pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; }
        .wiki-content pre code { background: none; color: inherit; padding: 0; }
        .wiki-content hr { border: none; border-top: 1px solid var(--border); margin: 1.5rem 0; }
        .wiki-content a { color: var(--primary); text-decoration: underline; }
        .wiki-content strong { font-weight: 700; }
      `}</style>
    </>
  );
}

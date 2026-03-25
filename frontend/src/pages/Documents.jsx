import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const CATEGORIAS = ["general", "rrhh", "legal", "contabilidad", "proyectos", "procedimientos", "formatos"];

const CATEGORY_COLORS = {
  general: "badge-gray", rrhh: "badge-blue", legal: "badge-red",
  contabilidad: "badge-green", proyectos: "badge-yellow",
  procedimientos: "badge-blue", formatos: "badge-gray",
};

const FILE_ICONS = {
  pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊",
  ppt: "📑", pptx: "📑", jpg: "🖼️", jpeg: "🖼️", png: "🖼️", zip: "🗜️",
};

function getExt(filename) { return filename?.split(".").pop()?.toLowerCase() || ""; }
function getIcon(filename) { return FILE_ICONS[getExt(filename)] || "📎"; }

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [catFilter, setCatFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ nombre: "", descripcion: "", categoria: "general" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL?.replace("/api", "") || "";

  const load = (cat) => {
    const params = cat && cat !== "todos" ? `?categoria=${cat}` : "";
    api.get(`/documents${params}`).then((r) => setDocs(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(catFilter); }, [catFilter]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    const fd = new FormData();
    fd.append("nombre", form.nombre);
    fd.append("descripcion", form.descripcion);
    fd.append("categoria", form.categoria);
    fd.append("archivo", file);
    try {
      await api.post("/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShowModal(false);
      setForm({ nombre: "", descripcion: "", categoria: "general" });
      setFile(null);
      load(catFilter);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este documento?")) return;
    await api.delete(`/documents/${id}`);
    load(catFilter);
  };

  const filtered = docs.filter((d) =>
    d.nombre.toLowerCase().includes(search.toLowerCase()) ||
    d.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Documentos</h1>
          <p>Repositorio central de documentos de CTGlobal</p>
        </div>
        {user?.rol === "admin" && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Subir documento
          </button>
        )}
      </div>

      {/* Filtros y búsqueda */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
          <span className="search-box-icon">🔍</span>
          <input
            placeholder="Buscar documentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {["todos", ...CATEGORIAS].map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`btn btn-sm ${catFilter === c ? "btn-primary" : "btn-outline"}`}
              style={{ textTransform: "capitalize" }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <h3>Sin documentos</h3>
          <p>No se encontraron documentos en esta categoría.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Categoría</th>
                  <th>Subido por</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ fontSize: "1.4rem" }}>{getIcon(doc.archivo)}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{doc.nombre}</div>
                          {doc.descripcion && (
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{doc.descripcion}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${CATEGORY_COLORS[doc.categoria] || "badge-gray"}`} style={{ textTransform: "capitalize" }}>
                        {doc.categoria}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>{doc.subido_por_nombre}</td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                      {format(new Date(doc.created_at), "d MMM yyyy", { locale: es })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <a
                          href={`${apiBase}/uploads/documents/${doc.archivo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          Descargar
                        </a>
                        {user?.rol === "admin" && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(doc.id)}>
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal subir */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Subir documento</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre del documento</label>
                  <input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Manual de onboarding 2024"
                    required
                  />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                      {CATEGORIAS.map((c) => <option key={c} value={c} style={{ textTransform: "capitalize" }}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Descripción (opcional)</label>
                    <input
                      value={form.descripcion}
                      onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                      placeholder="Breve descripción"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Archivo</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
                    onChange={(e) => setFile(e.target.files[0])}
                    required
                    style={{ padding: "0.4rem" }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    PDF, Word, Excel, PowerPoint, imágenes, ZIP (máx. 20MB)
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Subiendo..." : "Subir documento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

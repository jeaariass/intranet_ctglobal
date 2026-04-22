import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Eye, Download, X } from "lucide-react";

const CATEGORIAS = ["GENERAL","CONTRATO","INFORME","CARTOGRAFIA","NORMATIVA",
                    "PROPUESTA","RRHH","LEGAL","CONTABILIDAD","PROCEDIMIENTO","FORMATO"];

const CATEGORY_COLORS = {
  GENERAL:"badge-gray", CONTRATO:"badge-blue", INFORME:"badge-blue",
  CARTOGRAFIA:"badge-green", NORMATIVA:"badge-yellow", PROPUESTA:"badge-purple",
  RRHH:"badge-blue", LEGAL:"badge-red", CONTABILIDAD:"badge-green",
  PROCEDIMIENTO:"badge-yellow", FORMATO:"badge-gray",
};

const FILE_ICONS = {
  pdf:"📄", doc:"📝", docx:"📝", xls:"📊", xlsx:"📊",
  ppt:"📑", pptx:"📑", jpg:"🖼️", jpeg:"🖼️", png:"🖼️", zip:"🗜️",
};

function getExt(filename) { return filename?.split(".").pop()?.toLowerCase() || ""; }
function getIcon(filename) { return FILE_ICONS[getExt(filename)] || "📎"; }

// ── Visor de archivo ──────────────────────────────────────────
function FileViewer({ url, nombre, onClose }) {
  const ext = getExt(url);
  const isPdf = ext === "pdf";
  const isImage = ["jpg","jpeg","png","gif","webp"].includes(ext);
  const isOffice = ["doc","docx","xls","xlsx","ppt","pptx"].includes(ext);

  // Google Docs Viewer para archivos Office
  const viewerUrl = isOffice
  ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
  : url;

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:2000, background:"rgba(10,20,35,0.92)",
        display:"flex", flexDirection:"column", alignItems:"center" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Toolbar */}
      <div style={{ width:"100%", background:"rgba(255,255,255,0.06)",
        borderBottom:"1px solid rgba(255,255,255,0.1)",
        padding:"0.75rem 1.5rem",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ color:"#fff", fontSize:"0.875rem", fontWeight:600 }}>
          {getIcon(url)} {nombre}
        </span>
        <div style={{ display:"flex", gap:"0.75rem", alignItems:"center" }}>
          {isOffice && (
            <span style={{ color:"rgba(255,255,255,0.5)", fontSize:"0.75rem" }}>
              Visor de Google Docs
            </span>
          )}
          <a href={url} download target="_blank" rel="noreferrer"
            style={{ display:"flex", alignItems:"center", gap:"0.4rem",
              background:"rgba(255,255,255,0.12)", color:"#fff",
              padding:"0.4rem 0.85rem", borderRadius:"6px",
              fontSize:"0.8rem", fontWeight:600, textDecoration:"none",
              border:"1px solid rgba(255,255,255,0.15)" }}>
            <Download size={13} /> Descargar
          </a>
          <button onClick={onClose}
            style={{ background:"rgba(255,255,255,0.12)",
              border:"1px solid rgba(255,255,255,0.15)", color:"#fff",
              borderRadius:"6px", padding:"0.4rem 0.6rem",
              cursor:"pointer", display:"flex", alignItems:"center" }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex:1, width:"100%", overflow:"auto", padding:"1.5rem",
        display:"flex", justifyContent:"center" }}>
        {isPdf ? (
          <iframe src={url} title={nombre}
            style={{ width:"100%", maxWidth:"900px", height:"calc(100vh - 120px)",
              border:"none", borderRadius:"8px", background:"#fff" }} />
        ) : isImage ? (
          <img src={url} alt={nombre}
            style={{ maxWidth:"900px", maxHeight:"calc(100vh - 120px)",
              objectFit:"contain", borderRadius:"8px",
              boxShadow:"0 8px 40px rgba(0,0,0,0.4)" }} />
        ) : isOffice ? (
          <iframe src={viewerUrl} title={nombre}
            style={{ width:"100%", maxWidth:"960px", height:"calc(100vh - 120px)",
              border:"none", borderRadius:"8px", background:"#fff" }} />
        ) : (
          <div style={{ color:"#fff", textAlign:"center", marginTop:"4rem" }}>
            <div style={{ fontSize:"4rem", marginBottom:"1rem" }}>📎</div>
            <p>Este tipo de archivo no se puede previsualizar.</p>
            <a href={url} download
              style={{ color:"var(--accent)", textDecoration:"underline", marginTop:"1rem",
                display:"inline-block" }}>
              Descargar archivo
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [catFilter, setCatFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ nombre:"", descripcion:"", categoria:"GENERAL" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState(null);

  const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/api\/?$/, "");

  const load = (cat) => {
    const params = cat && cat !== "todos" ? `?categoria=${cat}` : "";
    api.get(`/documents${params}`).then(r => setDocs(r.data)).finally(() => setLoading(false));
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
      setForm({ nombre:"", descripcion:"", categoria:"GENERAL" });
      setFile(null);
      load(catFilter);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este documento?")) return;
    await api.delete(`/documents/${id}`);
    load(catFilter);
  };

  const filtered = docs.filter(d =>
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
        {["ADMIN","EDITOR"].includes(user?.rol) && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Subir documento
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:"1rem", marginBottom:"1.5rem",
        flexWrap:"wrap", alignItems:"center" }}>
        <div className="search-box" style={{ flex:1, minWidth:200 }}>
          <span className="search-box-icon">🔍</span>
          <input placeholder="Buscar documentos..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap" }}>
          {["todos", ...CATEGORIAS].map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`btn btn-sm ${catFilter === c ? "btn-primary" : "btn-outline"}`}
              style={{ textTransform:"capitalize" }}>
              {c.toLowerCase()}
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
                {filtered.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
                        <span style={{ fontSize:"1.4rem" }}>{getIcon(doc.archivo)}</span>
                        <div>
                          <div style={{ fontWeight:600 }}>{doc.nombre}</div>
                          {doc.descripcion && (
                            <div style={{ fontSize:"0.78rem", color:"var(--text-muted)" }}>
                              {doc.descripcion}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${CATEGORY_COLORS[doc.categoria] || "badge-gray"}`}
                        style={{ textTransform:"capitalize" }}>
                        {doc.categoria?.toLowerCase()}
                      </span>
                    </td>
                    <td style={{ fontSize:"0.85rem" }}>{doc.subido_por_nombre}</td>
                    <td style={{ fontSize:"0.82rem", color:"var(--text-muted)" }}>
                      {format(new Date(doc.created_at), "d MMM yyyy", { locale:es })}
                    </td>
                    <td>
                      <div style={{ display:"flex", gap:"0.4rem" }}>
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}
                          onClick={() => setViewer({
                            url: `${apiBase}/uploads/documents/${doc.archivo}`,
                            nombre: doc.nombre,
                          })}>
                          <Eye size={13} /> Ver
                        </button>
                        <a href={`${apiBase}/uploads/documents/${doc.archivo}`}
                          download target="_blank" rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                          style={{ display:"inline-flex", alignItems:"center", gap:"0.3rem" }}>
                          <Download size={13} /> Descargar
                        </a>
                        {["ADMIN","EDITOR"].includes(user?.rol) && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(doc.id)}>✕</button>
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
        <div className="modal-overlay"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Subir documento</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nombre del documento</label>
                  <input value={form.nombre}
                    onChange={e => setForm({...form, nombre:e.target.value})}
                    placeholder="Ej: Formato Cuenta de Cobro" required />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select value={form.categoria}
                      onChange={e => setForm({...form, categoria:e.target.value})}>
                      {CATEGORIAS.map(c => (
                        <option key={c} value={c} style={{ textTransform:"capitalize" }}>
                          {c.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Descripción (opcional)</label>
                    <input value={form.descripcion}
                      onChange={e => setForm({...form, descripcion:e.target.value})}
                      placeholder="Breve descripción" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Archivo</label>
                  <input type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
                    onChange={e => setFile(e.target.files[0])} required
                    style={{ padding:"0.4rem" }} />
                  <span style={{ fontSize:"0.75rem", color:"var(--text-muted)" }}>
                    PDF, Word, Excel, PowerPoint, imágenes, ZIP (máx. 20MB)
                  </span>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost"
                  onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Subiendo..." : "Subir documento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visor */}
      {viewer && (
        <FileViewer
          url={viewer.url}
          nombre={viewer.nombre}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
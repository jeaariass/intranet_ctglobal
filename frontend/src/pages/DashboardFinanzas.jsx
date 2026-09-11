// frontend/src/pages/DashboardFinanzas.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { LayoutDashboard, TrendingUp, TrendingDown, Save, Wallet, Receipt } from "lucide-react";

const CAT_LABEL = {
  RECIBO_PUBLICO:"Recibo público", ADMINISTRACION:"Administración",
  CONTRATISTA:"Pago contratista", VUELO:"Vuelo", VIATICO:"Viático",
  DEPRECIACION:"Depreciación", OTRO:"Otro",
};
const TIPO_LABEL = {
  COMPRA:"Compra", SERVICIO_MENSUAL:"Servicio mensual",
  SERVICIO_ANUAL:"Servicio anual", MANTENIMIENTO:"Mantenimiento", OTRO:"Otro",
};
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const cop0 = (n) => `$${(+n || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
const usd2 = (n) => `USD ${(+n || 0).toLocaleString("es-CO", { minimumFractionDigits: 2 })}`;

const now = new Date();

export default function DashboardFinanzas() {
  const { hasRole } = useAuth();
  const canEditPrevision = hasRole("ADMIN","EDITOR","CONTABILIDAD","TESORERIA");

  const [anio, setAnio] = useState(now.getFullYear());
  const [resumen, setResumen] = useState(null);
  const [prevision, setPrevision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});       // key -> { promedio_mensual, notas }
  const [saving, setSaving] = useState({});     // key -> bool
  const [presupuestoDraft, setPresupuestoDraft] = useState({ presupuesto_anual:"", notas:"" });
  const [savingPresupuesto, setSavingPresupuesto] = useState(false);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        api.get(`/finanzas/resumen?anio=${anio}`),
        api.get(`/finanzas/prevision?anio=${anio}`),
      ]);
      setResumen(r.data);
      setPrevision(p.data);
      setPresupuestoDraft({
        presupuesto_anual: p.data.presupuesto.presupuesto_anual || "",
        notas: p.data.presupuesto.notas || "",
      });
      setEdits({});
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [anio]);

  const key = (l) => `${l.categoria} ${l.subcategoria || ""}`;

  const editValue = (l) =>
    edits[key(l)]?.promedio_mensual !== undefined
      ? edits[key(l)].promedio_mensual
      : (l.promedio_override != null ? l.promedio_override : "");

  const dirty = (l) => {
    const e = edits[key(l)];
    if (!e) return false;
    const original = l.promedio_override != null ? String(l.promedio_override) : "";
    return String(e.promedio_mensual) !== original;
  };

  const guardarLinea = async (l) => {
    const k = key(l);
    setSaving({ ...saving, [k]: true });
    try {
      const val = edits[k]?.promedio_mensual;
      await api.put("/finanzas/prevision", {
        anio, categoria: l.categoria, subcategoria: l.subcategoria,
        promedio_mensual: val === "" ? null : val,
        notas: l.notas || "",
      });
      await load();
    } finally { setSaving((s) => ({ ...s, [k]: false })); }
  };

  const guardarPresupuesto = async (e) => {
    e.preventDefault();
    setSavingPresupuesto(true);
    try {
      await api.put("/finanzas/prevision/presupuesto", { anio, ...presupuestoDraft });
      await load();
    } finally { setSavingPresupuesto(false); }
  };

  const maxGastoCop = useMemo(
    () => Math.max(1, ...(resumen?.gastosPorCategoria || []).map((g) => g.total_cop)),
    [resumen]
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard de Finanzas</h1>
          <p>Gastos y facturación por categoría, y previsión de lo que resta pagar hasta fin de año</p>
        </div>
      </div>

      <div style={{ display:"flex", gap:"0.6rem", alignItems:"center", marginBottom:"1.25rem" }}>
        <span style={{ fontSize:"0.8rem", color:"var(--text-muted)", fontWeight:600 }}>Año</span>
        <select style={{ width:110 }} value={anio} onChange={(e) => setAnio(+e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner" /></div>
      ) : (
        <>
          {/* ── Gastos por categoría ── */}
          <div className="card" style={{ marginBottom:"1.5rem" }}>
            <div style={{ padding:"0.85rem 1rem", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"0.5rem", fontWeight:700, fontSize:"0.9rem" }}>
              <Wallet size={16} /> Gastos por categoría — {anio}
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Categoría</th><th>Registros</th><th>Total COP</th><th>Total USD</th><th></th></tr>
                </thead>
                <tbody>
                  {(resumen?.gastosPorCategoria || []).length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:"center", color:"var(--text-muted)", padding:"1.25rem" }}>Sin gastos registrados en {anio}.</td></tr>
                  ) : resumen.gastosPorCategoria.map((g, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{CAT_LABEL[g.categoria] || g.categoria}</div>
                        {g.subcategoria && <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>{g.subcategoria}</div>}
                      </td>
                      <td style={{ fontSize:"0.82rem" }}>{g.count}</td>
                      <td style={{ fontWeight:700, fontSize:"0.86rem" }}>{cop0(g.total_cop)}</td>
                      <td style={{ fontSize:"0.82rem", color: g.total_usd > 0 ? "#1d4ed8" : "var(--text-light)" }}>
                        {g.total_usd > 0 ? usd2(g.total_usd) : "—"}
                      </td>
                      <td style={{ width:120 }}>
                        <div style={{ background:"#e2e8f0", borderRadius:4, height:6, overflow:"hidden" }}>
                          <div style={{ width:`${Math.max(3,(g.total_cop/maxGastoCop)*100)}%`, height:"100%", background:"var(--primary,#2563eb)" }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Facturación por tipo ── */}
          <div className="card" style={{ marginBottom:"1.5rem" }}>
            <div style={{ padding:"0.85rem 1rem", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:"0.5rem", fontWeight:700, fontSize:"0.9rem" }}>
              <Receipt size={16} /> Facturación por tipo — {anio}
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Tipo</th><th>Estado</th><th>Registros</th><th>Total COP</th><th>Total USD</th></tr>
                </thead>
                <tbody>
                  {(resumen?.facturasPorTipo || []).length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:"center", color:"var(--text-muted)", padding:"1.25rem" }}>Sin facturas registradas en {anio}.</td></tr>
                  ) : resumen.facturasPorTipo.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600, fontSize:"0.85rem" }}>{TIPO_LABEL[f.tipo] || f.tipo}</td>
                      <td><span className="badge badge-gray">{f.estado}</span></td>
                      <td style={{ fontSize:"0.82rem" }}>{f.count}</td>
                      <td style={{ fontWeight:700, fontSize:"0.86rem" }}>{cop0(f.total_cop)}</td>
                      <td style={{ fontSize:"0.82rem", color: f.total_usd > 0 ? "#1d4ed8" : "var(--text-light)" }}>
                        {f.total_usd > 0 ? usd2(f.total_usd) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Previsión anual ── */}
          <div className="card">
            <div style={{ padding:"0.85rem 1rem", borderBottom:"1px solid var(--border)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", fontWeight:700, fontSize:"0.9rem" }}>
                <LayoutDashboard size={16} /> Previsión anual — {anio}
              </div>
              <p style={{ fontSize:"0.78rem", color:"var(--text-muted)", margin:"0.35rem 0 0" }}>
                Promedio mensual de los últimos 6 meses por categoría (editable) × meses que faltan del año
                {prevision?.mesesRestantes != null && ` (${prevision.mesesRestantes})`}, sumado a lo ya gastado en {anio}.
              </p>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Categoría</th><th>Promedio auto</th><th>Promedio a usar</th>
                    <th>Ya gastado</th><th>Proyección resto de año</th><th>Total estimado anual</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {(prevision?.lineas || []).length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign:"center", color:"var(--text-muted)", padding:"1.25rem" }}>
                      Sin datos suficientes para proyectar {anio}.
                    </td></tr>
                  ) : prevision.lineas.map((l) => (
                    <tr key={key(l)}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:"0.85rem" }}>{CAT_LABEL[l.categoria] || l.categoria}</div>
                        {l.subcategoria && <div style={{ fontSize:"0.72rem", color:"var(--text-muted)" }}>{l.subcategoria}</div>}
                      </td>
                      <td style={{ fontSize:"0.8rem", color:"var(--text-muted)" }}>{cop0(l.promedio_auto)}</td>
                      <td style={{ width:140 }}>
                        {canEditPrevision ? (
                          <input type="number" step="0.01" min="0" style={{ width:130 }}
                            placeholder={cop0(l.promedio_auto)}
                            value={editValue(l)}
                            onChange={(e) => setEdits({ ...edits, [key(l)]: { promedio_mensual: e.target.value } })} />
                        ) : (
                          <span style={{ fontWeight:600, fontSize:"0.84rem" }}>{cop0(l.promedio_efectivo)}</span>
                        )}
                      </td>
                      <td style={{ fontSize:"0.83rem" }}>{cop0(l.ya_gastado)}</td>
                      <td style={{ fontSize:"0.83rem" }}>{cop0(l.proyeccion_resto)}</td>
                      <td style={{ fontWeight:700, fontSize:"0.86rem" }}>{cop0(l.total_estimado)}</td>
                      <td>
                        {canEditPrevision && dirty(l) && (
                          <button className="btn btn-sm btn-primary" disabled={saving[key(l)]}
                            onClick={() => guardarLinea(l)}
                            style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}>
                            <Save size={12} /> {saving[key(l)] ? "…" : "Guardar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {(prevision?.lineas || []).length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight:700 }}>
                      <td colSpan={3} style={{ textAlign:"right" }}>Totales</td>
                      <td>{cop0(prevision.totalYaGastado)}</td>
                      <td>{cop0(prevision.totalProyeccionResto)}</td>
                      <td>{cop0(prevision.totalEstimadoAnual)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Presupuesto vs proyectado */}
            <div style={{ padding:"1.25rem", borderTop:"1px solid var(--border)", display:"flex", gap:"1.5rem", flexWrap:"wrap", alignItems:"flex-start" }}>
              <form onSubmit={guardarPresupuesto} style={{ flex:"1 1 280px", minWidth:260 }}>
                <label className="form-label">Presupuesto para cubrir todo hasta fin de {anio}</label>
                <div style={{ display:"flex", gap:"0.5rem" }}>
                  <input type="number" step="0.01" min="0" style={{ flex:1 }}
                    value={presupuestoDraft.presupuesto_anual}
                    disabled={!canEditPrevision}
                    onChange={(e) => setPresupuestoDraft({ ...presupuestoDraft, presupuesto_anual: e.target.value })}
                    placeholder="Ej: 80000000" />
                  {canEditPrevision && (
                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingPresupuesto}>
                      {savingPresupuesto ? "…" : "Guardar"}
                    </button>
                  )}
                </div>
                {canEditPrevision && (
                  <textarea rows={2} style={{ marginTop:"0.5rem", width:"100%" }}
                    value={presupuestoDraft.notas}
                    onChange={(e) => setPresupuestoDraft({ ...presupuestoDraft, notas: e.target.value })}
                    placeholder="Notas del presupuesto (opcional)" />
                )}
              </form>

              <div style={{ flex:"1 1 280px", minWidth:260, background:"#0f172a", color:"#fff", borderRadius:"var(--radius-sm)", padding:"1rem 1.25rem" }}>
                <div style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.05em", opacity:0.7, fontWeight:600, marginBottom:4 }}>
                  Estimado total {anio} vs. presupuesto
                </div>
                <div style={{ fontSize:"1.4rem", fontWeight:700 }}>{cop0(prevision?.totalEstimadoAnual)}</div>
                <div style={{ fontSize:"0.8rem", opacity:0.8, marginTop:2 }}>Presupuesto: {cop0(prevision?.presupuesto.presupuesto_anual)}</div>
                <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", marginTop:"0.6rem",
                  color: (prevision?.diferencia ?? 0) >= 0 ? "#86efac" : "#fca5a5", fontWeight:700 }}>
                  {(prevision?.diferencia ?? 0) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {(prevision?.diferencia ?? 0) >= 0 ? "Sobran " : "Faltan "}
                  {cop0(Math.abs(prevision?.diferencia ?? 0))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

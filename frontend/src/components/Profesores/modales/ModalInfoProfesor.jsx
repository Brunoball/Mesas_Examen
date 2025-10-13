// src/components/Profesores/modales/ModalInfoProfesor.jsx
import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
import "./ModalInfoProfesor.css"; // CSS local (incluye .INFOPROF-card--full { grid-column: 1 / -1; })
import BASE_URL from "../../../config/config";

const ModalInfoProfesor = ({ mostrar, open, idProfesor, profesor, onClose }) => {
  const isOpen = (typeof open === "boolean" ? open : mostrar) === true;
  const closeBtnRef = useRef(null);

  const TABS = useMemo(
    () => [
      { id: "resumen",        label: "Resumen" },
      { id: "disponibilidad", label: "Disponibilidad" },
      { id: "catedras",       label: "Cátedras" },
      { id: "materias",       label: "Materias" },
    ],
    []
  );

  const [active, setActive] = useState(TABS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [prof, setProf]       = useState(profesor || null);

  // Helpers
  const texto = useCallback((v) => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s === "" ? "-" : s;
  }, []);

  const fmtFechaISO = useCallback((v) => {
    if (!v || typeof v !== "string") return "-";
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return texto(v);
    return `${m[3]}/${m[2]}/${m[1]}`;
  }, [texto]);

  const estadoTxt = useMemo(() => {
    const p = prof || {};
    const raw = p.estado ?? p.activo ?? p.situacion ?? p.estado_laboral ?? p.baja ?? "";
    const s = String(raw).toLowerCase().trim();
    if (s === "1" || s === "true" || s === "activo" || s === "activa") return "ACTIVO";
    if (s === "0" || s === "false" || s === "baja" || s === "inactivo") return "BAJA";
    if (typeof raw === "number") return raw === 1 ? "ACTIVO" : raw === 0 ? "BAJA" : texto(raw);
    return texto(raw);
  }, [prof, texto]);

  // Ciclo de vida (siempre antes de cualquier return)
  useEffect(() => {
    setActive(TABS[0].id);
    setError(null);
    if (!isOpen) return;
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, TABS]);

  useEffect(() => {
    if (!isOpen) return;

    if (!idProfesor) {
      setProf(profesor || null);
      setError(null);
      setLoading(false);
      return;
    }

    let abort = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = `${BASE_URL}/api.php?action=profesores&id=${encodeURIComponent(idProfesor)}`;
        const resp = await fetch(url, { method: "GET" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (abort) return;
        if (!json?.exito) throw new Error(json?.mensaje || "Error desconocido al obtener profesor");
        const arr = Array.isArray(json?.profesores) ? json.profesores : [];
        setProf(arr[0] || profesor || null);
      } catch (e) {
        if (!abort) setError(e.message || String(e));
      } finally {
        if (!abort) setLoading(false);
      }
    };

    fetchData();
    return () => { abort = true; };
  }, [isOpen, idProfesor, profesor]);

  // ====== Derivados ======
  const P = prof || {};
  const materias = Array.isArray(P.materias) ? P.materias.filter(Boolean) : [];
  const catedras = Array.isArray(P.catedras) ? P.catedras.filter(Boolean) : [];

  const resumenCab = useMemo(() => {
    const totalMaterias = (P?.materias_total ?? materias.length);
    return {
      nombre: texto(P.nombre_completo),
      id: texto(P.id_profesor),
      dni: texto(P.dni ?? P.num_documento),
      cargo: texto(P.cargo_nombre),
      id_cargo: P.id_cargo ? ` (ID ${P.id_cargo})` : "",
      materia_principal: texto(P.materia_principal ?? P.materia_nombre),
      total_materias: texto(totalMaterias),
      estado: estadoTxt,
    };
  }, [P, materias.length, estadoTxt, texto]);

  if (!isOpen) return null;

  return (
    <div
      className="INFOPROF-modal__overlay"
      onClick={(e) => e.target.classList.contains("INFOPROF-modal__overlay") && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="INFOPROF-modal-title-prof"
    >
      <div className="INFOPROF-modal__container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="INFOPROF-modal__header">
          <div className="INFOPROF-modal__head-left">
            <h2 id="INFOPROF-modal-title-prof" className="INFOPROF-modal__title">
              Información del Profesor
            </h2>
            <p className="INFOPROF-modal__subtitle">
              {resumenCab.nombre} &nbsp;|&nbsp; ID: {resumenCab.id}
            </p>
          </div>
          <button
            className="INFOPROF-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
            ref={closeBtnRef}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="INFOPROF-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`INFOPROF-tab ${active === t.id ? "is-active" : ""}`}
              onClick={() => setActive(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="INFOPROF-modal__content">
          {loading && <div className="INFOPROF-loader">Cargando información del profesor…</div>}
          {error && !loading && <div className="INFOPROF-error">⚠️ {String(error)}</div>}

          {/* TAB: Resumen */}
          {active === "resumen" && !loading && !error && (
            <section className="INFOPROF-tabpanel is-active">
              <div className="INFOPROF-grid INFOPROF-grid--2cols">
                <article className="INFOPROF-card">
                  <h3 className="INFOPROF-card__title">Identificación</h3>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">ID</span><span className="INFOPROF-value">{resumenCab.id}</span></div>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Nombre</span><span className="INFOPROF-value">{resumenCab.nombre}</span></div>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">DNI</span><span className="INFOPROF-value">{resumenCab.dni}</span></div>
                  <div className="INFOPROF-row">
                    <span className="INFOPROF-label">Cargo</span>
                    <span className="INFOPROF-value">
                      {resumenCab.cargo}
                      {resumenCab.id_cargo && <small className="INFOPROF-muted">&nbsp;{resumenCab.id_cargo}</small>}
                    </span>
                  </div>
                </article>

                <article className="INFOPROF-card">
                  <h3 className="INFOPROF-card__title">Académico / Laboral</h3>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Materia principal</span><span className="INFOPROF-value">{resumenCab.materia_principal}</span></div>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Total de materias</span><span className="INFOPROF-value">{resumenCab.total_materias}</span></div>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Estado</span><span className="INFOPROF-value">{resumenCab.estado}</span></div>
                </article>
              </div>
            </section>
          )}

          {/* TAB: Disponibilidad */}
          {active === "disponibilidad" && !loading && !error && (
            <section className="INFOPROF-tabpanel is-active">
              <div className="INFOPROF-grid INFOPROF-grid--2cols">
                <article className="INFOPROF-card">
                  <h3 className="INFOPROF-card__title">Turnos (Sí)</h3>
                  <div className="INFOPROF-row">
                    <span className="INFOPROF-label">Turno permitido</span>
                    <span className="INFOPROF-value">
                      {texto(P.turno_si_nombre)}
                      {P.id_turno_si ? <small className="INFOPROF-muted"> &nbsp;(ID {P.id_turno_si})</small> : null}
                    </span>
                  </div>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Fecha</span><span className="INFOPROF-value">{fmtFechaISO(P.fecha_si)}</span></div>
                </article>

                <article className="INFOPROF-card">
                  <h3 className="INFOPROF-card__title">Turnos (No)</h3>
                  <div className="INFOPROF-row">
                    <span className="INFOPROF-label">Turno restringido</span>
                    <span className="INFOPROF-value">
                      {texto(P.turno_no_nombre)}
                      {P.id_turno_no ? <small className="INFOPROF-muted"> &nbsp;(ID {P.id_turno_no})</small> : null}
                    </span>
                  </div>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Fecha</span><span className="INFOPROF-value">{fmtFechaISO(P.fecha_no)}</span></div>
                </article>

                <article className="INFOPROF-card" style={{ gridColumn: "1 / -1" }}>
                  <h3 className="INFOPROF-card__title">Metadatos</h3>
                  <div className="INFOPROF-row"><span className="INFOPROF-label">Fecha de carga</span><span className="INFOPROF-value">{fmtFechaISO(P.fecha_carga)}</span></div>
                </article>
              </div>
            </section>
          )}

          {/* TAB: Cátedras */}
          {active === "catedras" && !loading && !error && (
            <section className="INFOPROF-tabpanel is-active">
              <article className="INFOPROF-card INFOPROF-card--full">
                <h3 className="INFOPROF-card__title">Cátedras (Curso – División — Materia)</h3>
                <div className="INFOPROF-table">
                  <div className="INFOPROF-thead" style={{ gridTemplateColumns: "1fr 0.6fr 1.4fr" }}>
                    <div className="INFOPROF-th">Curso</div>
                    <div className="INFOPROF-th">División</div>
                    <div className="INFOPROF-th">Materia</div>
                  </div>
                  <div className="INFOPROF-tbody" style={{ maxHeight: "48vh" }}>
                    {catedras.length === 0 ? (
                      <div className="INFOPROF-row-empty">Sin cátedras registradas.</div>
                    ) : (
                      catedras.map((c, idx) => (
                        <div
                          className="INFOPROF-tr"
                          key={idx}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 0.6fr 1.4fr",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div className="INFOPROF-td">{texto(c.curso)}</div>
                          <div className="INFOPROF-td">{texto(c.division)}</div>
                          <div className="INFOPROF-td">{texto(c.materia)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </article>
            </section>
          )}

          {/* TAB: Materias */}
          {active === "materias" && !loading && !error && (
            <section className="INFOPROF-tabpanel is-active">
              <div className="INFOPROF-grid">
                <article className="INFOPROF-card INFOPROF-card--full">
                  <h3 className="INFOPROF-card__title">Materias que dicta</h3>
                  {materias.length === 0 ? (
                    <div className="INFOPROF-row-empty">Sin materias registradas.</div>
                  ) : (
                    <div className="INFOPROF-rows" style={{ gridTemplateColumns: "1fr" }}>
                      {materias.map((m, i) => (
                        <div
                          className="INFOPROF-row"
                          key={`${m}-${i}`}
                          style={{ gridTemplateColumns: "140px 1fr" }}
                        >
                          <span className="INFOPROF-label">Materia #{i + 1}</span>
                          <span className="INFOPROF-value">{texto(m)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalInfoProfesor;

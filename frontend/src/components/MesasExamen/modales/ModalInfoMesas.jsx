import React, { useEffect, useCallback, useMemo, useState } from "react";
import "./ModalInfoMesas.css";
import BASE_URL from "../../../config/config";

/**
 * Modal de Información de MESAS (una mesa o un grupo de mesas)
 * - Trae todos los alumnos de las mesas (con curso/división)
 * - Trae los 3 profesores (tribunal unificado)
 * - Para cada profesor, lista qué alumnos le corresponden (los de las mesas donde figura)
 *
 * Fuente de datos: POST  action=mesas_detalle
 *   - { id_grupo }  -> resuelve numero_mesa_1..4 y devuelve detalle por mesa
 *   - { numeros_mesa: [ ... ] }
 */
const ModalInfoMesas = ({ open, mesa, onClose }) => {
  const TABS = [
    { id: "resumen", label: "Resumen" },
    { id: "alumnos", label: "Alumnos" },
    { id: "docentes", label: "Docentes" },
    { id: "por_docente", label: "Por docente" },
  ];

  const [active, setActive] = useState(TABS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Detalle crudo desde el backend: [{numero_mesa, materia, fecha, turno, docentes[], alumnos[]}, ...]
  const [mesasDetalle, setMesasDetalle] = useState([]);

  /* ==========================
     Utils
  ========================== */
  const texto = useCallback((v) => {
    const s = v === null || v === undefined ? "" : String(v).trim();
    return s === "" ? "-" : s;
  }, []);

  const fmtFechaISO = useCallback((v) => {
    if (!v || typeof v !== "string") return "-";
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return v;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }, []);

  const uniqPreserve = (arr) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = String(x ?? "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  };

  /* ==========================
     Carga de detalle
  ========================== */
  useEffect(() => {
    setActive(TABS[0].id);
    setMesasDetalle([]);
    setError("");

    if (!open) return;

    const idGrupo = mesa?.id_grupo;
    const numeros = Array.isArray(mesa?.numero_mesa)
      ? mesa.numero_mesa
      : mesa?.numero_mesa
      ? [mesa.numero_mesa]
      : [];

    if (!idGrupo && (!numeros || numeros.length === 0)) return;

    const fetchDetalle = async () => {
      setLoading(true);
      try {
        const body = idGrupo
          ? { id_grupo: idGrupo }
          : { numeros_mesa: numeros.map((n) => parseInt(n, 10)).filter(Boolean) };

        const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || `HTTP ${resp.status}`);
        }

        const data = Array.isArray(json.data) ? json.data : [];
        const norm = data.map((m) => ({
          numero_mesa: m.numero_mesa ?? null,
          materia: m.materia ?? mesa?.materia ?? "",
          fecha: m.fecha ?? mesa?.fecha ?? "",
          id_turno: m.id_turno ?? null,
          turno: m.turno ?? mesa?.turno ?? "",
          docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
          alumnos: Array.isArray(m.alumnos)
            ? m.alumnos.map((a) => ({
                alumno: a.alumno ?? "",
                dni: a.dni ?? "",
                // backend devuelve "curso" ya combinado tipo "3° A".
                curso_div: a.curso ?? "",
              }))
            : [],
        }));

        setMesasDetalle(norm);
      } catch (e) {
        setError(e?.message || "No se pudo obtener información de las mesas.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetalle();
  }, [open, mesa]);

  /* ==========================
     Derivados para la UI
  ========================== */

  // Materia(s), fecha y turno “representativos”
  const resumenCab = useMemo(() => {
    const materias =
      mesasDetalle?.length
        ? uniqPreserve(mesasDetalle.map((x) => x.materia).filter(Boolean))
        : uniqPreserve([mesa?.materia].filter(Boolean));

    const fecha =
      mesasDetalle?.length
        ? (mesasDetalle.find((x) => x.fecha)?.fecha ?? mesa?.fecha ?? "-")
        : mesa?.fecha ?? "-";

    const turno =
      mesasDetalle?.length
        ? (mesasDetalle.find((x) => x.turno)?.turno ?? mesa?.turno ?? "-")
        : mesa?.turno ?? "-";

    const mesasNums = mesasDetalle?.length
      ? mesasDetalle.map((x) => x.numero_mesa).filter(Boolean)
      : Array.isArray(mesa?.numero_mesa)
      ? mesa.numero_mesa
      : mesa?.numero_mesa
      ? [mesa.numero_mesa]
      : [];

    return {
      materias,
      fecha,
      turno,
      mesas: uniqPreserve(mesasNums),
    };
  }, [mesasDetalle, mesa]);

  // Alumnos unificados de todas las mesas
  const alumnosTodos = useMemo(() => {
    const out = [];
    for (const m of mesasDetalle) {
      for (const a of m.alumnos) {
        out.push({
          alumno: a.alumno,
          dni: a.dni,
          curso_div: a.curso_div,
          numero_mesa: m.numero_mesa,
        });
      }
    }
    out.sort((a, b) => a.alumno.localeCompare(b.alumno, "es", { sensitivity: "base" }));
    return out;
  }, [mesasDetalle]);

  // Tribunal unificado (docentes únicos de todas las mesas)
  const docentesUnicos = useMemo(() => {
    const all = mesasDetalle.flatMap((m) => m.docentes || []);
    return uniqPreserve(all);
  }, [mesasDetalle]);

  // Alumnos por docente
  const alumnosPorDocente = useMemo(() => {
    const map = new Map(); // nombreDocente -> alumnos[]
    for (const d of docentesUnicos) map.set(d, []);
    for (const m of mesasDetalle) {
      if (!Array.isArray(m.docentes) || !m.docentes.length) continue;
      for (const d of m.docentes) {
        if (!map.has(d)) map.set(d, []);
        for (const a of m.alumnos) {
          map.get(d).push({
            alumno: a.alumno,
            dni: a.dni,
            curso_div: a.curso_div,
            numero_mesa: m.numero_mesa,
          });
        }
      }
    }
    for (const [d, arr] of map.entries()) {
      arr.sort((a, b) => a.alumno.localeCompare(b.alumno, "es", { sensitivity: "base" }));
      map.set(d, arr);
    }
    return map;
  }, [docentesUnicos, mesasDetalle]);

  // Materias por docente (únicas, según en qué mesas aparece)
  const materiasPorDocente = useMemo(() => {
    const map = new Map(); // nombreDocente -> [materias]
    for (const d of docentesUnicos) {
      const mats = uniqPreserve(
        mesasDetalle
          .filter((m) => (m.docentes || []).includes(d))
          .map((m) => m.materia)
          .filter(Boolean)
      );
      map.set(d, mats);
    }
    return map;
  }, [docentesUnicos, mesasDetalle]);

  if (!open) return null;

  const materiasHeader =
    resumenCab.materias?.length ? resumenCab.materias.join(" • ") : "-";

  return (
    <div
      className="infomesas-modal__overlay"
      onClick={(e) => e.target.classList.contains("infomesas-modal__overlay") && onClose?.()}
    >
      <div
        className="infomesas-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="infomesas-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="infomesas-modal__header">
          <div className="infomesas-modal__head-left">
            <h2 id="infomesas-modal-title" className="infomesas-modal__title">
              Información de Mesas
            </h2>
            <p className="infomesas-modal__subtitle">
              {texto(materiasHeader)} &nbsp;|&nbsp; {fmtFechaISO(resumenCab.fecha)} &nbsp;|&nbsp;{" "}
              {texto(resumenCab.turno)}
            </p>
          </div>
          <button className="infomesas-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="infomesas-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`infomesas-tab ${active === t.id ? "is-active" : ""}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="infomesas-modal__content">
          {loading && <div className="infomesas-loader">Cargando información…</div>}
          {error && !loading && <div className="infomesas-error">⚠️ {error}</div>}

          {/* ====== TAB: Resumen ====== */}
          {active === "resumen" && !loading && !error && (
            <section className="infomesas-tabpanel is-active">
              <div className="infomesas-grid infomesas-grid--2cols">
                <article className="infomesas-card">
                  <h3 className="infomesas-card__title">Datos generales</h3>
                  <div className="infomesas-row">
                    <span className="infomesas-label">Materias</span>
                    <span className="infomesas-value">
                      {resumenCab.materias?.length ? resumenCab.materias.join(" • ") : "-"}
                    </span>
                  </div>
                  <div className="infomesas-row">
                    <span className="infomesas-label">Fecha</span>
                    <span className="infomesas-value">{fmtFechaISO(resumenCab.fecha)}</span>
                  </div>
                  <div className="infomesas-row">
                    <span className="infomesas-label">Turno</span>
                    <span className="infomesas-value">{texto(resumenCab.turno)}</span>
                  </div>
                  <div className="infomesas-row">
                    <span className="infomesas-label">Mesas</span>
                    <span className="infomesas-value">
                      {resumenCab.mesas.length ? resumenCab.mesas.join(" • ") : "-"}
                    </span>
                  </div>
                </article>

                <article className="infomesas-card">
                  <h3 className="infomesas-card__title">Tribunal</h3>
                  <div className="infomesas-row">
                    <span className="infomesas-label">Docentes</span>
                    <span className="infomesas-value is-tribunal">
                      {docentesUnicos.length ? docentesUnicos.join(" | ") : "-"}
                    </span>
                  </div>
                </article>
              </div>
            </section>
          )}

          {/* ====== TAB: Alumnos ====== */}
          {active === "alumnos" && !loading && !error && (
            <section className="infomesas-tabpanel is-active">
              <div className="infomesas-table">
                <div className="infomesas-thead">
                  <div className="infomesas-th">Alumno</div>
                  <div className="infomesas-th">DNI</div>
                  {/* ✅ Cambiado "Curso / División" → "Curso" */}
                  <div className="infomesas-th">Curso</div>
                  <div className="infomesas-th">N° Mesa</div>
                </div>
                <div className="infomesas-tbody">
                  {alumnosTodos.length === 0 ? (
                    <div className="infomesas-row-empty">Sin alumnos.</div>
                  ) : (
                    alumnosTodos.map((a, i) => (
                      <div className="infomesas-tr" key={`${a.dni}-${i}`}>
                        <div className="infomesas-td">{texto(a.alumno)}</div>
                        <div className="infomesas-td">{texto(a.dni)}</div>
                        <div className="infomesas-td">{texto(a.curso_div)}</div>
                        <div className="infomesas-td">{texto(a.numero_mesa)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ====== TAB: Docentes (apilado 100% width + scroll propio) ====== */}
          {active === "docentes" && !loading && !error && (
            <section className="infomesas-tabpanel is-active">
              <div className="infomesas-docentes-scroll">
                <div className="infomesas-grid infomesas-grid--stack">
                  {docentesUnicos.length === 0 ? (
                    <div className="infomesas-row-empty">Sin docentes asignados.</div>
                  ) : (
                    docentesUnicos.map((doc, idx) => (
                      <article key={`${doc}-${idx}`} className="infomesas-card">
                        <h3 className="infomesas-card__title">Docente {idx + 1}</h3>
                        <div className="infomesas-row">
                          <span className="infomesas-label">Nombre</span>
                          <span className="infomesas-value">{texto(doc)}</span>
                        </div>
                        <div className="infomesas-row">
                          <span className="infomesas-label">Mesas</span>
                          <span className="infomesas-value">
                            {uniqPreserve(
                              mesasDetalle
                                .filter((m) => (m.docentes || []).includes(doc))
                                .map((m) => m.numero_mesa)
                                .filter(Boolean)
                            ).join(" • ") || "-"}
                          </span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ====== TAB: Por docente (con scroll propio) ====== */}
          {active === "por_docente" && !loading && !error && (
            <section className="infomesas-tabpanel is-active">
              <div className="infomesas-por-docente-scroll">
                {docentesUnicos.length === 0 ? (
                  <div className="infomesas-row-empty">Sin docentes asignados.</div>
                ) : (
                  docentesUnicos.map((doc) => {
                    const lista = alumnosPorDocente.get(doc) || [];
                    const mats = materiasPorDocente.get(doc) || [];
                    const matsText = mats.length ? mats.join(" • ") : "-";
                    return (
                      <article key={doc} className="infomesas-card infomesas-card--stretch" style={{ marginBottom: 12 }}>
                        <h3 className="infomesas-card__title">
                          Alumnos de {doc} — <span className="infomesas-muted">{matsText}</span>
                        </h3>
                        <div className="infomesas-table">
                          <div className="infomesas-thead">
                            <div className="infomesas-th">Alumno</div>
                            <div className="infomesas-th">DNI</div>
                            {/* ✅ Cambiado "Curso / División" → "Curso" */}
                            <div className="infomesas-th">Curso</div>
                            <div className="infomesas-th">N° Mesa</div>
                          </div>
                          <div className="infomesas-tbody">
                            {lista.length === 0 ? (
                              <div className="infomesas-row-empty">Sin alumnos asignados.</div>
                            ) : (
                              lista.map((a, i) => (
                                <div className="infomesas-tr" key={`${doc}-${a.dni}-${i}`}>
                                  <div className="infomesas-td">{texto(a.alumno)}</div>
                                  <div className="infomesas-td">{texto(a.dni)}</div>
                                  <div className="infomesas-td">{texto(a.curso_div)}</div>
                                  <div className="infomesas-td">{texto(a.numero_mesa)}</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalInfoMesas;

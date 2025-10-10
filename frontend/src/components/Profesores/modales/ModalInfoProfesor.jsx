// src/components/Profesores/modales/ModalInfoProfesor.jsx
import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
import "../../Previas/modales/ModalInfoPrevia.css";
import BASE_URL from "../../../config/config";

/**
 * Modal de información de un PROFESOR (usa la estética del ModalInfoPrevia).
 *
 * Props:
 *  - mostrar / open : boolean (visible u oculto)
 *  - idProfesor     : number (opcional; si viene, se hace fetch a action=profesores&id=...)
 *  - profesor       : object  (opcional; si viene, se muestra como fallback / merge)
 *  - onClose        : function
 */
const ModalInfoProfesor = ({ mostrar, open, idProfesor, profesor, onClose }) => {
  const isOpen = (typeof open === "boolean" ? open : mostrar) === true;
  const closeBtnRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [prof, setProf]       = useState(profesor || null);

  // -------- Helpers --------
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

  // Estado (badge)
  const estadoTxt = useMemo(() => {
    const p = prof || {};
    const raw = p.estado ?? p.activo ?? p.situacion ?? p.estado_laboral ?? p.baja ?? "";
    const s = String(raw).toLowerCase().trim();
    if (s === "1" || s === "true" || s === "activo" || s === "activa") return "ACTIVO";
    if (s === "0" || s === "false" || s === "baja" || s === "inactivo") return "BAJA";
    // si viene activo como 1/0 desde backend, ya lo normalizamos arriba, pero por compat:
    if (typeof raw === "number") return raw === 1 ? "ACTIVO" : raw === 0 ? "BAJA" : texto(raw);
    return texto(raw);
  }, [prof, texto]);

  const estadoClass = useMemo(() => {
    if (estadoTxt === "ACTIVO") return "is-ok";
    if (estadoTxt === "BAJA" || estadoTxt === "INACTIVO") return "is-pend";
    return "";
  }, [estadoTxt]);

  // -------- Fetch (cuando hay idProfesor) --------
  useEffect(() => {
    if (!isOpen) return;
    // foco en cerrar
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    // si ya tenemos profesor por props y no hay id, usamos ese
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

        const url = `${BASE_URL}/api.php?action=profesores&id=${encodeURIComponent(
          idProfesor
        )}`;
        const resp = await fetch(url, { method: "GET" });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const json = await resp.json();
        if (abort) return;

        if (!json?.exito) {
          throw new Error(json?.mensaje || "Error desconocido al obtener profesor");
        }
        const arr = Array.isArray(json?.profesores) ? json.profesores : [];
        const item = arr[0] || null;

        // merge con el profesor pasado por props si corresponde
        setProf(item || profesor || null);
      } catch (e) {
        if (!abort) {
          setError(e.message || String(e));
        }
      } finally {
        if (!abort) setLoading(false);
      }
    };

    fetchData();
    return () => {
      abort = true;
    };
  }, [isOpen, idProfesor, profesor]);

  if (!isOpen) return null;

  const P = prof || {}; // evita null
  const materias = Array.isArray(P.materias) ? P.materias : [];
  const catedras = Array.isArray(P.catedras) ? P.catedras : [];

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && onClose?.()
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="mi-modal-title-prof"
    >
      <div className="mi-modal__container" onClick={(e) => e.stopPropagation()}>
        {/* Header rojo */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="mi-modal-title-prof" className="mi-modal__title">
              Información del Profesor
            </h2>
            <p className="mi-modal__subtitle">
              {texto(P.nombre_completo)} &nbsp;|&nbsp; ID: {texto(P.id_profesor)}
            </p>
          </div>

          <button
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
            ref={closeBtnRef}
          >
            {/* ícono X */}
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

        {/* Contenido */}
        <div className="mi-modal__content">
          {loading && (
            <div className="mi-alert is-info" role="status">
              Cargando información del profesor...
            </div>
          )}

          {error && (
            <div className="mi-alert is-danger" role="alert">
              {String(error)}
            </div>
          )}

          {!loading && !error && (
            <section className="mi-tabpanel is-active">
              <div className="mi-grid">
                {/* Card: Identificación */}
                <article className="mi-card">
                  <h3 className="mi-card__title">Identificación</h3>

                  <div className="mi-row">
                    <span className="mi-label">ID</span>
                    <span className="mi-value">{texto(P.id_profesor)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Nombre</span>
                    <span className="mi-value">{texto(P.nombre_completo)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">DNI</span>
                    <span className="mi-value">{texto(P.dni ?? P.num_documento)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Cargo</span>
                    <span className="mi-value">
                      {texto(P.cargo_nombre)}{" "}
                      {P.id_cargo ? <small className="mi-dim"> (ID {P.id_cargo})</small> : null}
                    </span>
                  </div>
                </article>

                {/* Card: Turnos / Fechas */}
                <article className="mi-card">
                  <h3 className="mi-card__title">Disponibilidad</h3>

                  <div className="mi-row">
                    <span className="mi-label">Turno permitido (sí)</span>
                    <span className="mi-value">
                      {texto(P.turno_si_nombre)}{" "}
                      {P.id_turno_si ? <small className="mi-dim"> (ID {P.id_turno_si})</small> : null}
                    </span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Fecha sí</span>
                    <span className="mi-value">{fmtFechaISO(P.fecha_si)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Turno restringido (no)</span>
                    <span className="mi-value">
                      {texto(P.turno_no_nombre)}{" "}
                      {P.id_turno_no ? <small className="mi-dim"> (ID {P.id_turno_no})</small> : null}
                    </span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Fecha no</span>
                    <span className="mi-value">{fmtFechaISO(P.fecha_no)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Fecha de carga</span>
                    <span className="mi-value">{fmtFechaISO(P.fecha_carga)}</span>
                  </div>
                </article>

                {/* Card: Académico/Laboral (full width) */}
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Académico / Laboral</h3>

                  <div className="mi-row">
                    <span className="mi-label">Materia principal</span>
                    <span className="mi-value">{texto(P.materia_principal ?? P.materia_nombre)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Materias que dicta</span>
                    <span className="mi-value">
                      {materias.length === 0 ? (
                        "-"
                      ) : (
                        <div className="mi-chips">
                          {materias.map((m, i) => (
                            <span className="mi-chip" key={`${m}-${i}`}>{m}</span>
                          ))}
                        </div>
                      )}
                    </span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Total de materias</span>
                    <span className="mi-value">{texto(P.materias_total)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Estado</span>
                    <span className={`mi-value ${estadoClass}`}>{texto(estadoTxt)}</span>
                  </div>

                  <div className="mi-row">
                    <span className="mi-label">Motivo (si está en baja)</span>
                    <span className="mi-value">{texto(P.motivo)}</span>
                  </div>
                </article>

                {/* Card: Cátedras */}
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Cátedras (Curso – División — Materia)</h3>

                  {catedras.length === 0 ? (
                    <div className="mi-empty">Sin cátedras registradas.</div>
                  ) : (
                    <div className="mi-table-wrapper">
                      <table className="mi-table">
                        <thead>
                          <tr>
                            <th style={{ width: "30%" }}>Curso</th>
                            <th style={{ width: "20%" }}>División</th>
                            <th>Materia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catedras.map((c, idx) => (
                            <tr key={idx}>
                              <td>{texto(c.curso)}</td>
                              <td>{texto(c.division)}</td>
                              <td>{texto(c.materia)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

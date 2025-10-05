import React, { useEffect, useCallback, useMemo, useState } from "react";
import "./ModalInfoMesas.css";
import BASE_URL from "../../../config/config";

/**
 * Modal de información de una MESA DE EXAMEN con pestañas
 */
const ModalInfoMesas = ({ open, mesa, onClose }) => {
  const TABS = [
    { id: "mesa", label: "Mesa" },
    { id: "alumno", label: "Alumno" },
    { id: "docentes", label: "Docentes" },
  ];
  const [active, setActive] = useState(TABS[0].id);

  const [loading, setLoading] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState("");

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

  // Cargar detalle (vía router con CORS correcto)
  useEffect(() => {
    setActive(TABS[0].id);
    setDetalle(null);
    setError("");
    if (!open) return;

    const idMesa = mesa?.id_mesa ?? mesa?.id;
    if (!idMesa) return;

    const fetchDetalle = async () => {
      setLoading(true);
      try {
        const resp = await fetch(
          `${BASE_URL}/api.php?action=obtener_info_mesa&id_mesa=${encodeURIComponent(
            idMesa
          )}`,
          { cache: "no-store" }
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || `HTTP ${resp.status}`);
        }
        setDetalle(json.data);
      } catch (e) {
        setError(e?.message || "No se pudo obtener información de la mesa.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetalle();
  }, [open, mesa]);

  // Mezcla: usa "detalle" si existe; caso contrario, usa los campos que vinieron en "mesa"
  const M = useMemo(() => {
    const base = detalle || {};
    const src = { ...(mesa || {}), ...base };
    const tribunalArr = Array.isArray(src.tribunal)
      ? src.tribunal.filter(Boolean)
      : [src.docente_1, src.docente_2, src.docente_3].filter(Boolean);

    return {
      // IDs y relaciones
      id_mesa: src.id_mesa ?? src.id ?? "-",
      id_catedra: src.id_catedra ?? "-",
      id_previa: src.id_previa ?? "-",
      id_materia: src.id_materia ?? src.materia_id ?? "-",
      id_turno: src.id_turno ?? "-",

      // Mesa base (nombres legibles cuando existan)
      materia: src.materia ?? src.nombre_materia ?? "-",
      curso: src.curso_nombre ?? src.curso ?? "-",
      division: src.division_nombre ?? src.division ?? "-",
      fecha_mesa: src.fecha_mesa ?? src.fecha ?? "-",
      turno: src.turno ?? src.turno_nombre ?? "-",

      // Alumno (previas)
      dni: src.dni ?? "-",
      alumno: src.alumno ?? "-",
      id_condicion: src.id_condicion ?? "-",
      inscripcion: src.inscripcion ?? "-",
      anio: src.anio ?? "-",

      // Docentes (IDs + nombres)
      id_docente_1: src.id_docente_1 ?? "-",
      id_docente_2: src.id_docente_2 ?? "-",
      id_docente_3: src.id_docente_3 ?? "-",
      docente_1: src.docente_1 ?? "-",
      docente_2: src.docente_2 ?? "-",
      docente_3: src.docente_3 ?? "-",

      tribunal: tribunalArr,
    };
  }, [detalle, mesa]);

  if (!open) return null;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && onClose?.()
      }
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mi-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="mi-modal-title" className="mi-modal__title">
              Información de la Mesa
            </h2>
            <p className="mi-modal__subtitle">
              ID: {texto(M.id_mesa)} &nbsp;|&nbsp; {texto(M.materia)}
            </p>
          </div>
          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="mi-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`mi-tab ${active === t.id ? "is-active" : ""}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="mi-modal__content">
          {loading && <div className="mi-loader">Cargando información…</div>}
          {error && !loading && <div className="mi-error">⚠️ {error}</div>}

          {/* TAB: Mesa */}
          {active === "mesa" && (
            <section className="mi-tabpanel is-active">
              <div className="mi-grid mi-grid-mesa">
                <article className="mi-card">
                  <h3 className="mi-card__title">Mesa</h3>
                  <div className="mi-row"><span className="mi-label">ID Mesa</span><span className="mi-value">{texto(M.id_mesa)}</span></div>
                  <div className="mi-row"><span className="mi-label">Materia</span><span className="mi-value">{texto(M.materia)}</span></div>
                  <div className="mi-row"><span className="mi-label">Curso / División</span><span className="mi-value">{texto(M.curso)} {texto(M.division)}</span></div>
                  <div className="mi-row"><span className="mi-label">Fecha</span><span className="mi-value">{fmtFechaISO(M.fecha_mesa)}</span></div>
                  <div className="mi-row"><span className="mi-label">Turno</span><span className="mi-value">{texto(M.turno)}</span></div>
                </article>

                <article className="mi-card">
                  <h3 className="mi-card__title">Tribunal</h3>
                  <div className="mi-row">
                    <span className="mi-label">Docentes</span>
                    <span className="mi-value is-tribunal">
                      {M.tribunal?.length
                        ? M.tribunal.join(" | ")
                        : [M.docente_1, M.docente_2, M.docente_3]
                            .filter((x) => x && x !== "-")
                            .join(" | ") || "-"}
                    </span>
                  </div>
                </article>
              </div>
            </section>
          )}

          {/* TAB: Alumno */}
          {active === "alumno" && (
            <section className="mi-tabpanel is-active">
              <div className="mi-grid">
                <article className="mi-card">
                  <h3 className="mi-card__title">Alumno</h3>
                  <div className="mi-row"><span className="mi-label">DNI</span><span className="mi-value">{texto(M.dni)}</span></div>
                  <div className="mi-row"><span className="mi-label">Nombre y Apellido</span><span className="mi-value">{texto(M.alumno)}</span></div>
                  <div className="mi-row"><span className="mi-label">Condición</span><span className="mi-value">{texto(M.id_condicion)}</span></div>
                  <div className="mi-row"><span className="mi-label">Inscripción</span><span className="mi-value">{texto(M.inscripcion)}</span></div>
                  <div className="mi-row"><span className="mi-label">Año</span><span className="mi-value">{texto(M.anio)}</span></div>
                </article>
              </div>
            </section>
          )}

          {/* TAB: Docentes (3 tarjetas en fila en desktop) */}
          {active === "docentes" && (
            <section className="mi-tabpanel is-active">
              <div className="mi-grid mi-grid-docentes">
                {[1, 2, 3].map((n) => (
                  <article key={n} className="mi-card">
                    <h3 className="mi-card__title">Docente {n}</h3>
                    <div className="mi-row"><span className="mi-label">ID</span><span className="mi-value">{texto(M[`id_docente_${n}`])}</span></div>
                    <div className="mi-row"><span className="mi-label">Nombre</span><span className="mi-value">{texto(M[`docente_${n}`])}</span></div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalInfoMesas;

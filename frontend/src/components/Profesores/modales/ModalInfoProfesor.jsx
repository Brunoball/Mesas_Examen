// src/components/Profesores/modales/ModalInfoProfesor.jsx
import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
// Reutilizamos la hoja de estilos del modal rojo con tabs
import "../../Previas/modales/ModalInfoPrevia.css";

/**
 * Modal de información de un PROFESOR con estética del ModalInfoPrevia.
 *
 * Props:
 *  - mostrar : boolean (visible u oculto)  // compatible con tu implementación actual
 *  - open    : boolean (alias opcional; si lo pasás, también funciona)
 *  - profesor: objeto con datos del profesor
 *  - onClose : función para cerrar
 */
const ModalInfoProfesor = ({ mostrar, open, profesor, onClose }) => {
  const isOpen = (typeof open === "boolean" ? open : mostrar) === true;
  const closeBtnRef = useRef(null);

  // Helpers
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

  // Estado (badge) a partir de un campo común: activo/baja, estado=1/0, etc.
  const estadoTxt = useMemo(() => {
    const p = profesor || {};
    // intentamos varias llaves posibles
    const raw =
      p.estado ??
      p.activo ??
      p.situacion ??
      p.estado_laboral ??
      p.baja ??
      "";
    const s = String(raw).toLowerCase().trim();

    // normalizamos a "ACTIVO" / "BAJA" / "—"
    if (s === "1" || s === "true" || s === "activo" || s === "activa") return "ACTIVO";
    if (s === "0" || s === "false" || s === "baja" || s === "inactivo") return "BAJA";
    return texto(raw);
  }, [profesor, texto]);

  const estadoClass = useMemo(() => {
    if (estadoTxt === "ACTIVO") return "is-ok";
    if (estadoTxt === "BAJA" || estadoTxt === "INACTIVO") return "is-pend";
    return "";
  }, [estadoTxt]);

  // Reset de foco al abrir
  useEffect(() => {
    if (!isOpen) return;
    // enfoque al botón cerrar
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const P = profesor || {};

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
      <div
        className="mi-modal__container"
        onClick={(e) => e.stopPropagation()}
      >
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

        {/* (Opcional) Tabs vacías si en el futuro querés secciones; por ahora omitimos.
        <div className="mi-tabs">
          <button className="mi-tab is-active" type="button">General</button>
        </div>
        */}

        <div className="mi-modal__content">
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
                  <span className="mi-value">{texto(P.dni)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Legajo</span>
                  <span className="mi-value">{texto(P.legajo)}</span>
                </div>
              </article>



              {/* Card: Académico/Laboral (full width) */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Académico / Laboral</h3>

                <div className="mi-row">
                  <span className="mi-label">Materia principal</span>
                  <span className="mi-value">{texto(P.materia_principal)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Título / Formación</span>
                  <span className="mi-value">{texto(P.titulo)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Fecha de alta</span>
                  <span className="mi-value">{fmtFechaISO(P.fecha_alta)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Estado</span>
                  <span className={`mi-value ${estadoClass}`}>{texto(estadoTxt)}</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ModalInfoProfesor;

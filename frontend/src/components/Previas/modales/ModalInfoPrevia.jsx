// src/components/Previas/modales/ModalInfoPrevia.jsx
import React, { useEffect, useMemo, useCallback } from 'react';
import './ModalInfoPrevia.css';

/**
 * Modal de información de una PREVIA
 * Props:
 *  - open   : boolean (visible u oculto)
 *  - previa : objeto con los campos de la fila seleccionada
 *  - onClose: función para cerrar
 */
const ModalInfoPrevia = ({ open, previa, onClose }) => {
  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Helpers
  const texto = useCallback((v) => {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s === '' ? '-' : s;
  }, []);

  const fmtFechaISO = useCallback((v) => {
    if (!v || typeof v !== 'string') return '-';
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return v;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }, []);

  const P = previa || {};

  const inscEstado = useMemo(
    () => (Number(P?.inscripcion ?? 0) === 1 ? 'INSCRIPTO' : 'PENDIENTE'),
    [P]
  );

  if (!open) return null;

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains('mi-modal__overlay') && onClose?.()
      }
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Información de la Previa</h2>
            <p className="mi-modal__subtitle">
              ID: {texto(P.id_previa)} &nbsp;|&nbsp; {texto(P.alumno)}
            </p>
          </div>
          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="mi-modal__content">
          <section className="mi-tabpanel is-active">
            <div className="mi-grid">
              {/* Datos del alumno */}
              <article className="mi-card">
                <h3 className="mi-card__title">Alumno</h3>

                <div className="mi-row">
                  <span className="mi-label">Nombre</span>
                  <span className="mi-value">{texto(P.alumno)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">DNI</span>
                  <span className="mi-value">{texto(P.dni)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Año (de la previa)</span>
                  <span className="mi-value">{texto(P.anio)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Fecha de carga</span>
                  <span className="mi-value">{fmtFechaISO(P.fecha_carga)}</span>
                </div>
              </article>

              {/* Materia / Condición */}
              <article className="mi-card">
                <h3 className="mi-card__title">Materia</h3>

                <div className="mi-row">
                  <span className="mi-label">Materia</span>
                  <span className="mi-value">{texto(P.materia_nombre)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Condición</span>
                  <span className="mi-value">{texto(P.condicion_nombre)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Curso – División (Materia)</span>
                  <span className="mi-value">
                    {texto(P.materia_curso_nombre)} {texto(P.materia_division_nombre)}
                  </span>
                </div>
              </article>

              {/* Cursando / Estado */}
              <article className="mi-card">
                <h3 className="mi-card__title">Cursado & Estado</h3>

                <div className="mi-row">
                  <span className="mi-label">Curso (cursando)</span>
                  <span className="mi-value">{texto(P.cursando_curso_nombre)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">División (cursando)</span>
                  <span className="mi-value">{texto(P.cursando_division_nombre)}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Inscripción</span>
                  <span className={`mi-value ${inscEstado === 'INSCRIPTO' ? 'is-ok' : 'is-pend'}`}>
                    {inscEstado}
                  </span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ModalInfoPrevia;

// src/components/Profesores/modales/ModalInfoProfesor.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import './ModalInfoProfesor.css';

/**
 * Muestra información académica + disponibilidad + fecha de carga del docente.
 * Espera el shape que devuelve backend/modules/profesores/obtener_profesores.php
 */
const ModalInfoProfesor = ({ mostrar, profesor, onClose }) => {
  // Cerrar con ESC
  useEffect(() => {
    if (!mostrar) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mostrar, onClose]);

  // Acordeón de materias
  const [verMaterias, setVerMaterias] = useState(true);

  /* ================= Helpers ================= */
  const texto = useCallback((v) => {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s === '' ? '-' : s;
  }, []);

  const fmtFecha = useCallback((d) => {
    if (!d) return '-';
    // d ya viene como YYYY-MM-DD; lo mostramos “DD/MM/YYYY”
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, dd] = d.split('-');
      return `${dd}/${m}/${y}`;
    }
    return d; // fallback
  }, []);

  const P = profesor ?? {};

  // Nombre (por si en el futuro lo querés volver a mostrar)
  const nombreCompleto = useMemo(() => {
    const db = (P.nombre_completo || '').trim();
    const ap = (P.apellido || '').trim();
    const no = (P.nombre || '').trim();
    return db || `${ap} ${no}`.trim() || ap || no || '-';
  }, [P]);

  // Materias (derivadas/limpias)
  const materiaPrincipal = (P.materia_principal || '').trim();
  const materias = useMemo(() => {
    const lista = Array.isArray(P.materias)
      ? P.materias
      : (P.materia_principal ? [P.materia_principal] : []);
    return [...new Set(lista.filter(Boolean).map((s) => String(s).trim()))]
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [P]);
  const materiasTotal = Number(P?.materias_total ?? (materias.length || 0));

  // Cátedras: array de { curso, division, materia } que trae el backend
  const catedras = Array.isArray(P.catedras) ? P.catedras : [];

  // Si no está visible, no renderizamos nada
  if (!mostrar) return null;

  /* =============== Extracts =============== */
  const idProfesor      = P.id_profesor ?? '-';
  const cargo           = texto(P.cargo_nombre);
  const departamento    = texto(P.departamento || P.area);

  // Disponibilidad (de obtener_profesores.php)
  const turnoSiNom      = texto(P.turno_si_nombre);
  const fechaSiStr      = fmtFecha(P.fecha_si || null);

  const turnoNoNom      = texto(P.turno_no_nombre);
  const fechaNoStr      = fmtFecha(P.fecha_no || null);

  // Registro (solo fecha de carga, sin activo ni motivo)
  const fechaCargaStr   = fmtFecha(P.fecha_carga || null);

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains('mi-modal__overlay') && onClose?.()}
    >
      <div className="mi-modal__container" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {/* Header compacto */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Información del Docente</h2>
            <p className="mi-modal__subtitle">
              ID: {idProfesor} &nbsp;|&nbsp; {nombreCompleto}
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
              {/* Situación Académica */}
              <article className="mi-card">
                <h3 className="mi-card__title">Situación Académica</h3>

                <div className="mi-row">
                  <span className="mi-label">Cargo</span>
                  <span className="mi-value">{cargo}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Departamento</span>
                  <span className="mi-value">{departamento}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Materia principal</span>
                  <span className="mi-value">
                    {materiaPrincipal ? materiaPrincipal : '-'}
                    {materiasTotal > 1 && (
                      <span className="mi-badge" style={{ marginLeft: 8 }} title={`${materiasTotal} materias`}>
                        {materiasTotal}
                      </span>
                    )}
                  </span>
                </div>

                {/* Materias (acordeón) */}
                <div className="mi-accordion">
                  <button
                    type="button"
                    className={`mi-accordion__header ${verMaterias ? 'is-open' : ''}`}
                    onClick={() => setVerMaterias((v) => !v)}
                    aria-expanded={verMaterias}
                  >
                    <span>Materias que dicta</span>
                    <span className="mi-pill">{materiasTotal}</span>
                    <svg className="mi-caret" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>

                  <div className={`mi-accordion__body ${verMaterias ? 'is-open' : 'is-collapsed'}`}>
                    {materias.length === 0 ? (
                      <div className="mi-empty">Sin materias registradas</div>
                    ) : (
                      <ul className="mi-list">
                        {materias.map((m, i) => {
                          const esPrincipal = materiaPrincipal && m.toLowerCase() === materiaPrincipal.toLowerCase();
                          return (
                            <li key={`${m}-${i}`} className="mi-list__item">
                              <span className="mi-list__text">{m}</span>
                              {esPrincipal && <span className="mi-tag mi-tag--primary">Principal</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </article>

              {/* Disponibilidad: Turnos y Fechas */}
              <article className="mi-card">
                <h3 className="mi-card__title">Disponibilidad</h3>

                <div className="mi-row">
                  <span className="mi-label">Turno SÍ</span>
                  <span className="mi-value">{turnoSiNom}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Fecha SÍ</span>
                  <span className="mi-value">{fechaSiStr}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Turno NO</span>
                  <span className="mi-value">{turnoNoNom}</span>
                </div>

                <div className="mi-row">
                  <span className="mi-label">Fecha NO</span>
                  <span className="mi-value">{fechaNoStr}</span>
                </div>
              </article>

              {/* Registro (solo fecha de carga) */}
              <article className="mi-card">
                <h3 className="mi-card__title">Registro</h3>
                <div className="mi-row">
                  <span className="mi-label">Fecha de carga</span>
                  <span className="mi-value">{fechaCargaStr}</span>
                </div>
              </article>

              {/* Cátedras: Curso – División — Materia */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Cátedras (Curso – División — Materia)</h3>

                {catedras.length === 0 ? (
                  <div className="mi-empty">Sin cátedras registradas</div>
                ) : (
                  <div className="mi-table">
                    <div className="mi-thead">
                      <div className="mi-th">Curso</div>
                      <div className="mi-th">División</div>
                      <div className="mi-th">Materia</div>
                    </div>
                    <div className="mi-tbody">
                      {catedras.map((c, idx) => (
                        <div key={`cat-${idx}`} className="mi-tr">
                          <div className="mi-td">{texto(c.curso)}</div>
                          <div className="mi-td">{texto(c.division)}</div>
                          <div className="mi-td">{texto(c.materia)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ModalInfoProfesor;

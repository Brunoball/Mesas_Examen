import React, { useEffect, useRef } from 'react';
import { FaCheckCircle } from 'react-icons/fa';

const InscribirModal = ({ open, item, loading, error, onConfirm, onCancel }) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inscribir-modal-title"
      onMouseDown={onCancel}
    >
      <div
        className="logout-modal-container logout-modal--success"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div id='confirm-icon' className="logout-modal__icon is-success" aria-hidden="true">
          <FaCheckCircle />
        </div>

        <h3 id="inscribir-modal-title" className="logout-modal-title logout-modal-title--success">
          Confirmar inscripción
        </h3>

        <p className="logout-modal-text">
          ¿Querés inscribir manualmente a este alumno/a en la previa?
        </p>

        {item && (
          <div className="prev-modal-item" style={{ marginTop: 12 }}>
            <strong>{item.alumno}</strong> — DNI {item.dni}
            <br />
            Materia: {item.materia_nombre}
          </div>
        )}

        {error && (
          <div className="prev-modal-error" role="alert">
            {error}
          </div>
        )}

        <div className="logout-modal-buttons">
          <button
            type="button"
            className="logout-btn logout-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
          id='inscribirr'
            type="button"
            className="logout-btn logout-btn--solid-success"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Procesando...' : 'Inscribir'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InscribirModal;

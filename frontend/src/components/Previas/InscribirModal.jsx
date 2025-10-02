// src/components/Previas/InscribirModal.jsx
import React from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import './Previas.css'; // reutiliza estilos de modales si ya están aquí

const InscribirModal = ({ open, item, loading, error, onConfirm, onCancel }) => {
  if (!open) return null;

  return (
    <div className="prev-modal-backdrop" role="dialog" aria-modal="true">
      <div className="prev-modal">
        <div className="prev-modal-header">
          <h3><FaCheckCircle style={{ marginRight: 8 }} /> Inscribir alumno</h3>
        </div>

        <div className="prev-modal-body">
          <p>¿Confirmás inscribir manualmente este alumno a la mesa?</p>

          {item && (
            <div className="prev-modal-item">
              <strong>{item.alumno}</strong> — DNI {item.dni}<br />
              Materia: {item.materia_nombre}<br />
              Curso/División (Materia): {item.materia_curso_division}
            </div>
          )}

          {error && <div className="prev-modal-error">{error}</div>}
        </div>

        <div className="prev-modal-actions">
          <button
            className="prev-btn prev-hover prev-btn-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            className="prev-btn prev-hover prev-btn-affirm"
            onClick={onConfirm}
            disabled={loading}
            title="Confirmar inscripción"
          >
            {loading ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InscribirModal;

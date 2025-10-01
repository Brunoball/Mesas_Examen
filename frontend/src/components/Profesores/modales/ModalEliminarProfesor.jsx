import React, { useEffect } from 'react';
import { FaTrash, FaTimes } from 'react-icons/fa';
import './ModalEliminarProfesor.css';

const ModalEliminarProfesor = ({ mostrar, profesor, onClose, onEliminar }) => {
  // cerrar con ESC
  useEffect(() => {
    if (!mostrar) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mostrar, onClose]);

  if (!mostrar) return null;

  const id = profesor?.id_profesor ?? '';
  const nombreDB = profesor?.nombre_completo ?? '';

  return (
    <div className="pro-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div className="pro-modal-card">
        <div className="pro-modal-header">
          <h3 id="del-title" className="pro-modal-title">
            Eliminar profesor
          </h3>
          <button className="pro-modal-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="pro-modal-body">
          <p>
            ¿Confirmás eliminar al profesor <strong>{nombreDB || `ID ${id}`}</strong>?
          </p>
          {id && (
            <p className="pro-modal-muted">
              ID docente: <span className="pro-mono">{id}</span>
            </p>
          )}
          <p className="pro-modal-warning">
            Esta acción es <strong>definitiva</strong> y no se puede deshacer.
          </p>
        </div>

        <div className="pro-modal-actions">
          <button className="pro-btn" onClick={onClose}>Cancelar</button>
          <button
            className="pro-btn danger"
            onClick={() => onEliminar?.(id)}
            aria-label="Eliminar definitivamente"
            title="Eliminar definitivamente"
          >
            <FaTrash style={{ marginRight: 6 }} />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEliminarProfesor;

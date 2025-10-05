// src/components/Profesores/modales/ModalEliminarProfesor.jsx
import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

const ModalEliminarProfesor = ({ mostrar, profesor, onClose, onEliminar }) => {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!mostrar) return;
    cancelBtnRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Enter") handleConfirm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrar]);

  if (!mostrar) return null;

  const handleConfirm = () => {
    if (!profesor) return onClose?.();
    onEliminar?.(profesor.id_profesor);
  };

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eliminar-modal-title"
      onMouseDown={onClose}
    >
      <div
        className="logout-modal-container logout-modal--danger"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faTrash} />
        </div>

        <h3 id="eliminar-modal-title" className="logout-modal-title logout-modal-title--danger">
          Eliminar profesor
        </h3>

        <p className="logout-modal-text">
          ¿Confirmás que querés <strong>eliminar</strong> al profesor
          {profesor?.nombre_completo ? (
            <> <strong> “{profesor.nombre_completo}”</strong> (ID {profesor.id_profesor})</>
          ) : (
            <> con ID <strong>{profesor?.id_profesor}</strong></>
          )}
          ? Esta acción no se puede deshacer.
        </p>

        <div className="logout-modal-buttons">
          <button
            type="button"
            className="logout-btn logout-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="logout-btn logout-btn--solid-danger"
            onClick={handleConfirm}
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalEliminarProfesor;

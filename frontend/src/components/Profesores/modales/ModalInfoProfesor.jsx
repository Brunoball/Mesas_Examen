import React, { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";

const ModalInfoProfesor = ({ mostrar, profesor, onClose }) => {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!mostrar) return;
    closeBtnRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line
  }, [mostrar]);

  if (!mostrar) return null;

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
      onMouseDown={onClose}
    >
      <div
        className="logout-modal-container"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon" aria-hidden="true" style={{ color: "#1E293B" }}>
          <FontAwesomeIcon icon={faInfoCircle} />
        </div>

        <h3 id="info-modal-title" className="logout-modal-title">
          Información del profesor
        </h3>

        <div className="logout-modal-text" style={{ textAlign: "left" }}>
          <p><strong>ID:</strong> {profesor?.id_profesor ?? "-"}</p>
          <p><strong>Nombre:</strong> {profesor?.nombre_completo ?? "-"}</p>
          <p><strong>Materia principal:</strong> {profesor?.materia_principal ?? "-"}</p>
          {/* Agregá acá los demás campos que necesites mostrar */}
        </div>

        <div className="logout-modal-buttons">
          <button
            type="button"
            className="logout-btn logout-btn--ghost"
            onClick={onClose}
            ref={closeBtnRef}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalInfoProfesor;

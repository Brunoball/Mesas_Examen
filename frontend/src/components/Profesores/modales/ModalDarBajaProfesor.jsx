// src/components/Profesores/modales/ModalDarBajaProfesor.jsx
import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserMinus } from "@fortawesome/free-solid-svg-icons";

const ModalDarBajaProfesor = ({ mostrar, profesor, onClose, onDarBaja }) => {
  const cancelBtnRef = useRef(null);
  const motivoRef = useRef(null);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!mostrar) return;
    setMotivo("");
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
    const txt = motivo.trim();
    // Si tu backend requiere motivo obligatorio, validamos:
    if (!txt) {
      // feedback mínimo accesible (sin romper estilos existentes)
      motivoRef.current?.focus();
      return;
    }
    onDarBaja?.(profesor?.id_profesor, txt);
  };

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="baja-modal-title"
      onMouseDown={onClose}
    >
      <div
        className="logout-modal-container logout-modal--danger"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faUserMinus} />
        </div>

        <h3 id="baja-modal-title" className="logout-modal-title logout-modal-title--danger">
          Dar de baja profesor
        </h3>

        <p className="logout-modal-text">
          ¿Confirmás que querés <strong>dar de baja</strong> al profesor
          {profesor?.nombre_completo ? (
            <> <strong> “{profesor.nombre_completo}”</strong> (ID {profesor.id_profesor})</>
          ) : (
            <> con ID <strong>{profesor?.id_profesor}</strong></>
          )}
          ?
        </p>

        {/* Campo motivo (mantiene la estética general del modal) */}
        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label
            htmlFor="motivo-baja"
            style={{ display: "block", fontWeight: 600, marginBottom: 6 }}
          >
            Motivo de la baja <span style={{ color: "#d32f2f" }}>*</span>
          </label>
          <textarea
            id="motivo-baja"
            ref={motivoRef}
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Escribí el motivo…"
            style={{
              width: "100%",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              padding: "10px 12px",
              resize: "vertical",
              outline: "none",
              boxShadow: "none",
            }}
          />
        </div>

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
            Confirmar baja
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalDarBajaProfesor;

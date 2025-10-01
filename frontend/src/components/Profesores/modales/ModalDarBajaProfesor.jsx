import React, { useEffect, useState } from "react";
import { FaUserMinus, FaTimes } from "react-icons/fa";
import "./ModalDarBajaProfesor.css";

const MAX_LEN = 250;

const ModalDarBajaProfesor = ({ mostrar, profesor, onClose, onDarBaja }) => {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mostrar) {
      setMotivo("");
      setError("");
    }
  }, [mostrar]);

  useEffect(() => {
    if (!mostrar) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
        e.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mostrar, onClose]);

  if (!mostrar || !profesor) return null;

  const confirmar = () => {
    const txt = motivo.trim();
    if (!txt) {
      setError("Por favor, escribí el motivo de la baja.");
      return;
    }
    onDarBaja(profesor.id_profesor, txt); // <- este id_profesor corresponde a id_docente en la DB
  };

  const nombreProfesor = profesor?.nombre_completo ?? profesor?.nombre ?? "—";

  return (
    <div
      className="pro-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="probaja-title"
      onClick={onClose}
    >
      <div
        className="pro-modal-card pro-modal-card--baja"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pro-modal-header">
          <h3 id="probaja-title" className="pro-modal-title">
            Dar de baja profesor
          </h3>
          <button className="pro-modal-close" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>

        <div className="pro-modal-body">
          <div className="pro-baja-icon-container">
            <FaUserMinus className="pro-baja-icon" />
          </div>

          <p className="pro-baja-text">
            ¿Estás seguro de que querés dar de baja a{" "}
            <strong>{nombreProfesor}</strong>?
          </p>

          {profesor.id_profesor && (
            <p className="pro-modal-muted">
              ID docente: <span className="pro-mono">{profesor.id_profesor}</span>
            </p>
          )}

          <div className="pro-baja-field">
            <label htmlFor="probaja-motivo" className="pro-baja-label">
              Motivo de la baja <span className="pro-baja-asterisk">*</span>
            </label>
            <textarea
              id="probaja-motivo"
              className="pro-baja-textarea"
              placeholder="Escribí el motivo (obligatorio)"
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (error) setError("");
              }}
              rows={4}
              maxLength={MAX_LEN}
            />
            <div className="pro-baja-helper">
              {motivo.length}/{MAX_LEN}
            </div>
            {error && <div className="pro-baja-error">{error}</div>}
          </div>
        </div>

        <div className="pro-modal-actions">
          <button className="pro-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="pro-btn danger"
            onClick={confirmar}
            aria-label="Dar de baja definitivamente"
          >
            <FaUserMinus style={{ marginRight: 6 }} />
            Dar de baja
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalDarBajaProfesor;

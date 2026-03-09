import React, { useEffect } from "react";
import {
  FaExclamationTriangle,
  FaTimes,
  FaBan,
  FaUserGraduate,
  FaBook,
} from "react-icons/fa";
import "./ModalAvisoCorrelativa.css";

const ModalAvisoCorrelativa = ({ open, items = [], onClose }) => {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !Array.isArray(items) || items.length === 0) return null;

  const total = items.length;

  return (
    <div
      className="corr-alert"
      role="alertdialog"
      aria-live="assertive"
      aria-modal="false"
      aria-label="Aviso de correlativa bloqueada"
    >
      <div className="corr-alert__header">
        <div className="corr-alert__header-left">
          <div className="corr-alert__iconWrap">
            <FaExclamationTriangle className="corr-alert__icon" />
          </div>

          <div className="corr-alert__titles">
            <div className="corr-alert__title">Aviso de correlativa</div>
            <div className="corr-alert__subtitle">
              {total === 1
                ? "Se detectó 1 bloqueo por correlativa."
                : `Se detectaron ${total} bloqueos por correlativa.`}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="corr-alert__close"
          aria-label="Cerrar alerta"
          title="Cerrar"
        >
          <FaTimes />
        </button>
      </div>

      <div className="corr-alert__body">
        {items.map((item, idx) => (
          <article key={`corr-alert-${idx}`} className="corr-alert__card">
            <div className="corr-alert__row corr-alert__row--student">
              <span className="corr-alert__miniIcon">
                <FaUserGraduate />
              </span>
              <span className="corr-alert__student">
                {item.alumno || "Alumno sin nombre"}
              </span>
            </div>

            <div className="corr-alert__grid">
              <div className="corr-alert__block corr-alert__block--bad">
                <div className="corr-alert__label">
                  <FaBook className="corr-alert__labelIcon" />
                  Materia desaprobada
                </div>
                <div className="corr-alert__value">
                  <strong>{item.materia_desaprobada || "-"}</strong>
                  {item.curso_desaprobado ? ` (${item.curso_desaprobado})` : ""}
                </div>
              </div>

              <div className="corr-alert__arrow">
                <FaBan />
              </div>

              <div className="corr-alert__block corr-alert__block--blocked">
                <div className="corr-alert__label">
                  <FaBook className="corr-alert__labelIcon" />
                  Materia bloqueada
                </div>
                <div className="corr-alert__value">
                  <strong>{item.materia_bloqueada || "-"}</strong>
                  {item.curso_bloqueado ? ` (${item.curso_bloqueado})` : ""}
                  {item.numero_mesa_bloqueada
                    ? ` · Mesa ${item.numero_mesa_bloqueada}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="corr-alert__footer">
              El alumno no podrá rendir la materia siguiente hasta regularizar la
              correlativa.
            </div>
          </article>
        ))}
      </div>


    </div>
  );
};

export default ModalAvisoCorrelativa;
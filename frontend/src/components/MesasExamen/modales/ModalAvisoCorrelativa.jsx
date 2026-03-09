// ✅ NUEVO ARCHIVO
// src/components/MesasExamen/modales/ModalAvisoCorrelativa.jsx
import React from "react";

const ModalAvisoCorrelativa = ({ open, items = [], onClose }) => {
  if (!open || !Array.isArray(items) || items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        width: "min(420px, calc(100vw - 24px))",
        background: "#fff8f6",
        border: "1px solid rgba(231, 76, 60, 0.22)",
        borderLeft: "6px solid #e74c3c",
        borderRadius: 16,
        boxShadow: "0 14px 34px rgba(0,0,0,0.14)",
        padding: 16,
      }}
      role="alert"
      aria-live="assertive"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: "#b42318",
              marginBottom: 4,
            }}
          >
            Aviso de correlativa
          </div>

          <div style={{ fontSize: 13, color: "#7a271a" }}>
            El alumno no podrá rendir la materia siguiente.
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 18,
            cursor: "pointer",
            color: "#7a271a",
            lineHeight: 1,
          }}
          aria-label="Cerrar alerta"
          title="Cerrar"
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item, idx) => (
          <div
            key={`corr-alert-${idx}`}
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.06)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div
              style={{
                fontWeight: 900,
                color: "#1f2937",
                marginBottom: 6,
              }}
            >
              {item.alumno}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#374151",
                lineHeight: 1.45,
              }}
            >
              Desaprobó <strong>{item.materia_desaprobada}</strong>
              {item.curso_desaprobado ? ` (${item.curso_desaprobado})` : ""}.
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "#374151",
                lineHeight: 1.45,
              }}
            >
              Por eso no puede rendir <strong>{item.materia_bloqueada}</strong>
              {item.curso_bloqueado ? ` (${item.curso_bloqueado})` : ""}
              {item.numero_mesa_bloqueada
                ? ` · Mesa ${item.numero_mesa_bloqueada}`
                : ""}
              .
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ModalAvisoCorrelativa;
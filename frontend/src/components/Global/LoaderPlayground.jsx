// src/components/Global/LoaderPlayground.jsx
import React, { useMemo, useState } from "react";
import FullScreenLoader from "./FullScreenLoader";
import "./FullScreenLoader.css";

/**
 * Playground para previsualizar y tunear el FullScreenLoader en una ruta aparte.
 * Soporta query params:
 *  - ?title=Texto
 *  - ?subtitle=Texto
 *  - ?visible=0/1  (default 1)
 *
 * Ej: /dev/loader?title=Generando%20mesas&subtitle=Por%20favor%20espere...
 */
const LoaderPlayground = () => {
  const params = new URLSearchParams(window.location.search);

  const [title, setTitle] = useState(
    params.get("title") || "Creando mesas…"
  );
  const [subtitle, setSubtitle] = useState(
    params.get("subtitle") || "Asignando fechas y turnos automáticamente"
  );
  const [visible, setVisible] = useState(params.get("visible") !== "0");

  const shareUrl = useMemo(() => {
    const q = new URLSearchParams({
      title,
      subtitle,
      visible: visible ? "1" : "0",
    });
    return `/dev/loader?${q.toString()}`;
  }, [title, subtitle, visible]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 1200px at 10% -10%, #ee2, transparent), radial-gradient(1200px 1200px at 110% 110%, #e22, transparent), #0b0b0e",
        color: "#fff",
        padding: "16px",
      }}
    >
      {/* Loader en pantalla completa */}
      <FullScreenLoader visible={visible} title={title} subtitle={subtitle} />

      {/* Panel de control */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 900,
          margin: "0 auto",
          background: "rgba(20,20,28,.7)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 16,
          padding: 16,
          backdropFilter: "blur(6px)",
          boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        }}
      >
        <h2 style={{ margin: "0 0 8px" }}>Playground del Loader</h2>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Abrilo en otra pestaña y jugá con los textos/visibilidad.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Título</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.2)",
                background: "rgba(0,0,0,.25)",
                color: "#fff",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Subtítulo</span>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.2)",
                background: "rgba(0,0,0,.25)",
                color: "#fff",
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            onClick={() => setVisible((v) => !v)}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.25)",
              background: visible ? "#16a34a" : "#334155",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {visible ? "Ocultar loader" : "Mostrar loader"}
          </button>

          <button
            onClick={() => window.open(shareUrl, "_blank")}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.25)",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
            }}
            title="Abre esta misma vista en otra pestaña con los textos actuales."
          >
            Abrir en otra pestaña con estos parámetros
          </button>

          <a
            href={shareUrl}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.25)",
              color: "#fff",
              textDecoration: "none",
              background: "transparent",
            }}
            title="Link directo (clic para abrir en esta pestaña)"
          >
            Link directo (misma pestaña)
          </a>
        </div>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
          URL generada: <code>{shareUrl}</code>
        </div>
      </div>
    </div>
  );
};

export default LoaderPlayground;

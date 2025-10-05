import React from "react";
import "./FullScreenLoader.css";
import Escudo from "../../imagenes/Escudo.png";

/**
 * Loader minimalista: sólo escudo con efecto + textos.
 */
const FullScreenLoader = ({
  visible = false,
  title = "Creando mesas…",
}) => {
  if (!visible) return null;

  return (
    <div className="fsloader-overlay" role="alert" aria-live="polite">
      <div className="fsloader-center">
        <div className="fsloader-logo-wrap" aria-hidden>
          <img src={Escudo} alt="Escudo IPET 50" className="fsloader-logo" />
        </div>

        <div className="fsloader-text">
          <h2 className="fsloader-title">{title}</h2>
        </div>
      </div>
    </div>
  );
};

export default FullScreenLoader;

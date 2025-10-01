import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,              // Alumnos
  faUserPlus,           // Registro
  faClipboardList,      // Mesas de Examen
  faChalkboardTeacher,  // Profesores
  faSignOutAlt,         // Salir
  faFileAlt,            // Previas
  faBookOpen            // Cátedras (NUEVO)
} from "@fortawesome/free-solid-svg-icons";
import logoRH from "../../imagenes/Escudo.png";
import "./principal.css";

/* =========== Modal cierre de sesión ============= */
const ConfirmLogoutModal = ({ open, onClose, onConfirm }) => {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      onMouseDown={onClose}
    >
      <div
        className="logout-modal-container logout-modal--danger"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="logout-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 id="logout-modal-title" className="logout-modal-title logout-modal-title--danger">
          Confirmar cierre de sesión
        </h3>

        <p className="logout-modal-text">
          ¿Estás seguro de que deseas cerrar la sesión?
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
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

const Principal = () => {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      setUsuario(u || null);
    } catch {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem("ultimaBusqueda");
      localStorage.removeItem("ultimosResultados");
      localStorage.removeItem("alumnoSeleccionado");
      localStorage.removeItem("ultimaAccion");
    } catch {}
  }, []);

  // rol normalizado
  const role = (usuario?.rol || "").toLowerCase();
  const isAdmin = role === "admin";

  // ✅ Cajas del menú principal (AGREGADA CÁTEDRAS)
  const menuItems = [
    { icon: faClipboardList,     text: "Mesas de Examen", ruta: "/mesas-examen" },
    { icon: faFileAlt,           text: "Previas",         ruta: "/previas" },
    { icon: faBookOpen,          text: "Cátedras",        ruta: "/catedras" }, // NUEVA CAJA
    { icon: faChalkboardTeacher, text: "Profesores",      ruta: "/profesores" },
    { icon: faUserPlus,          text: "Registro",        ruta: "/registro" }
  ];

  // 🔒 Visibilidad por rol:
  // - Admin ve todo
  // - No admin: Alumnos, Previas y Cátedras (consulta)
  const visibleItems = isAdmin
    ? menuItems
    : menuItems.filter((m) => ["/alumnos", "/previas", "/catedras"].includes(m.ruta));

  const handleItemClick = (item) => {
    navigate(item.ruta);
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  };

  const handleCerrarSesion = () => setShowModal(true);

  const confirmarCierreSesion = () => {
    setIsExiting(true);
    setTimeout(() => {
      try { sessionStorage.clear(); } catch {}
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
      } catch {}
      setShowModal(false);
      navigate("/", { replace: true });
    }, 400);
  };

  return (
    <div className={`pagina-principal-container ${isExiting ? "slide-fade-out" : ""}`}>
      <div className="pagina-principal-card">
        <div className="pagina-principal-header">
          <div className="logo-container">
            <img src={logoRH} alt="Logo IPET 50" className="logo" />
          </div>
          <h1 className="title">
            Sistema de <span className="title-accent">Mesas de examen IPET 50</span>
          </h1>
          <p className="subtitle">
            {isAdmin ? "Panel de administración" : "Panel de consulta"}
          </p>
        </div>

        <div className="menu-container">
          <div className="menu-grid">
            {visibleItems.map((item, index) => (
              <button
                type="button"
                key={index}
                className="menu-button"
                onClick={() => handleItemClick(item)}
                aria-label={item.text}
              >
                <div className="button-icon">
                  <FontAwesomeIcon icon={item.icon} size="lg" />
                </div>
                <span className="button-text">{item.text}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="logout-button" onClick={handleCerrarSesion}>
          <FontAwesomeIcon icon={faSignOutAlt} className="logout-icon" />
          <span className="logout-text-full">Cerrar Sesión</span>
          <span className="logout-text-short">Salir</span>
        </button>

        <footer className="pagina-principal-footer">
          Desarrollado por{" "}
          <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
            3devs.solutions
          </a>
        </footer>
      </div>

      <ConfirmLogoutModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={confirmarCierreSesion}
      />
    </div>
  );
};

export default Principal;

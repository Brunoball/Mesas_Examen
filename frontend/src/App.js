// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

/* Login / Registro / Panel */
import Inicio from "./components/Login/Inicio";
import Principal from "./components/Principal/Principal";
import Registro from "./components/Login/Registro";

/* Profesores (admin) */
import Profesores from "./components/Profesores/Profesores";
import AgregarProfesor from "./components/Profesores/AgregarProfesor";
import EditarProfesor from "./components/Profesores/EditarProfesor";
import ProfesorBaja from "./components/Profesores/ProfesorBaja";

/* Previas */
import Previas from "./components/Previas/Previas";
import AgregarPrevia from "./components/Previas/AgregarPrevia";
import EditarPrevia from "./components/Previas/EditarPrevia";

/* Cátedras */
import Catedras from "./components/Catedras/Catedras";

/* Configurar Formulario (admin) */
import ConfigForm from "./components/ConfigFormulario/ConfigForm";

/* ✅ Mesas de Examen */
import MesasExamen from "./components/MesasExamen/MesasExamen";

/* 🆕 Playground del Loader (pestaña aparte para tunear el loader) */
import LoaderPlayground from "./components/Global/LoaderPlayground";

function App() {
  return (
    <Router>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />

        {/* Panel principal */}
        <Route path="/panel" element={<RutaProtegida componente={<Principal />} />} />

        {/* Mesas de Examen (protegido) */}
        <Route path="/mesas-examen" element={<RutaProtegida componente={<MesasExamen />} />} />

        {/* Profesores (solo ADMIN) */}
        <Route path="/profesores" element={<RutaAdmin componente={<Profesores />} />} />
        <Route path="/profesores/agregar" element={<RutaAdmin componente={<AgregarProfesor />} />} />
        <Route path="/profesores/editar/:id" element={<RutaAdmin componente={<EditarProfesor />} />} />
        <Route path="/profesores/baja" element={<RutaAdmin componente={<ProfesorBaja />} />} />

        {/* Previas (protegido) */}
        <Route path="/previas" element={<RutaProtegida componente={<Previas />} />} />
        <Route path="/previas/agregar" element={<RutaProtegida componente={<AgregarPrevia />} />} />
        <Route path="/previas/editar/:id_previa" element={<RutaProtegida componente={<EditarPrevia />} />} />

        {/* Cátedras (protegido) */}
        <Route path="/catedras" element={<RutaProtegida componente={<Catedras />} />} />

        {/* Configurar Formulario (solo ADMIN) */}
        <Route path="/config-formulario" element={<RutaAdmin componente={<ConfigForm />} />} />

        {/* 🆕 Ruta pública para abrir el loader en OTRA PESTAÑA y probarlo */}
        {/* Ej: /dev/loader?title=Generando%20mesas&subtitle=Aguarde... */}
        <Route path="/dev/loader" element={<LoaderPlayground />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

function RutaProtegida({ componente }) {
  const usuario = getUsuario();
  return usuario ? componente : <Navigate to="/" replace />;
}

function RutaAdmin({ componente }) {
  const usuario = getUsuario();
  const rol = (usuario?.rol || "").toLowerCase();
  if (!usuario) return <Navigate to="/" replace />;
  return rol === "admin" ? componente : <Navigate to="/panel" replace />;
}

export default App;

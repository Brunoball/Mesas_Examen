// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Inicio from './components/Login/Inicio';
import Principal from './components/Principal/Principal';
import Registro from './components/Login/Registro';

// 👩‍🏫 Profesores
import Profesores from './components/Profesores/Profesores';
import AgregarProfesor from './components/Profesores/AgregarProfesor';
import EditarProfesor from './components/Profesores/EditarProfesor';
import ProfesorBaja from './components/Profesores/ProfesorBaja';

// 📚 Previas
import Previas from './components/Previas/Previas';
import AgregarPrevia from './components/Previas/AgregarPrevia';
import EditarPrevia from './components/Previas/EditarPrevia'; // ⬅️ NUEVO

// 🏛️ Cátedras
import Catedras from './components/Catedras/Catedras';

function App() {
  return (
    <Router>
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<Inicio />} />
        {/* Si Registro debe ser público, dejalo así; si no, envolvelo con RutaProtegida */}
        <Route path="/registro" element={<Registro />} />

        {/* Panel principal */}
        <Route path="/panel" element={<RutaProtegida componente={<Principal />} />} />

        {/* Rutas de Profesores (sólo ADMIN) */}
        <Route path="/profesores" element={<RutaAdmin componente={<Profesores />} />} />
        <Route path="/profesores/agregar" element={<RutaAdmin componente={<AgregarProfesor />} />} />
        <Route path="/profesores/editar/:id" element={<RutaAdmin componente={<EditarProfesor />} />} />
        <Route path="/profesores/baja" element={<RutaAdmin componente={<ProfesorBaja />} />} />

        {/* Previas */}
        <Route path="/previas" element={<RutaProtegida componente={<Previas />} />} />
        <Route path="/previas/agregar" element={<RutaProtegida componente={<AgregarPrevia />} />} />
        <Route path="/previas/editar/:id_previa" element={<RutaProtegida componente={<EditarPrevia />} />} /> {/* ⬅️ NUEVO */}

        {/* Cátedras (acceso como Previas/Alumnos) */}
        <Route path="/catedras" element={<RutaProtegida componente={<Catedras />} />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario'));
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
  const rol = (usuario?.rol || '').toLowerCase();
  if (!usuario) return <Navigate to="/" replace />;
  return rol === 'admin' ? componente : <Navigate to="/panel" replace />;
}

export default App;

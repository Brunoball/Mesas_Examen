// src/components/inicio/Inicio.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BASE_URL from '../../config/config';
import '../Global/roots.css';
import './inicio.css';
import logoRH from '../../imagenes/Escudo.png';
import Toast from '../Global/Toast';

const STORAGE_KEYS = {
  rememberFlag: 'rememberLogin',
  user: 'remember_nombre',
  pass: 'remember_contrasena', // base64
};

// helper: decodificar JWT (payload)
function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const Inicio = () => {
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  // Estado del toast
  const [toast, setToast] = useState({ visible: false, tipo: 'info', mensaje: '', duracion: 3000 });

  const navigate = useNavigate();

  const mostrarToast = (tipo, mensaje, duracion = 3000) => {
    setToast({ visible: true, tipo, mensaje, duracion });
  };

  // Cargar datos recordados al montar
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rememberFlag) === '1';
    if (saved) {
      const savedUser = localStorage.getItem(STORAGE_KEYS.user) || '';
      const savedPassB64 = localStorage.getItem(STORAGE_KEYS.pass) || '';
      let savedPass = '';
      try {
        savedPass = savedPassB64 ? atob(savedPassB64) : '';
      } catch {
        savedPass = '';
      }
      setRemember(true);
      setNombre(savedUser);
      setContrasena(savedPass);
    }
  }, []);

  // Persistir/limpiar localStorage
  const persistRemember = (user, pass, flag) => {
    if (flag) {
      localStorage.setItem(STORAGE_KEYS.rememberFlag, '1');
      localStorage.setItem(STORAGE_KEYS.user, user ?? '');
      localStorage.setItem(STORAGE_KEYS.pass, btoa(pass ?? ''));
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberFlag);
      localStorage.removeItem(STORAGE_KEYS.user);
      localStorage.removeItem(STORAGE_KEYS.pass);
    }
  };

  // Si está activo "recordar", persiste a medida que se escribe
  useEffect(() => {
    if (remember) persistRemember(nombre, contrasena, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, contrasena, remember]);

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (cargando) return; // evita doble submit
    setCargando(true);

    if (!nombre || !contrasena) {
      mostrarToast('advertencia', 'Por favor complete todos los campos', 3000);
      setCargando(false);
      return;
    }

    try {
      const respuesta = await fetch(`${BASE_URL}/api.php?action=inicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, contrasena }),
        cache: 'no-store',
      });

      let data = null;
      try {
        data = await respuesta.json();
      } catch {
        // puede no venir cuerpo o no ser JSON
      }

      // Si el backend devuelve 200 + exito=false para credenciales inválidas
      if (respuesta.ok && data?.exito === false) {
        mostrarToast('error', data?.mensaje || 'Credenciales incorrectas.', 3500);
        setCargando(false);
        return;
      }

      // Otros errores no-2xx (mantengo por compatibilidad)
      if (!respuesta.ok) {
        mostrarToast(
          'error',
          data?.mensaje || `Error del servidor (${respuesta.status}). Intente más tarde.`,
          3500
        );
        setCargando(false);
        return;
      }

      // 2xx
      if (data?.exito) {
        // 1) Guardar token si vino
        const token = data.token;
        if (token) localStorage.setItem('token', token);

        // 2) Derivar rol desde diferentes fuentes
        const usuarioResp = data.usuario || {};
        let rol = (usuarioResp.rol || data.rol || '').toString().toLowerCase();

        // 3) Si no vino rol explícito, intentar leerlo del JWT
        if ((!rol || rol === '') && token && token.split('.').length === 3) {
          const payload = decodeJwtPayload(token);
          const fromJwt = (payload?.rol || payload?.role || payload?.scope || '')
            .toString()
            .toLowerCase();
          if (fromJwt) rol = fromJwt;
        }

        // 4) Default seguro
        if (!rol) rol = 'vista';

        // 5) Guardar usuario + rol
        const usuarioFinal = { ...usuarioResp, rol };
        localStorage.setItem('usuario', JSON.stringify(usuarioFinal));

        // Recordarme
        persistRemember(nombre, contrasena, remember);

        navigate('/panel');
      } else {
        // 2xx pero exito=false (fallback)
        mostrarToast('error', data?.mensaje || 'Credenciales incorrectas.', 3500);
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      mostrarToast('error', 'Error del servidor. Intente más tarde.', 3500);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      {toast.visible && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(t => ({ ...t, visible: false }))}
        />
      )}

      <div className="ini_contenedor">
        <div className="ini_encabezado">
          <img src={logoRH} alt="Cooperadora IPET 50" className="ini_logo" />
          <h1 className="ini_titulo">Iniciar Sesión</h1>
          <p className="ini_subtitulo">Ingresá tus credenciales para acceder al sistema</p>
        </div>

        <form onSubmit={manejarEnvio} className="ini_formulario" autoComplete="on" noValidate>
          <div className="ini_campo">
            <input
              type="text"
              placeholder="Usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="ini_input"
              autoComplete="username"
              inputMode="text"
            />
          </div>

          <div className="ini_campo ini_campo-password">
            <input
              type={showPassword ? 'text' : 'password'}
              className="ini_input"
              placeholder="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ini_toggle-password"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                {showPassword ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </>
                )}
              </svg>
            </button>
          </div>

          <div className="ini_check-row">
            <input
              id="recordar"
              type="checkbox"
              className="ini_checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="recordar" className="ini_check-label">Recordar cuenta</label>
          </div>

          <div className="ini_footer">
            <button
              type="submit"
              className="ini_boton"
              disabled={cargando}
              aria-busy={cargando ? 'true' : 'false'}
              aria-live="polite"
            >
              {cargando ? 'Iniciando...' : 'Iniciar Sesión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Inicio;

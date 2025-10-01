// src/components/inicio/Inicio.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BASE_URL from '../../config/config';
import './inicio.css';
import logoRH from '../../imagenes/Escudo.png';

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
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  const navigate = useNavigate();

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
    setMensaje('');

    if (!nombre || !contrasena) {
      setMensaje('Por favor complete todos los campos');
      setCargando(false);
      return;
    }

    try {
      const respuesta = await fetch(`${BASE_URL}/api.php?action=inicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, contrasena }),
      });

      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

      const data = await respuesta.json();

      if (data?.exito) {
        // 1) Guardar token
        const token = data.token;
        if (token) localStorage.setItem('token', token);

        // 2) Derivar rol desde diferentes fuentes
        const usuarioResp = data.usuario || {};
        let rol =
          (usuarioResp.rol || data.rol || '').toString().toLowerCase();

        // 3) Si no vino rol explícito, intentar leerlo del JWT
        if ((!rol || rol === '') && token && token.split('.').length === 3) {
          const payload = decodeJwtPayload(token);
          const fromJwt =
            (payload?.rol || payload?.role || payload?.scope || '').toString().toLowerCase();
          if (fromJwt) rol = fromJwt;
        }

        // 4) Por seguridad, si no hay rol, default a 'vista' (más restrictivo)
        if (!rol) rol = 'vista';

        // 5) Guardar usuario + rol unificado
        const usuarioFinal = {
          ...usuarioResp,
          rol, // <- acá queda persistido
        };
        localStorage.setItem('usuario', JSON.stringify(usuarioFinal));

        // Mantener o limpiar recordatorio según el check
        persistRemember(nombre, contrasena, remember);

        navigate('/panel');
      } else {
        setMensaje(data?.mensaje || 'Credenciales incorrectas');
      }
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setMensaje('Error del servidor. Intente más tarde.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <div className="ini_contenedor">
        <div className="ini_encabezado">
          <img src={logoRH} alt="Cooperadora IPET 50" className="ini_logo" />
          <h1 className="ini_titulo">Iniciar Sesión</h1>
          <p className="ini_subtitulo">Ingresá tus credenciales para acceder al sistema</p>
        </div>

        {mensaje && <p className="ini_mensaje">{mensaje}</p>}

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

          {/* Checkbox Recordar cuenta */}
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

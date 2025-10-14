// src/components/Profesores/EditarProfesor.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft, faUser, faBriefcase } from '@fortawesome/free-solid-svg-icons';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';

// ⬅️ Reusamos la misma hoja de estilos de Editar/Agregar Previa
import '../Previas/AgregarPrevia.css';
import '../Global/roots.css';
import './EditarProfesor.css';

const toMayus = (v) => (typeof v === 'string' ? v.toUpperCase() : v);

// Split seguro "APELLIDO, NOMBRE" -> [apellido, nombre]
const splitNyAP = (fullName = '') => {
  const s = String(fullName || '').trim();
  if (!s) return ['', ''];
  if (s.includes(',')) {
    const [ap, no] = s.split(',', 2).map((t) => t.trim());
    return [ap || '', no || ''];
  }
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const apellido = parts.pop() || '';
    const nombre = parts.join(' ');
    return [apellido.trim(), nombre.trim()];
  }
  return ['', s];
};

// Abre el datepicker al clickear contenedor/label
const useClickOpensDatepicker = () => {
  const ref = useRef(null);
  const openCalendar = (e) => {
    if (e && e.type === 'mousedown') e.preventDefault();
    const el = ref.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };
  return { ref, openCalendar };
};

const EditarProfesor = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Datos del form
  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [idCargo, setIdCargo] = useState('');
  const [cargos, setCargos] = useState([]);

  const [turnos, setTurnos] = useState([]); // [{id_turno, turno}]
  const [idTurnoNo, setIdTurnoNo] = useState(''); // dejamos "Turno NO"
  const [fechaNo, setFechaNo] = useState('');     // dejamos "Fecha NO"
  const [fechaCarga, setFechaCarga] = useState('');

  const fechaNoCtl = useClickOpensDatepicker();
  const fechaCargaCtl = useClickOpensDatepicker();

  const [idProfesor, setIdProfesor] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'exito' });
  const showToast = (message, type = 'exito') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2500);
  };

  // Cargar datos
  useEffect(() => {
    const ctrl = new AbortController();
    const cargar = async () => {
      try {
        setCargando(true);
        setError('');
        const res = await fetch(
          `${BASE_URL}/api.php?action=editar_profesor&id=${encodeURIComponent(id)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (!data?.exito) throw new Error(data?.mensaje || 'No se pudo cargar el profesor');

        const p = data.profesor || {};
        setIdProfesor(p.id_profesor ?? id);

        const [ap, no] = splitNyAP(p.nombre_completo || p.docente || '');
        setApellido(toMayus(ap));
        setNombre(toMayus(no));
        setIdCargo(p.id_cargo ?? '');

        // Solo dejamos Turno NO y Fecha NO
        setIdTurnoNo(p.id_turno_no ?? '');
        setFechaNo(p.fecha_no ?? '');
        setFechaCarga(p.fecha_carga ?? '');

        setCargos(Array.isArray(data.cargos) ? data.cargos : []);
        setTurnos(Array.isArray(data.turnos) ? data.turnos : []);
      } catch (e) {
        if (e.name !== 'AbortError') {
          setError(e.message || 'Error al cargar');
        }
      } finally {
        setCargando(false);
      }
    };
    if (id) cargar();
    return () => ctrl.abort();
  }, [id]);

  // Guardar
  const guardar = async (e) => {
    e.preventDefault();

    if (!apellido.trim()) {
      showToast('El apellido es obligatorio', 'error');
      return;
    }
    if (!idCargo) {
      showToast('Debés seleccionar un cargo', 'error');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=editar_profesor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_profesor: idProfesor,
          apellido: toMayus(apellido.trim()),
          nombre: nombre.trim() ? toMayus(nombre.trim()) : null,
          id_cargo: idCargo,

          // Eliminados turno/fecha SÍ
          id_turno_no: idTurnoNo === '' ? null : Number(idTurnoNo),
          fecha_no: fechaNo || null,
          fecha_carga: fechaCarga || null,
        }),
      });
      const json = await res.json();
      if (json?.exito) {
        showToast('Profesor actualizado correctamente', 'exito');
        setTimeout(() => navigate('/profesores'), 900);
      } else {
        showToast(json?.mensaje || 'No se pudo actualizar', 'error');
      }
    } catch (e2) {
      showToast('Error al guardar: ' + e2.message, 'error');
    }
  };

  const hasVal = (v) => v !== null && v !== undefined && String(v).trim() !== '';

  return (
    <>
      {toast.show && (
        <Toast
          tipo={toast.type}
          mensaje={toast.message}
          onClose={() => setToast((prev) => ({ ...prev, show: false }))}
          duracion={2500}
        />
      )}

      <div className="prev-add-container">
        <div className="prev-add-box">
          {/* Header con gradiente + volver */}
          <div className="prev-add-header">
            <div className="prev-add-icon-title">
              <FontAwesomeIcon icon={faUser} className="prev-add-icon" aria-hidden="true" />
              <div>
                <h1>Editar Profesor {idProfesor ? `#${idProfesor}` : ''}</h1>
                <p>{[apellido, nombre].filter(Boolean).join(', ') || 'Modificá los datos del profesor'}</p>
              </div>
            </div>

            <button
              type="button"
              className="prev-add-back-btn"
              onClick={() => navigate(-1)}
              title="Volver"
            >
              <FontAwesomeIcon icon={faArrowLeft} style={{ marginRight: 8 }} />
              Volver
            </button>
          </div>

          <div className="prev-add-form-wrapper">
            {error && <div className="prev-add-alert error">{error}</div>}

            <form onSubmit={guardar} className="prev-add-form">
              {/* === Grid 3 columnas === */}
              <div className="prev-add-grid">
                {/* Sección 1: Datos del profesor */}
                <div className="prev-section">
                  <h3 className="prev-section-title">Datos del profesor</h3>

                  <div className={`prev-input-wrapper ${hasVal(apellido) ? 'has-value' : ''}`}>
                    <label className="prev-label">Apellido *</label>
                    <input
                      className="prev-input"
                      name="apellido"
                      value={apellido}
                      onChange={(e) => setApellido(toMayus(e.target.value))}
                      placeholder="Ej: GÓMEZ"
                      required
                    />
                    <span className="prev-input-highlight" />
                  </div>

                  <div className={`prev-input-wrapper ${hasVal(nombre) ? 'has-value' : ''}`}>
                    <label className="prev-label">Nombre</label>
                    <input
                      className="prev-input"
                      name="nombre"
                      value={nombre}
                      onChange={(e) => setNombre(toMayus(e.target.value))}
                      placeholder="Ej: ANA MARÍA"
                    />
                    <span className="prev-input-highlight" />
                  </div>
                </div>

                {/* Sección 2: Cargo + Fecha de carga */}
                <div className="prev-section">
                  <h3 className="prev-section-title">Cargo</h3>

                  <div className="prev-input-wrapper always-active">
                    <label className="prev-label">
                      <FontAwesomeIcon icon={faBriefcase} />&nbsp;Cargo *
                    </label>
                    <select
                      className="prev-input"
                      name="id_cargo"
                      value={idCargo || ''}
                      onChange={(e) => setIdCargo(e.target.value)}
                      disabled={cargando}
                      required
                    >
                      <option value="" disabled>Seleccionar…</option>
                      {cargos.map((c) => (
                        <option key={c.id_cargo} value={c.id_cargo}>
                          {c.cargo}
                        </option>
                      ))}
                    </select>
                    <span className="prev-input-highlight" />
                  </div>

                  {/* Fecha de carga */}
                  <div className="prev-input-wrapper always-active">
                    <label className="prev-label">Fecha de carga</label>
                    <input
                      ref={fechaCargaCtl.ref}
                      className="prev-input"
                      type="date"
                      name="fecha_carga"
                      value={fechaCarga || ''}
                      onChange={(e) => setFechaCarga(e.target.value)}
                      onMouseDown={fechaCargaCtl.openCalendar}
                      onFocus={fechaCargaCtl.openCalendar}
                    />
                    <span className="prev-input-highlight" />
                  </div>
                </div>

                {/* Sección 3: Turno NO + Fecha NO (únicos) */}
                <div className="prev-section">
                  <h3 className="prev-section-title">Turnos</h3>

                  <div className="prev-rowsd">
                    <div className="prev-col">
                      <div className="prev-input-wrapper always-active">
                        <label className="prev-label">Turno NO</label>
                        <select
                          className="prev-input"
                          name="id_turno_no"
                          value={idTurnoNo === null ? '' : idTurnoNo || ''}
                          onChange={(e) => setIdTurnoNo(e.target.value)}
                          disabled={cargando}
                        >
                          <option value="">Seleccionar…</option>
                          {turnos.map((t) => (
                            <option key={t.id_turno} value={t.id_turno}>
                              {t.turno}
                            </option>
                          ))}
                        </select>
                        <span className="prev-input-highlight" />
                      </div>
                    </div>

                    <div className="prev-col">
                      <div className="prev-input-wrapper always-active">
                        <label className="prev-label">Fecha NO</label>
                        <input
                          ref={fechaNoCtl.ref}
                          className="prev-input"
                          type="date"
                          name="fecha_no"
                          value={fechaNo || ''}
                          onChange={(e) => setFechaNo(e.target.value)}
                          onMouseDown={fechaNoCtl.openCalendar}
                          onFocus={fechaNoCtl.openCalendar}
                        />
                        <span className="prev-input-highlight" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botonera inferior (botón rojo como en Editar Previa) */}
              <div className="prev-add-buttons">
                <button
                  type="submit"
                  className="prev-add-button"
                  disabled={cargando}
                  title="Guardar"
                >
                  <FontAwesomeIcon icon={faSave} style={{ marginRight: 8 }} />
                  <span className="prev-add-button-text">
                    {cargando ? 'Guardando...' : 'Guardar Cambios'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default EditarProfesor;

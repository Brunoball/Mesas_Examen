// src/components/Profesores/EditarProfesor.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft, faUser, faBriefcase } from '@fortawesome/free-solid-svg-icons';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';
import './EditarProfesor.css';

const toMayus = (v) => (typeof v === 'string' ? v.toUpperCase() : v);

// Split seguro "APELLIDO, NOMBRE" -> [apellido, nombre]
const splitNyAP = (fullName = '') => {
  const s = String(fullName || '').trim();
  if (!s) return ['', ''];
  if (s.includes(',')) {
    const [ap, no] = s.split(',', 2).map(t => t.trim());
    return [ap || '', no || ''];
  }
  // fallback: último token como apellido
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const apellido = parts.pop() || '';
    const nombre = parts.join(' ');
    return [apellido.trim(), nombre.trim()];
  }
  return ['', s];
};

// helper: hace que clickear el contenedor abra el datepicker
const useClickOpensDatepicker = () => {
  const ref = useRef(null);
  const onContainerClick = () => {
    const el = ref.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };
  return { ref, onContainerClick };
};

const EditarProfesor = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Campos mínimos pedidos
  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [idCargo, setIdCargo] = useState('');
  const [cargos, setCargos] = useState([]);

  // 🔹 Nuevos campos
  const [turnos, setTurnos] = useState([]);        // [{id_turno, turno}]
  const [idTurnoSi, setIdTurnoSi] = useState('');  // puede ser ''
  const [idTurnoNo, setIdTurnoNo] = useState('');  // puede ser ''
  const [fechaSi, setFechaSi] = useState('');      // YYYY-MM-DD o ''
  const [fechaNo, setFechaNo] = useState('');      // YYYY-MM-DD o ''
  const [fechaCarga, setFechaCarga] = useState(''); // YYYY-MM-DD (editable)

  const fechaSiCtl = useClickOpensDatepicker();
  const fechaNoCtl = useClickOpensDatepicker();
  const fechaCargaCtl = useClickOpensDatepicker();

  const [idProfesor, setIdProfesor] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'exito' });
  const showToast = (message, type = 'exito') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  // CARGA
  const cargar = async (signal) => {
    try {
      setCargando(true);
      const res = await fetch(`${BASE_URL}/api.php?action=editar_profesor&id=${encodeURIComponent(id)}`, { signal });
      const data = await res.json();

      if (!data?.exito) {
        showToast(data?.mensaje || 'No se pudo cargar el profesor', 'error');
        return;
      }

      const p = data.profesor || {};
      setIdProfesor(p.id_profesor ?? id);

      const [ap, no] = splitNyAP(p.nombre_completo || p.docente || '');
      setApellido(toMayus(ap));
      setNombre(toMayus(no));
      setIdCargo(p.id_cargo ?? '');

      // 🔹 Nuevos campos desde backend
      setIdTurnoSi(p.id_turno_si ?? '');
      setIdTurnoNo(p.id_turno_no ?? '');
      setFechaSi(p.fecha_si ?? '');
      setFechaNo(p.fecha_no ?? '');
      setFechaCarga(p.fecha_carga ?? '');

      // Listas
      setCargos(Array.isArray(data.cargos) ? data.cargos : []);
      setTurnos(Array.isArray(data.turnos) ? data.turnos : []);
    } catch (e) {
      if (e.name !== 'AbortError') showToast('Error de red al cargar: ' + e.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    if (id) cargar(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // GUARDAR
  const guardar = async () => {
    if (!apellido.trim()) return showToast('El apellido es obligatorio', 'error');
    if (!idCargo) return showToast('Debés seleccionar un cargo', 'error');

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=editar_profesor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_profesor: idProfesor,
          apellido: toMayus(apellido.trim()),
          nombre: nombre.trim() ? toMayus(nombre.trim()) : null,
          id_cargo: idCargo,

          // 🔹 Nuevos campos (permitir null)
          id_turno_si: idTurnoSi === '' ? null : Number(idTurnoSi),
          id_turno_no: idTurnoNo === '' ? null : Number(idTurnoNo),
          fecha_si: fechaSi || null,
          fecha_no: fechaNo || null,

          // 🔹 fecha_carga editable
          fecha_carga: fechaCarga || null,
        }),
      });
      const json = await res.json();
      if (json?.exito) {
        showToast('Profesor actualizado correctamente', 'exito');
        setTimeout(() => navigate('/profesores'), 800);
      } else {
        showToast(json?.mensaje || 'No se pudo actualizar', 'error');
      }
    } catch (e) {
      showToast('Error al guardar: ' + e.message, 'error');
    }
  };

  return (
    <div className="edit-socio-container">
      {toast.show && (
        <Toast
          tipo={toast.type}
          mensaje={toast.message}
          onClose={() => setToast(prev => ({ ...prev, show: false }))}
          duracion={3000}
        />
      )}

      <div className="edit-socio-box edit-socio-animate-in" role="region" aria-label="Editar profesor">
        <div className="edit-socio-header">
          {cargando ? (
            <div className="edit-socio-header-skel">
              <div className="skel skel-title" />
              <div className="skel skel-subtitle" />
            </div>
          ) : (
            <>
              <h2 className="edit-socio-title">
                <FontAwesomeIcon icon={faUser} className="edit-socio-tab-icon" />
                &nbsp;Editar Profesor #{idProfesor}
              </h2>
              <div className="edit-socio-subtitle">
                {[apellido, nombre].filter(Boolean).join(', ')}
              </div>
            </>
          )}
        </div>

        {cargando ? (
          <div className="edit-socio-form">
            <div className="edit-socio-tab-content">
              <div className="edit-socio-input-group">
                <div className="skel skel-input" />
                <div className="skel skel-input" />
              </div>
              <div className="edit-socio-input-group">
                <div className="skel skel-input" />
              </div>
            </div>
            <div className="edit-socio-buttons-container">
              <div className="skel skel-btn" />
              <div className="skel skel-btn" />
            </div>
          </div>
        ) : (
          <form className="edit-socio-form" onSubmit={(e) => e.preventDefault()}>
            <div className="edit-socio-tab-content">
              {/* Apellido / Nombre */}
              <div className="edit-socio-input-group">
                <div className="edit-socio-floating-label-wrapper">
                  <input
                    type="text"
                    value={apellido}
                    onChange={(e) => setApellido(toMayus(e.target.value))}
                    placeholder=" "
                    className="edit-socio-input"
                    id="apellido"
                    required
                  />
                  <label htmlFor="apellido" className={`edit-socio-floating-label ${apellido ? 'edit-socio-floating-label-filled' : ''}`}>
                    Apellido *
                  </label>
                </div>

                <div className="edit-socio-floating-label-wrapper">
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(toMayus(e.target.value))}
                    placeholder=" "
                    className="edit-socio-input"
                    id="nombre"
                  />
                  <label htmlFor="nombre" className={`edit-socio-floating-label ${nombre ? 'edit-socio-floating-label-filled' : ''}`}>
                    Nombre
                  </label>
                </div>
              </div>

              {/* Cargo + Fecha de carga (MISMA FILA) */}
              <div className="edit-socio-input-group">
                <div className="edit-fl-wrapper always-active" style={{ width: '100%' }}>
                  <label htmlFor="id_cargo" className="edit-fl-label">
                    <FontAwesomeIcon icon={faBriefcase} /> Cargo *
                  </label>
                  <select
                    id="id_cargo"
                    value={idCargo || ''}
                    onChange={(e) => setIdCargo(e.target.value)}
                    className="edit-socio-input edit-select"
                  >
                    <option value="" disabled>Seleccione un cargo</option>
                    {cargos.map(c => (
                      <option key={c.id_cargo} value={c.id_cargo}>{c.cargo}</option>
                    ))}
                  </select>
                </div>

                <div
                  className="edit-socio-floating-label-wrapper"
                  onClick={fechaCargaCtl.onContainerClick}
                  style={{ width: '100%' }}
                >
                  <input
                    ref={fechaCargaCtl.ref}
                    type="date"
                    value={fechaCarga || ''}
                    onChange={(e) => setFechaCarga(e.target.value)}
                    placeholder=" "
                    className="edit-socio-input"
                    id="fecha_carga"
                    required
                  />
                  <label htmlFor="fecha_carga" className={`edit-socio-floating-label ${fechaCarga ? 'edit-socio-floating-label-filled' : ''}`}>
                    Fecha de carga
                  </label>
                </div>
              </div>

              {/* Turno SÍ + Fecha SÍ */}
              <div className="edit-socio-input-group">
                <div className="edit-fl-wrapper always-active">
                  <label htmlFor="id_turno_si" className="edit-fl-label">Turno SÍ</label>
                  <select
                    id="id_turno_si"
                    value={idTurnoSi === null ? '' : (idTurnoSi || '')}
                    onChange={(e) => setIdTurnoSi(e.target.value)}
                    className="edit-socio-input edit-select"
                  >
                    <option value="">Seleccionar...</option>
                    {turnos.map(t => (
                      <option key={t.id_turno} value={t.id_turno}>{t.turno}</option>
                    ))}
                  </select>
                </div>

                <div
                  className="edit-socio-floating-label-wrapper"
                  onClick={fechaSiCtl.onContainerClick}
                >
                  <input
                    ref={fechaSiCtl.ref}
                    type="date"
                    value={fechaSi || ''}
                    onChange={(e) => setFechaSi(e.target.value)}
                    placeholder=" "
                    className="edit-socio-input"
                    id="fecha_si"
                  />
                  <label htmlFor="fecha_si" className={`edit-socio-floating-label ${fechaSi ? 'edit-socio-floating-label-filled' : ''}`}>
                    Fecha SÍ
                  </label>
                </div>
              </div>

              {/* Turno NO + Fecha NO */}
              <div className="edit-socio-input-group">
                <div className="edit-fl-wrapper always-active">
                  <label htmlFor="id_turno_no" className="edit-fl-label">Turno NO</label>
                  <select
                    id="id_turno_no"
                    value={idTurnoNo === null ? '' : (idTurnoNo || '')}
                    onChange={(e) => setIdTurnoNo(e.target.value)}
                    className="edit-socio-input edit-select"
                  >
                    <option value="">Seleccionar...</option>
                    {turnos.map(t => (
                      <option key={t.id_turno} value={t.id_turno}>{t.turno}</option>
                    ))}
                  </select>
                </div>

                <div
                  className="edit-socio-floating-label-wrapper"
                  onClick={fechaNoCtl.onContainerClick}
                >
                  <input
                    ref={fechaNoCtl.ref}
                    type="date"
                    value={fechaNo || ''}
                    onChange={(e) => setFechaNo(e.target.value)}
                    placeholder=" "
                    className="edit-socio-input"
                    id="fecha_no"
                  />
                  <label htmlFor="fecha_no" className={`edit-socio-floating-label ${fechaNo ? 'edit-socio-floating-label-filled' : ''}`}>
                    Fecha NO
                  </label>
                </div>
              </div>
            </div>

            <div className="edit-socio-buttons-container">
              <button
                type="button"
                onClick={guardar}
                className="edit-socio-button"
                aria-label="Guardar"
                title="Guardar"
              >
                <FontAwesomeIcon icon={faSave} className="edit-socio-icon-button" />
                <span className="btn-text">Guardar</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/profesores')}
                className="edit-socio-back-button"
                aria-label="Volver"
                title="Volver"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="edit-socio-icon-button" />
                <span className="btn-text">Volver</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditarProfesor;

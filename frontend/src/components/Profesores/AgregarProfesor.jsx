// src/components/Profesores/AgregarProfesor.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';
import './AgregarProfesor.css';

const toUpper = (v) => (typeof v === 'string' ? v.toUpperCase() : v);
const trimSpaces = (s) => (s || '').replace(/\s+/g, ' ').trim();

const useClickOpensDatepicker = () => {
  const ref = useRef(null);
  const onClick = () => {
    const el = ref.current;
    if (!el) return;
    try { if (typeof el.showPicker === 'function') el.showPicker(); else el.focus(); }
    catch { el.focus(); }
  };
  return { ref, onClick };
};

export default function AgregarProfesor() {
  const navigate = useNavigate();

  const [cargos, setCargos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(false);

  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [idCargo, setIdCargo] = useState('');

  // 🔻 Solo "NO": se eliminaron idTurnoSi y fechaSi
  const [idTurnoNo, setIdTurnoNo] = useState('');
  const [fechaNo, setFechaNo] = useState('');
  const fechaNoCtl = useClickOpensDatepicker();

  const [toast, setToast] = useState({ show: false, message: '', type: 'exito' });
  const showToast = (message, type = 'exito', duracion = 3000) => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'exito' }), duracion);
  };

  useEffect(() => {
    const fetchListas = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${BASE_URL}/api.php?action=obtener_listas`);
        const json = await res.json();
        if (!json?.exito) { showToast(json?.mensaje || 'No se pudieron cargar las listas.', 'error'); return; }
        const cargosLista = Array.isArray(json?.listas?.cargos) ? json.listas.cargos : [];
        setCargos(cargosLista);
        const turnosRaw = Array.isArray(json?.listas?.turnos) ? json.listas.turnos : [];
        const turnosNorm = turnosRaw.map(t => ({
          id_turno: t.id_turno ?? t.id ?? null,
          turno: t.turno ?? t.nombre ?? '',
        })).filter(t => t.id_turno !== null && t.turno !== '');
        setTurnos(turnosNorm);
      } catch { showToast('Error de conexión al cargar listas', 'error'); }
      finally { setLoading(false); }
    };
    fetchListas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validar = () => {
    const ap = trimSpaces(apellido);
    const no = trimSpaces(nombre);
    if (!ap) return 'El apellido es obligatorio.';
    if (!no) return 'El nombre es obligatorio.';
    if (!idCargo) return 'Seleccioná un cargo.';
    if (!/^[A-ZÑÁÉÍÓÚÜ.\s-]+$/.test(ap)) return 'Apellido: solo letras y espacios.';
    if (!/^[A-ZÑÁÉÍÓÚÜ.\s-]+$/.test(no)) return 'Nombre: solo letras y espacios.';
    const isDate = (d) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isDate(fechaNo)) return 'Formato de fecha inválido en "Fecha NO" (use YYYY-MM-DD).';
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const err = validar();
    if (err) { showToast(err, 'error'); return; }
    const ap = toUpper(trimSpaces(apellido));
    const no = toUpper(trimSpaces(nombre));
    const docente = `${ap}, ${no}`;
    try {
      setLoading(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=agregar_profesor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docente,
          id_cargo: idCargo,
          // 🔻 Solo se envían los campos "NO"
          id_turno_no: idTurnoNo === '' ? null : Number(idTurnoNo),
          fecha_no: fechaNo || null,
        }),
      });
      const data = await resp.json();
      if (data?.exito) { showToast('Docente agregado correctamente', 'exito'); setTimeout(() => navigate('/profesores'), 800); }
      else { showToast(data?.mensaje || 'No se pudo agregar el docente.', 'error'); }
    } catch { showToast('Error de red al guardar.', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="add-alumno-container">
      {toast.show && (
        <Toast
          tipo={toast.type}
          mensaje={toast.message}
          onClose={() => setToast({ show: false, message: '', type: 'exito' })}
          duracion={3000}
        />
      )}

      <div className="add-alumno-box">
        {/* Header (título general) */}
        <div className="add-header">
          <div className="add-icon-title">
            <FontAwesomeIcon icon={faUserPlus} className="add-icon" />
            <div>
              <h1>Agregar Nuevo Docente</h1>
              <p>Completá los datos mínimos para crear el registro</p>
            </div>
          </div>
          <button className="add-back-btn" onClick={() => navigate('/profesores')} disabled={loading} type="button">
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver
          </button>
        </div>

        <form onSubmit={onSubmit} className="add-alumno-form">
          {/* ✅ TÍTULO INTERMEDIO (debajo del header) */}
          <h2 className="add-intertitle">Datos del docente</h2>

          <div className="add-alumno-section">
            <div className="add-alumno-section-content">
              {/* Identificación */}
              <div className="add-group">
                <div className={`add-input-wrapper ${apellido ? 'has-value' : ''}`} style={{ flex: 1 }}>
                  <label className="add-label">Apellido *</label>
                  <input
                    name="apellido"
                    value={apellido}
                    onChange={(e) => setApellido(toUpper(e.target.value))}
                    className="add-input"
                    autoFocus
                  />
                  <span className="add-input-highlight" />
                </div>

                <div className={`add-input-wrapper ${nombre ? 'has-value' : ''}`} style={{ flex: 1 }}>
                  <label className="add-label">Nombre *</label>
                  <input
                    name="nombre"
                    value={nombre}
                    onChange={(e) => setNombre(toUpper(e.target.value))}
                    className="add-input"
                  />
                  <span className="add-input-highlight" />
                </div>
              </div>

              {/* Cargo */}
              <div className="add-group">
                <div className="add-input-wrapper always-active" style={{ flex: 1 }}>
                  <label className="add-label">Cargo *</label>
                  <select
                    name="id_cargo"
                    value={idCargo}
                    onChange={(e) => setIdCargo(e.target.value)}
                    className="add-input"
                    disabled={loading}
                  >
                    <option value="">Seleccionar cargo</option>
                    {cargos.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ✅ Solo Disponibilidad "NO" */}
              <div className="add-group">
                <div className="add-input-wrapper always-active" style={{ flex: 1 }}>
                  <label className="add-label">Turno NO</label>
                  <select
                    name="id_turno_no"
                    value={idTurnoNo}
                    onChange={(e) => setIdTurnoNo(e.target.value)}
                    className="add-input"
                    disabled={loading}
                  >
                    <option value="">-- Sin especificar --</option>
                    {turnos.map((t) => (
                      <option key={t.id_turno} value={t.id_turno}>{t.turno}</option>
                    ))}
                  </select>
                </div>

                {/* Fecha NO (floating siempre activo) */}
                <div className="add-input-wrapper always-active" style={{ flex: 1 }} onClick={fechaNoCtl.onClick}>
                  <label className="add-label">Fecha NO</label>
                  <input
                    ref={fechaNoCtl.ref}
                    type="date"
                    name="fecha_no"
                    value={fechaNo}
                    onChange={(e) => setFechaNo(e.target.value)}
                    className="add-input"
                  />
                  <span className="add-input-highlight" />
                </div>
              </div>
            </div>
          </div>

          <div className="add-alumno-buttons-container">
            <button type="submit" className="add-alumno-button" disabled={loading}>
              <FontAwesomeIcon icon={faSave} className="add-icon-button" />
              <span className="add-button-text">{loading ? 'Guardando...' : 'Guardar Docente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

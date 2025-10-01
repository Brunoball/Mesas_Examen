// src/components/Profesores/AgregarProfesor.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faArrowLeft, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';
import './AgregarProfesor.css';

const toUpper = (v) => (typeof v === 'string' ? v.toUpperCase() : v);
const trimSpaces = (s) => (s || '').replace(/\s+/g, ' ').trim();

export default function AgregarProfesor() {
  const navigate = useNavigate();

  // Solo necesitamos la lista de CARGOS
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form mínimo
  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [idCargo, setIdCargo] = useState('');

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

        if (!json?.exito) {
          showToast(json?.mensaje || 'No se pudieron cargar las listas.', 'error');
          return;
        }

        // El endpoint debería traer { listas: { cargos: [{id, nombre}, ...] } }
        const cargosLista = Array.isArray(json?.listas?.cargos) ? json.listas.cargos : [];
        setCargos(cargosLista);
      } catch (e) {
        showToast('Error de conexión al cargar listas', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchListas();
  }, []);

  const validar = () => {
    const ap = trimSpaces(apellido);
    const no = trimSpaces(nombre);

    if (!ap) return 'El apellido es obligatorio.';
    if (!no) return 'El nombre es obligatorio.';
    if (!idCargo) return 'Seleccioná un cargo.';

    // Un poco de validación de formato básico
    if (!/^[A-ZÑÁÉÍÓÚÜ.\s-]+$/.test(ap)) return 'Apellido: solo letras y espacios.';
    if (!/^[A-ZÑÁÉÍÓÚÜ.\s-]+$/.test(no)) return 'Nombre: solo letras y espacios.';

    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const err = validar();
    if (err) {
      showToast(err, 'error');
      return;
    }

    const ap = toUpper(trimSpaces(apellido));
    const no = toUpper(trimSpaces(nombre));
    const docente = `${ap}, ${no}`; // EXACTO como lo guarda la DB

    try {
      setLoading(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=agregar_profesor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docente, id_cargo: idCargo }),
      });
      const data = await resp.json();

      if (data?.exito) {
        showToast('Docente agregado correctamente', 'exito');
        setTimeout(() => navigate('/profesores'), 800);
      } else {
        showToast(data?.mensaje || 'No se pudo agregar el docente.', 'error');
      }
    } catch (e) {
      showToast('Error de red al guardar.', 'error');
    } finally {
      setLoading(false);
    }
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
          <div className="add-alumno-section">
            <h3 className="add-alumno-section-title">Identificación</h3>
            <div className="add-alumno-section-content">
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
            </div>
          </div>

          <div className="add-alumno-section">
            <h3 className="add-alumno-section-title">Cargo</h3>
            <div className="add-alumno-section-content">
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
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
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

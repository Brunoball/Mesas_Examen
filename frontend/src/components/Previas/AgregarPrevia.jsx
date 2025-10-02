// src/components/Previas/AgregarPrevia.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BASE_URL from '../../config/config';
import Toast from '../Global/Toast';
import '../Global/roots.css';
import './AgregarPrevia.css';

const hoyISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const AgregarPrevia = () => {
  const navigate = useNavigate();

  // ---------- Listas (desde backend) ----------
  const [listas, setListas] = useState({
    cursos: [],
    divisiones: [],
    condiciones: [],
  });
  const [listasLoading, setListasLoading] = useState(true);

  // Materias dependientes de curso+división (para la materia)
  const [materias, setMaterias] = useState([]);
  const [materiasLoading, setMateriasLoading] = useState(false);

  // ---------- Form ----------
  const [form, setForm] = useState({
    dni: '',
    apellido: '',
    nombre: '',
    cursando_id_curso: '',
    cursando_id_division: '',
    materia_id_curso: '',
    materia_id_division: '',
    id_materia: '',
    id_condicion: '',
    anio: new Date().getFullYear(),
    fecha_carga: hoyISO(),
    inscripcion: 0,
  });

  const [loading, setLoading] = useState(false);

  // ----- Toast (arriba) -----
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastTipo, setToastTipo] = useState('info');

  const lanzarToast = (tipo, mensaje, duracion = 2500) => {
    setToastTipo(tipo);
    setToastMsg(mensaje);
    setShowToast(true);
    // el propio Toast se autocierra con su prop `duracion`
  };

  // Ref para el input de fecha (abrir el almanaque programáticamente)
  const fechaRef = useRef(null);

  // ---------- Efecto: cargar listas ----------
  useEffect(() => {
    const cargarListas = async () => {
      try {
        setListasLoading(true);
        const res = await fetch(`${BASE_URL}/api.php?action=listas_basicas`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || 'No se pudieron obtener las listas');

        setListas({
          cursos: json.listas?.cursos ?? [],
          divisiones: json.listas?.divisiones ?? [],
          condiciones: json.listas?.condiciones ?? [],
        });
      } catch (e) {
        lanzarToast('error', e.message || 'Error cargando listas');
      } finally {
        setListasLoading(false);
      }
    };
    cargarListas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Fetch de materias dependiente de curso+división (materia) ----------
  const puedeCargarMaterias = useMemo(
    () => String(form.materia_id_curso) && String(form.materia_id_division),
    [form.materia_id_curso, form.materia_id_division]
  );

  useEffect(() => {
    setForm((f) => ({ ...f, id_materia: '' }));
    setMaterias([]);

    if (!puedeCargarMaterias) return;

    let cancelado = false;

    const cargarMaterias = async () => {
      try {
        setMateriasLoading(true);
        const url = `${BASE_URL}/api.php?action=materias_por_curso_division&id_curso=${form.materia_id_curso}&id_division=${form.materia_id_division}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || 'No se pudieron obtener las materias');
        if (!cancelado) setMaterias(json.materias ?? []);
      } catch (e) {
        if (!cancelado) lanzarToast('error', e.message || 'Error cargando materias');
      } finally {
        if (!cancelado) setMateriasLoading(false);
      }
    };

    cargarMaterias();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeCargarMaterias, form.materia_id_curso, form.materia_id_division]);

  // ---------- Handlers ----------
  const UPPERCASE_FIELDS = new Set(['apellido', 'nombre']);

  const onChange = (e) => {
    const { name, value, type } = e.target;

    if (name === 'dni') {
      const digits = (value || '').replace(/\D+/g, '');
      setForm((f) => ({ ...f, dni: digits }));
      return;
    }

    if (type !== 'select-one' && UPPERCASE_FIELDS.has(name)) {
      const upper = (value || '').toUpperCase();
      setForm((f) => ({ ...f, [name]: upper }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };

  const buildAlumno = (apellido, nombre) => {
    const a = String(apellido || '').trim();
    const n = String(nombre || '').trim();
    if (!a && !n) return '';
    return `${a.toUpperCase()}${a && n ? ', ' : ''}${n.toUpperCase()}`;
  };

  const validar = () => {
    if (!/^\d{7,9}$/.test((form.dni || '').replace(/\D+/g, ''))) {
      return 'DNI inválido';
    }
    if (!String(form.apellido || '').trim()) return 'El apellido es obligatorio';
    if (!String(form.nombre || '').trim()) return 'El nombre es obligatorio';
    if (!String(form.cursando_id_curso)) return 'Seleccioná el curso (cursando)';
    if (!String(form.cursando_id_division)) return 'Seleccioná la división (cursando)';
    if (!String(form.materia_id_curso)) return 'Seleccioná el curso de la materia';
    if (!String(form.materia_id_division)) return 'Seleccioná la división de la materia';
    if (!String(form.id_materia)) return 'Seleccioná la materia';
    if (!String(form.id_condicion)) return 'Seleccioná la condición';
    if (!form.anio) return 'Año es obligatorio';
    return '';
  };

  const normalizeForSubmit = (obj) => {
    const toInt = (v) =>
      v === '' || v === null || typeof v === 'undefined' ? null : parseInt(v, 10);

    const alumno = buildAlumno(obj.apellido, obj.nombre);

    return {
      dni: String(obj.dni || '').trim(),
      alumno,
      cursando_id_curso: toInt(obj.cursando_id_curso),
      cursando_id_division: toInt(obj.cursando_id_division),
      id_materia: toInt(obj.id_materia),
      materia_id_curso: toInt(obj.materia_id_curso),
      materia_id_division: toInt(obj.materia_id_division),
      id_condicion: toInt(obj.id_condicion),
      anio: toInt(obj.anio),
      fecha_carga: obj.fecha_carga,
      inscripcion: toInt(obj.inscripcion) || 0,
    };
  };

  const guardar = async (e) => {
    e.preventDefault();
    const v = validar();
    if (v) {
      lanzarToast('advertencia', v);
      return;
    }

    try {
      setLoading(true);
      const payload = normalizeForSubmit(form);

      const res = await fetch(`${BASE_URL}/api.php?action=previa_agregar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || 'No se pudo agregar');

      // ✅ Toast de éxito arriba
      lanzarToast('exito', 'Previa agregada correctamente.', 2000);

      // Navego después de que se vea el toast
      setTimeout(() => navigate('/previas'), 900);
    } catch (e2) {
      lanzarToast('error', e2.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Render ----------
  const materiaSelectDisabled = !puedeCargarMaterias || materiasLoading || materias.length === 0;

  const hasVal = (v) => (v !== null && v !== undefined && String(v).trim() !== '');

  const openCalendar = (e) => {
    if (e && e.type === 'mousedown') e.preventDefault();
    const el = fechaRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        el.focus();
      }
    } catch {
      el.focus();
    }
  };

  return (
    <>
      {/* 🔔 Toast global, flotante arriba */}
      {showToast && (
        <Toast
          tipo={toastTipo}
          mensaje={toastMsg}
          duracion={2500}
          onClose={() => setShowToast(false)}
        />
      )}

      <div className="prev-add-container">
        <div className="prev-add-box">

          {/* Header con gradiente + volver */}
          <div className="prev-add-header">
            <div className="prev-add-icon-title">
              <span className="prev-add-icon">📚</span>
              <div>
                <h1>Agregar Previa</h1>
                <p>Cargá los datos de la previa del alumno</p>
              </div>
            </div>

            <button
              type="button"
              className="prev-add-back-btn"
              onClick={() => navigate(-1)}
              title="Volver"
            >
              ↩ Volver
            </button>
          </div>

          <div className="prev-add-form-wrapper">
            {/* Todos los mensajes se manejan por Toast */}
            <form onSubmit={guardar} className="prev-add-form">
              <div className="prev-add-grid">

                {/* DNI */}
                <div className={`prev-input-wrapper ${hasVal(form.dni) ? 'has-value' : ''}`}>
                  <label className="prev-label">DNI</label>
                  <input
                    className="prev-input"
                    name="dni"
                    value={form.dni}
                    onChange={onChange}
                    placeholder="Ej: 40123456"
                  />
                  <span className="prev-input-highlight" />
                </div>

                {/* Apellido */}
                <div className={`prev-input-wrapper ${hasVal(form.apellido) ? 'has-value' : ''}`}>
                  <label className="prev-label">Apellido</label>
                  <input
                    className="prev-input"
                    name="apellido"
                    value={form.apellido}
                    onChange={onChange}
                    placeholder="Ej: PÉREZ"
                  />
                  <span className="prev-input-highlight" />
                </div>

                {/* Nombre */}
                <div className={`prev-input-wrapper ${hasVal(form.nombre) ? 'has-value' : ''}`}>
                  <label className="prev-label">Nombre</label>
                  <input
                    className="prev-input"
                    name="nombre"
                    value={form.nombre}
                    onChange={onChange}
                    placeholder="Ej: ANA MARÍA"
                  />
                  <span className="prev-input-highlight" />
                </div>

                {/* Cursando: curso */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Cursando: curso</label>
                  <select
                    className="prev-input"
                    name="cursando_id_curso"
                    value={form.cursando_id_curso}
                    onChange={onChange}
                    disabled={listasLoading}
                  >
                    <option value="">Seleccionar…</option>
                    {listas.cursos.map((c) => (
                      <option key={`cur-${c.id}`} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                  <span className="prev-input-highlight" />
                </div>

                {/* Cursando: división */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Cursando: división</label>
                  <select
                    className="prev-input"
                    name="cursando_id_division"
                    value={form.cursando_id_division}
                    onChange={onChange}
                    disabled={listasLoading}
                  >
                    <option value="">Seleccionar…</option>
                    {listas.divisiones.map((d) => (
                      <option key={`cdiv-${d.id}`} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                  <span className="prev-input-highlight" />
                </div>

                {/* Materia: curso */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Materia: curso</label>
                  <select
                    className="prev-input"
                    name="materia_id_curso"
                    value={form.materia_id_curso}
                    onChange={onChange}
                    disabled={listasLoading}
                  >
                    <option value="">Seleccionar…</option>
                    {listas.cursos.map((c) => (
                      <option key={`mcur-${c.id}`} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                  <span className="prev-input-highlight" />
                </div>

                {/* Materia: división */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Materia: división</label>
                  <select
                    className="prev-input"
                    name="materia_id_division"
                    value={form.materia_id_division}
                    onChange={onChange}
                    disabled={listasLoading}
                  >
                    <option value="">Seleccionar…</option>
                    {listas.divisiones.map((d) => (
                      <option key={`mdiv-${d.id}`} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                  <span className="prev-input-highlight" />
                </div>

                {/* Materia (dependiente) */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Materia</label>
                  <select
                    className="prev-input"
                    name="id_materia"
                    value={form.id_materia}
                    onChange={onChange}
                    disabled={materiaSelectDisabled}
                  >
                    {!puedeCargarMaterias && (
                      <option value="">Elegí curso y división de materia</option>
                    )}
                    {puedeCargarMaterias && materiasLoading && (
                      <option value="">Cargando materias…</option>
                    )}
                    {puedeCargarMaterias && !materiasLoading && materias.length === 0 && (
                      <option value="">Sin materias para esa combinación</option>
                    )}
                    {puedeCargarMaterias && !materiasLoading && materias.length > 0 && (
                      <>
                        <option value="">Seleccionar…</option>
                        {materias.map((m) => (
                          <option key={`mat-${m.id}`} value={m.id}>{m.nombre}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <span className="prev-input-highlight" />
                </div>

                {/* Condición */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Condición</label>
                  <select
                    className="prev-input"
                    name="id_condicion"
                    value={form.id_condicion}
                    onChange={onChange}
                    disabled={listasLoading}
                  >
                    <option value="">Seleccionar…</option>
                    {listas.condiciones.map((c) => (
                      <option key={`cond-${c.id}`} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                  <span className="prev-input-highlight" />
                </div>

                {/* Año */}
                <div className={`prev-input-wrapper ${hasVal(form.anio) ? 'has-value' : ''}`}>
                  <label className="prev-label">Año (previa)</label>
                  <input
                    className="prev-input"
                    type="number"
                    name="anio"
                    value={form.anio}
                    onChange={onChange}
                    min="2000"
                    max="2100"
                  />
                  <span className="prev-input-highlight" />
                </div>

                {/* Fecha carga */}
                <div className={`prev-input-wrapper ${hasVal(form.fecha_carga) ? 'has-value' : ''}`}>
                  <label className="prev-label">Fecha carga</label>
                  <input
                    ref={fechaRef}
                    className="prev-input"
                    type="date"
                    name="fecha_carga"
                    value={form.fecha_carga}
                    onChange={onChange}
                    onMouseDown={openCalendar}
                    onFocus={openCalendar}
                  />
                  <span className="prev-input-highlight" />
                </div>

                {/* Inscripción */}
                <div className="prev-input-wrapper always-active">
                  <label className="prev-label">Inscripción</label>
                  <select
                    className="prev-input"
                    name="inscripcion"
                    value={form.inscripcion}
                    onChange={onChange}
                  >
                    <option value={0}>No</option>
                    <option value={1}>Sí</option>
                  </select>
                  <span className="prev-input-highlight" />
                </div>
              </div>

              {/* Botonera inferior */}
              <div className="prev-add-buttons">
                <button
                  type="button"
                  className="prev-add-button prev-add-button--back"
                  onClick={() => navigate(-1)}
                  title="Volver"
                >
                  ↩ <span className="prev-add-button-text">Volver</span>
                </button>

                <button
                  type="submit"
                  className="prev-add-button"
                  disabled={loading || listasLoading || materiasLoading}
                  title="Guardar"
                >
                  <span className="prev-add-button-text">{loading ? 'Guardando...' : 'Guardar Previa'}</span>
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </>
  );
};

export default AgregarPrevia;

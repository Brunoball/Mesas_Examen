// src/components/Previas/Previas.jsx
import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
  useDeferredValue,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import BASE_URL from '../../config/config';
import {
  FaInfoCircle,
  FaArrowLeft,
  FaFileExcel,
  FaUserSlash,
  FaSearch,
  FaTimes,
  FaUsers,
  FaFilter,
  FaChevronDown
} from 'react-icons/fa';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Toast from '../Global/Toast';
import '../Global/roots.css';
import './Previas.css';

/* ================================
   Utils
================================ */
const normalizar = (str = '') =>
  str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const MAX_CASCADE_ITEMS = 15;

const formatearFechaISO = (v) => {
  if (!v || typeof v !== 'string') return '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); // acepta "YYYY-MM-DD" o "YYYY-MM-DD hh:mm"
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

// Hook simple para detectar mobile
function useIsMobile(breakpoint = 768) {
  const getMatch = () =>
    (typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : false);
  const [isMobile, setIsMobile] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, [breakpoint]);

  return isMobile;
}

/* ================================
   Componente Previas
================================ */
const Previas = () => {
  const [previas, setPrevias] = useState([]);
  const [previasDB, setPreviasDB] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [bloquearInteraccion, setBloquearInteraccion] = useState(true);

  // flags de animación
  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  const filtrosRef = useRef(null);
  const prevBusquedaRef = useRef('');
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  const [toast, setToast] = useState({
    mostrar: false,
    tipo: '',
    mensaje: ''
  });

  // Acordeones
  const [openSecciones, setOpenSecciones] = useState({
    division: false,
    anio: false,
    materia: false,
  });

  // Filtros
  const [filtros, setFiltros] = useState(() => {
    const saved = localStorage.getItem('filtros_previas');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          busqueda: parsed.busqueda ?? '',
          divisionSeleccionada: parsed.divisionSeleccionada ?? '',
          anioSeleccionado: parsed.anioSeleccionado ?? null,
          materiaSeleccionada: parsed.materiaSeleccionada ?? '',
          filtroActivo: parsed.filtroActivo ?? null,
        };
      } catch {}
    }
    return {
      busqueda: '',
      divisionSeleccionada: '',
      anioSeleccionado: null,
      materiaSeleccionada: '',
      filtroActivo: null,
    };
  });

  const { busqueda, divisionSeleccionada, anioSeleccionado, materiaSeleccionada, filtroActivo } = filtros;
  const busquedaDefer = useDeferredValue(busqueda);

  const hayFiltros = !!(
    (busquedaDefer && busquedaDefer.trim() !== '') ||
    (divisionSeleccionada && divisionSeleccionada !== '') ||
    (anioSeleccionado !== null) ||
    (materiaSeleccionada && materiaSeleccionada !== '')
  );

  // Listas únicas desde dataset
  const divisionesDisponibles = useMemo(() => {
    const set = new Set(
      (previasDB || [])
        .map(p => p?.cursando_division_nombre)
        .filter(Boolean)
        .map(d => d.toString().trim())
    );
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
    );
  }, [previasDB]);

  const materiasDisponibles = useMemo(() => {
    const set = new Set(
      (previasDB || [])
        .map(p => p?.materia_nombre)
        .filter(Boolean)
        .map(d => d.toString().trim())
    );
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }, [previasDB]);

  // Búsqueda y filtros
  const previasFiltradas = useMemo(() => {
    let resultados = previas;

    if (busquedaDefer && busquedaDefer.trim() !== '') {
      const q = normalizar(busquedaDefer);
      resultados = resultados.filter(
        (p) =>
          (p._alumno?.includes(q)) ||
          (p._dni?.includes(q)) ||
          (p._materia?.includes(q))
      );
    }

    if (divisionSeleccionada && divisionSeleccionada !== '') {
      const divNorm = normalizar(divisionSeleccionada);
      resultados = resultados.filter((p) => normalizar(p?.cursando_division_nombre ?? '') === divNorm);
    }

    if (anioSeleccionado !== null) {
      resultados = resultados.filter((p) => Number(p?.anio) === Number(anioSeleccionado));
    }

    if (materiaSeleccionada && materiaSeleccionada !== '') {
      const matNorm = normalizar(materiaSeleccionada);
      resultados = resultados.filter((p) => normalizar(p?.materia_nombre ?? '') === matNorm);
    }

    if (filtroActivo === 'todos') {
      resultados = previas;
    }

    return resultados;
  }, [previas, busquedaDefer, divisionSeleccionada, anioSeleccionado, materiaSeleccionada, filtroActivo]);

  const puedeExportar = useMemo(() => {
    return (hayFiltros || filtroActivo === 'todos') && previasFiltradas.length > 0 && !cargando;
  }, [hayFiltros, filtroActivo, previasFiltradas.length, cargando]);

  const mostrarLoader = useMemo(
    () => cargando && (hayFiltros || filtroActivo === 'todos'),
    [cargando, hayFiltros, filtroActivo]
  );

  /* ================================
     Animación en cascada
  ================================= */
  const dispararCascadaUnaVez = useCallback((duracionMs) => {
    const safeMs = 400 + (MAX_CASCADE_ITEMS - 1) * 30 + 300;
    const total = typeof duracionMs === 'number' ? duracionMs : safeMs;
    if (animacionActiva) return;
    setAnimacionActiva(true);
    window.setTimeout(() => setAnimacionActiva(false), total);
  }, [animacionActiva]);

  const triggerCascadaConPreMask = useCallback(() => {
    setPreCascada(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dispararCascadaUnaVez();
        setPreCascada(false);
      });
    });
  }, [dispararCascadaUnaVez]);

  /* ================================
     Efectos
  ================================= */
  const mostrarToast = useCallback((mensaje, tipo = 'exito') => {
    setToast({ mostrar: true, tipo, mensaje });
  }, []);

  useEffect(() => {
    if (previasFiltradas.length > 0) {
      const timer = setTimeout(() => setBloquearInteraccion(false), 300);
      return () => clearTimeout(timer);
    }
  }, [previasFiltradas]);

  useEffect(() => {
    const handleClickOutsideFiltros = (event) => {
      if (filtrosRef.current && !filtrosRef.current.contains(event.target)) {
        setMostrarFiltros(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideFiltros);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideFiltros);
    };
  }, []);

  // Carga inicial de PREVIAS
  useEffect(() => {
    const cargarPrevias = async () => {
      try {
        setCargando(true);
        const res = await fetch(`${BASE_URL}/api.php?action=previas`);
        const data = await res.json();

        if (data?.exito) {
          const procesados = (data.previas || []).map((p) => ({
            ...p,
            _alumno: normalizar(p?.alumno ?? ''),
            _dni: String(p?.dni ?? '').toLowerCase(),
            _materia: normalizar(p?.materia_nombre ?? ''),
            materia_curso_division: `${p.materia_curso_nombre || ''} / ${p.materia_division_nombre || ''}`.trim()
          }));
          setPrevias(procesados);
          setPreviasDB(procesados);
        } else {
          mostrarToast(`Error al obtener previas: ${data?.mensaje || 'desconocido'}`, 'error');
        }
      } catch {
        mostrarToast('Error de red al obtener previas', 'error');
      } finally {
        setCargando(false);
      }
    };

    cargarPrevias();
  }, [mostrarToast]);

  useEffect(() => {
    localStorage.setItem('filtros_previas', JSON.stringify(filtros));
  }, [filtros]);

  // Dispara cascada SOLO cuando el buscador pasa de '' a no ''
  useEffect(() => {
    const prev = prevBusquedaRef.current || '';
    const ahora = (busquedaDefer || '').trim();
    if (prev === '' && ahora !== '') {
      triggerCascadaConPreMask();
    }
    prevBusquedaRef.current = ahora;
  }, [busquedaDefer, triggerCascadaConPreMask]);

  /* ================================
     Handlers
  ================================= */
  const handleMostrarTodos = useCallback(() => {
    setFiltros({
      busqueda: '',
      divisionSeleccionada: '',
      anioSeleccionado: null,
      materiaSeleccionada: '',
      filtroActivo: 'todos',
    });
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleBuscarChange = useCallback((valor) => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: valor };
      next.filtroActivo =
        (valor?.trim() || prev.divisionSeleccionada || prev.anioSeleccionado !== null || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const handleFiltrarPorDivision = useCallback((division) => {
    setFiltros((prev) => {
      const next = { ...prev, divisionSeleccionada: division };
      next.filtroActivo =
        (prev.busqueda?.trim() || division || prev.anioSeleccionado !== null || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleFiltrarPorAnio = useCallback((anio) => {
    setFiltros((prev) => {
      const next = { ...prev, anioSeleccionado: anio };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.divisionSeleccionada || anio !== null || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleFiltrarPorMateria = useCallback((materia) => {
    setFiltros((prev) => {
      const next = { ...prev, materiaSeleccionada: materia };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.divisionSeleccionada || prev.anioSeleccionado !== null || materia)
          ? 'filtros'
          : null;
      return next;
    });
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const quitarBusqueda = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: '' };
      next.filtroActivo =
        (prev.divisionSeleccionada || prev.anioSeleccionado !== null || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarDivision = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, divisionSeleccionada: '' };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.anioSeleccionado !== null || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarAnio = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, anioSeleccionado: null };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.divisionSeleccionada || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarMateria = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, materiaSeleccionada: '' };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.divisionSeleccionada || prev.anioSeleccionado !== null)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const limpiarTodosLosChips = useCallback(() => {
    setFiltros((prev) => ({
      ...prev,
      busqueda: '',
      divisionSeleccionada: '',
      anioSeleccionado: null,
      materiaSeleccionada: '',
      filtroActivo: null,
    }));
  }, []);

  // Exportar a Excel lo visible
  const exportarExcel = useCallback(() => {
    if (!puedeExportar) {
      setToast({ mostrar: true, tipo: 'error', mensaje: 'No hay filas visibles para exportar.' });
      return;
    }

    const filas = previasFiltradas.map((p) => ({
      'ID Previa': p?.id_previa ?? '',
      'Alumno': p?.alumno ?? '',
      'DNI': p?.dni ?? '',
      'Año (previa)': p?.anio ?? '',
      'Curso (cursando)': p?.cursando_curso_nombre ?? '',
      'División (cursando)': p?.cursando_division_nombre ?? '',
      'Materia': p?.materia_nombre ?? '',
      'Curso Materia': p?.materia_curso_nombre ?? '',
      'División Materia': p?.materia_division_nombre ?? '',
      'Condición': p?.condicion_nombre ?? '',
      'Fecha carga': formatearFechaISO(p?.fecha_carga ?? '')
    }));

    const headers = [
      'ID Previa','Alumno','DNI','Año (previa)','Curso (cursando)','División (cursando)',
      'Materia','Curso Materia','División Materia','Condición','Fecha carga'
    ];

    const ws = XLSX.utils.json_to_sheet(filas, { header: headers });
    ws['!cols'] = [
      { wch: 10 },{ wch: 28 },{ wch: 14 },{ wch: 12 },{ wch: 18 },{ wch: 20 },
      { wch: 26 },{ wch: 16 },{ wch: 18 },{ wch: 14 },{ wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Previas');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');

    const sufijo = filtroActivo === 'todos' ? 'Todos' : 'Filtrados';
    const fechaStr = `${yyyy}-${mm}-${dd}`;
    saveAs(blob, `Previas_${sufijo}_${fechaStr}(${filas.length}).xlsx`);
  }, [puedeExportar, previasFiltradas, filtroActivo]);

  /* ================================
     Fila virtualizada (desktop)
  ================================= */
  const Row = React.memo(({ index, style, data }) => {
    const p = data[index];
    const esFilaPar = index % 2 === 0;
    const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = preCascada && index < MAX_CASCADE_ITEMS;

    return (
      <div
        style={{
          ...style,
          animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
          opacity: preMask ? 0 : undefined,
          transform: preMask ? 'translateY(8px)' : undefined,
        }}
        className={`prev-row ${esFilaPar ? 'prev-even-row' : 'prev-odd-row'} ${willAnimate ? 'prev-cascade' : ''}`}
      >
        <div className="prev-column prev-column-nombre" title={p.alumno}>{p.alumno}</div>
        <div className="prev-column prev-column-dni" title={p.dni}>{p.dni}</div>
        <div className="prev-column prev-column-materia" title={p.materia_nombre}>{p.materia_nombre}</div>
        <div className="prev-column prev-column-condicion" title={p.condicion_nombre}>{p.condicion_nombre}</div>
        <div className="prev-column prev-column-curso-division" title={p.materia_curso_division}>
          {p.materia_curso_division}
        </div>
        <div className="prev-column prev-icons-column">
          <div className="prev-icons-container">
            <button
              className="prev-iconchip is-info"
              title="Ver información"
              onClick={() =>
                setToast({
                  mostrar: true,
                  tipo: 'info',
                  mensaje:
                    `${p.alumno} • DNI ${p.dni}\n` +
                    `Materia: ${p.materia_nombre}\n` +
                    `Condición: ${p.condicion_nombre}\n` +
                    `Curso/División: ${p.materia_curso_division}`
                })
              }
              aria-label="Ver información"
            >
              <FaInfoCircle />
            </button>
          </div>
        </div>
      </div>
    );
  });

  /* ================================
     Render
  ================================= */
  const hayChips = !!(busqueda || divisionSeleccionada || anioSeleccionado !== null || materiaSeleccionada);

  return (
    <div className="prev-container">
      <div className="prev-box">
        {toast.mostrar && (
          <Toast
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            onClose={() => setToast({ mostrar: false, tipo: '', mensaje: '' })}
            duracion={3000}
          />
        )}

        {/* Header superior */}
        <div className="prev-headerbar">
          <span className="prev-title">Gestión de Previas</span>

          {/* Búsqueda */}
          <div className="prev-search">
            <input
              type="text"
              placeholder="Buscar por alumno, DNI o materia"
              className="prev-search-input"
              value={busqueda}
              onChange={(e) => handleBuscarChange(e.target.value)}
              disabled={cargando}
            />
            {busqueda ? (
              <FaTimes className="prev-clear-search-icon" onClick={quitarBusqueda} />
            ) : null}
            <button className="prev-search-button" title="Buscar">
              <FaSearch className="prev-search-icon" />
            </button>
          </div>

          {/* Filtros */}
          <div className="prev-filtros" ref={filtrosRef}>
            <button
              className="prev-filtros-button"
              onClick={() => {
                setMostrarFiltros((prev) => {
                  const next = !prev;
                  if (next) setOpenSecciones((s) => ({ ...s, division: false }));
                  return next;
                });
              }}
              disabled={cargando}
            >
              <FaFilter className="prev-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown className={`prev-chevron ${mostrarFiltros ? 'prev-rotate' : ''}`} />
            </button>

            {mostrarFiltros && (
              <div className="prev-filtros-menu" role="menu">
                {/* AÑO (de la previa) */}
                <div className="prev-filtros-group">
                  <button
                    type="button"
                    className={`prev-filtros-group-header ${openSecciones.anio ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, anio: !s.anio }))}
                    aria-expanded={openSecciones.anio}
                  >
                    <span className="prev-filtros-group-title">Filtrar por año (previa)</span>
                    <FaChevronDown className="prev-accordion-caret" />
                  </button>

                  <div className={`prev-filtros-group-body ${openSecciones.anio ? 'is-open' : 'is-collapsed'}`}>
                    <div className="prev-anio-filtros">
                      {[1,2,3,4,5,6,7].map((n) => (
                        <button
                          key={`anio-${n}`}
                          className={`prev-anio-filtro ${filtros.anioSeleccionado === n ? 'prev-active' : ''}`}
                          onClick={() => handleFiltrarPorAnio(n)}
                          title={`Filtrar por Año ${n}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* DIVISIÓN (cursando) */}
                <div className="prev-filtros-group">
                  <button
                    type="button"
                    className={`prev-filtros-group-header ${openSecciones.division ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, division: !s.division }))}
                    aria-expanded={openSecciones.division}
                  >
                    <span className="prev-filtros-group-title">Filtrar por división (cursando)</span>
                    <FaChevronDown className="prev-accordion-caret" />
                  </button>

                  <div className={`prev-filtros-group-body ${openSecciones.division ? 'is-open' : 'is-collapsed'}`}>
                    <div className="prev-alfabeto-filtros">
                      {divisionesDisponibles.length === 0 ? (
                        <span className="prev-filtro-empty">No hay divisiones disponibles</span>
                      ) : (
                        divisionesDisponibles.map((div) => (
                          <button
                            key={`div-${div}`}
                            className={`prev-letra-filtro ${filtros.divisionSeleccionada === div ? 'prev-active' : ''}`}
                            onClick={() => handleFiltrarPorDivision(div)}
                            title={`Filtrar por división ${div}`}
                          >
                            {div}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* MATERIA */}
                <div className="prev-filtros-group">
                  <button
                    type="button"
                    className={`prev-filtros-group-header ${openSecciones.materia ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, materia: !s.materia }))}
                    aria-expanded={openSecciones.materia}
                  >
                    <span className="prev-filtros-group-title">Filtrar por materia</span>
                    <FaChevronDown className="prev-accordion-caret" />
                  </button>

                  <div className={`prev-filtros-group-body ${openSecciones.materia ? 'is-open' : 'is-collapsed'}`}>
                    <div className="prev-alfabeto-filtros">
                      {materiasDisponibles.length === 0 ? (
                        <span className="prev-filtro-empty">No hay materias disponibles</span>
                      ) : (
                        materiasDisponibles.map((mat) => (
                          <button
                            key={`mat-${mat}`}
                            className={`prev-letra-filtro ${filtros.materiaSeleccionada === mat ? 'prev-active' : ''}`}
                            onClick={() => handleFiltrarPorMateria(mat)}
                            title={`Filtrar por materia ${mat}`}
                          >
                            {mat}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Mostrar Todos */}
                <div
                  className="prev-filtros-menu-item prev-mostrar-todas"
                  onClick={() => {
                    handleMostrarTodos();
                    setMostrarFiltros(false);
                  }}
                  role="menuitem"
                >
                  <span>Mostrar Todos</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CONTADOR + CHIPS + LISTADO */}
        <div className="prev-list-wrapper">
          <div className="prev-toolbar-row">
            {/* Contador */}
            <div className="prev-toolbar-left">
              <div className="prev-contador">
                <span className="prev-count-desktop">
                  Cant previas: {(hayFiltros || filtroActivo === 'todos') ? previasFiltradas.length : 0}
                </span>
                <span className="prev-count-mobile">
                  {(hayFiltros || filtroActivo === 'todos') ? previasFiltradas.length : 0}
                </span>
                <FaUsers className="prev-icono" />
              </div>

              {/* Chips */}
              {hayChips && (
                <div className="prev-chips">
                  {busqueda && (
                    <div className="prev-chip" title="Filtro activo">
                      <span className="prev-chip-text prev-chip-desktop">Búsqueda: {busqueda}</span>
                      <span className="prev-chip-text prev-chip-mobile">
                        {busqueda.length > 3 ? `${busqueda.substring(0, 3)}...` : busqueda}
                      </span>
                      <button className="prev-chip-close" onClick={quitarBusqueda} aria-label="Quitar filtro" title="Quitar este filtro">×</button>
                    </div>
                  )}

                  {divisionSeleccionada && (
                    <div className="prev-chip" title="Filtro activo">
                      <span className="prev-chip-text prev-chip-desktop">División: {divisionSeleccionada}</span>
                      <span className="prev-chip-text prev-chip-mobile">{divisionSeleccionada}</span>
                      <button className="prev-chip-close" onClick={quitarDivision} aria-label="Quitar filtro" title="Quitar este filtro">×</button>
                    </div>
                  )}

                  {anioSeleccionado != null && (
                    <div className="prev-chip" title="Filtro activo">
                      <span className="prev-chip-text prev-chip-desktop">Año: {anioSeleccionado}</span>
                      <span className="prev-chip-text prev-chip-mobile">{anioSeleccionado}</span>
                      <button className="prev-chip-close" onClick={quitarAnio} aria-label="Quitar filtro" title="Quitar este filtro">×</button>
                    </div>
                  )}

                  {materiaSeleccionada && (
                    <div className="prev-chip" title="Filtro activo">
                      <span className="prev-chip-text prev-chip-desktop">Materia: {materiaSeleccionada}</span>
                      <span className="prev-chip-text prev-chip-mobile">{materiaSeleccionada}</span>
                      <button className="prev-chip-close" onClick={quitarMateria} aria-label="Quitar filtro" title="Quitar este filtro">×</button>
                    </div>
                  )}

                  <button
                    className="prev-chip prev-chip-clear-all"
                    onClick={limpiarTodosLosChips}
                    title="Quitar todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TABLA (solo desktop) */}
          {!isMobile && (
            <div className="prev-table">
              <div className="prev-thead">
                <div className="prev-th prev-th-nombre">Alumno</div>
                <div className="prev-th prev-th-dni">DNI</div>
                <div className="prev-th prev-th-materia">Materia</div>
                <div className="prev-th prev-th-condicion">Condición</div>
                <div className="prev-th prev-th-curso-division">Curso / División (Materia)</div>
                <div className="prev-th prev-icons-column">Acciones</div>
              </div>

              <div className="prev-tbody">
                {!hayFiltros && filtroActivo !== 'todos' ? (
                  <div className="prev-no-data">
                    <div className="prev-no-data-content">
                      <p>Aplicá búsqueda o filtros para ver las previas</p>
                      <button className="prev-btn-show-all" onClick={handleMostrarTodos}>
                        Mostrar todas
                      </button>
                    </div>
                  </div>
                ) : mostrarLoader ? (
                  <div className="prev-loading">
                    <div className="prev-spinner"></div>
                  </div>
                ) : previas.length === 0 ? (
                  <div className="prev-no-data">
                    <div className="prev-no-data-content">
                      <p>No hay previas registradas</p>
                    </div>
                  </div>
                ) : previasFiltradas.length === 0 ? (
                  <div className="prev-no-data">
                    <div className="prev-no-data-content">
                      <p>No hay resultados con los filtros actuales</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: '55vh', width: '100%' }}>
                    <AutoSizer>
                      {({ height, width }) => (
                        <List
                          height={height}
                          width={width}
                          itemCount={previasFiltradas.length}
                          itemSize={48}
                          itemData={previasFiltradas}
                          overscanCount={10}
                          itemKey={(index, data) => data[index]?.id_previa ?? index}
                        >
                          {Row}
                        </List>
                      )}
                    </AutoSizer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TARJETAS (solo mobile) */}
          {isMobile && (
            <div
              className={`prev-cards ${animacionActiva && previasFiltradas.length <= MAX_CASCADE_ITEMS ? 'prev-cascade-anim' : ''}`}
            >
              {!hayFiltros && filtroActivo !== 'todos' ? (
                <div className="prev-no-data prev-no-data-mobile">
                  <div className="prev-no-data-content">
                    <p>Usá la búsqueda o aplicá filtros para ver resultados</p>
                    <button className="prev-btn-show-all" onClick={handleMostrarTodos}>
                      Mostrar todas
                    </button>
                  </div>
                </div>
              ) : mostrarLoader ? (
                <div className="prev-no-data prev-no-data-mobile">
                  <div className="prev-no-data-content">
                    <p>Cargando previas...</p>
                  </div>
                </div>
              ) : previas.length === 0 ? (
                <div className="prev-no-data prev-no-data-mobile">
                  <div className="prev-no-data-content">
                    <p>No hay previas registradas</p>
                  </div>
                </div>
              ) : previasFiltradas.length === 0 ? (
                <div className="prev-no-data prev-no-data-mobile">
                  <div className="prev-no-data-content">
                    <p>No hay resultados con los filtros actuales</p>
                  </div>
                </div>
              ) : (
                previasFiltradas.map((p, index) => {
                  const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
                  const preMask = preCascada && index < MAX_CASCADE_ITEMS;
                  return (
                    <div
                      key={p.id_previa || `card-${index}`}
                      className={`prev-card ${willAnimate ? 'prev-cascade' : ''}`}
                      style={{
                        animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
                        opacity: preMask ? 0 : undefined,
                        transform: preMask ? 'translateY(8px)' : undefined,
                      }}
                    >
                      <div className="prev-card-header">
                        <h3 className="prev-card-title">{p.alumno}</h3>
                      </div>

                      <div className="prev-card-body">
                        <div className="prev-card-row">
                          <span className="prev-card-label">DNI</span>
                          <span className="prev-card-value prev-mono">{p.dni}</span>
                        </div>
                        <div className="prev-card-row">
                          <span className="prev-card-label">Materia</span>
                          <span className="prev-card-value">{p.materia_nombre}</span>
                        </div>
                        <div className="prev-card-row">
                          <span className="prev-card-label">Condición</span>
                          <span className="prev-card-value">{p.condicion_nombre}</span>
                        </div>
                        <div className="prev-card-row">
                          <span className="prev-card-label">Curso/División</span>
                          <span className="prev-card-value">{p.materia_curso_division}</span>
                        </div>
                        <div className="prev-card-row">
                          <span className="prev-card-label">Fecha Carga</span>
                          <span className="prev-card-value">{formatearFechaISO(p.fecha_carga)}</span>
                        </div>
                      </div>

                      <div className="prev-card-actions">
                        <button
                          className="prev-action-btn prev-iconchip is-info"
                          title="Información"
                          onClick={() =>
                            setToast({
                              mostrar: true,
                              tipo: 'info',
                              mensaje:
                                `${p.alumno} • DNI ${p.dni}\n` +
                                `Materia: ${p.materia_nombre}\n` +
                                `Condición: ${p.condicion_nombre}\n` +
                                `Curso/División: ${p.materia_curso_division}`
                            })
                          }
                          aria-label="Información"
                        >
                          <FaInfoCircle />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* BOTONERA INFERIOR */}
        <div className="prev-bottombar">
          <button
            className="prev-btn prev-hover prev-volver"
            onClick={() => {
              setFiltros({
                busqueda: '',
                divisionSeleccionada: '',
                anioSeleccionado: null,
                materiaSeleccionada: '',
                filtroActivo: null,
              });
              localStorage.removeItem('filtros_previas');
              navigate('/panel');
            }}
            aria-label="Volver"
            title="Volver"
          >
            <FaArrowLeft className="prev-btn-icon" />
            <p>Volver Atrás</p>
          </button>

          <div className="prev-bottom-actions">
            <button
              className="prev-btn prev-hover"
              onClick={exportarExcel}
              disabled={!puedeExportar}
              aria-label="Exportar"
              title={puedeExportar ? 'Exportar a Excel' : 'No hay filas visibles para exportar'}
            >
              <FaFileExcel className="prev-btn-icon" />
              <p>Exportar a Excel</p>
            </button>

            <button
              className="prev-btn prev-hover prev-btn-baja-nav"
              onClick={() => navigate('/alumnos/baja')}
              title="Dados de Baja"
              aria-label="Dados de Baja"
            >
              <FaUserSlash className="prev-btn-icon" />
              <p>Dados de Baja</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Previas;
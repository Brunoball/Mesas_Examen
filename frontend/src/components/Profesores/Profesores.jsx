// src/components/Profesores/Profesores.jsx
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
  FaEdit,
  FaTrash,
  FaUserMinus,
  FaArrowLeft,
  FaUserPlus,
  FaFileExcel,
  FaUserSlash,
  FaSearch,
  FaTimes,
  FaUsers,
  FaFilter,
  FaChevronDown
} from 'react-icons/fa';
import './Profesores.css';

// Modales
import ModalEliminarProfesor from './modales/ModalEliminarProfesor';
import ModalInfoProfesor from './modales/ModalInfoProfesor';
import ModalDarBajaProfesor from './modales/ModalDarBajaProfesor';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Toast from '../Global/Toast';
import '../Global/roots.css';

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
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
   Componente Profesores
================================ */
const Profesores = () => {
  const [profesores, setProfesores] = useState([]);
  const [profesoresDB, setProfesoresDB] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState(null);

  // Estados modales
  const [mostrarModalEliminar, setMostrarModalEliminar] = useState(false);
  const [profesorAEliminar, setProfesorAEliminar] = useState(null);

  const [mostrarModalInfo, setMostrarModalInfo] = useState(false);
  const [profesorInfo, setProfesorInfo] = useState(null);

  const [mostrarModalDarBaja, setMostrarModalDarBaja] = useState(false);
  const [profesorDarBaja, setProfesorDarBaja] = useState(null);

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

  // Filtros (las listas se derivan del dataset)
  const [materiasDisponibles, setMateriasDisponibles] = useState([]);
  const [departamentosDisponibles, setDepartamentosDisponibles] = useState([]);

  const [filtros, setFiltros] = useState(() => {
    const saved = localStorage.getItem('filtros_profesores');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          busqueda: parsed.busqueda ?? '',
          materiaSeleccionada: parsed.materiaSeleccionada ?? '',
          departamentoSeleccionado: parsed.departamentoSeleccionado ?? '',
          filtroActivo: parsed.filtroActivo ?? null,
        };
      } catch {}
    }
    return {
      busqueda: '',
      materiaSeleccionada: '',
      departamentoSeleccionado: '',
      filtroActivo: null,
    };
  });

  // Acordeones
  const [openSecciones, setOpenSecciones] = useState({
    materia: false,
    departamento: false,
  });

  const { busqueda, materiaSeleccionada, departamentoSeleccionado, filtroActivo } = filtros;
  const busquedaDefer = useDeferredValue(busqueda);

  const hayFiltros = !!(
    (busquedaDefer && busquedaDefer.trim() !== '') ||
    (materiaSeleccionada && materiaSeleccionada !== '') ||
    (departamentoSeleccionado && departamentoSeleccionado !== '')
  );

  // Rol del usuario para ocultar botones en rol "vista"
  const [isVista, setIsVista] = useState(false);
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('usuario'));
      const role = (u?.rol || '').toString().toLowerCase();
      setIsVista(role === 'vista');
    } catch {
      setIsVista(false);
    }
  }, []);

  // === LISTAS ÚNICAS ===
  const materiasUnicas = useMemo(() => {
    const set = new Set(
      (profesoresDB || [])
        .flatMap(p => Array.isArray(p?.materias) ? p.materias : (p?.materia_principal ? [p.materia_principal] : []))
        .filter(Boolean)
        .map(s => s.toString().trim())
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [profesoresDB]);

  const departamentosUnicos = useMemo(() => {
    const set = new Set(
      (profesoresDB || [])
        .map(p => p?.departamento || p?.area || '')
        .filter(Boolean)
        .map(s => s.toString().trim())
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [profesoresDB]);

  useEffect(() => {
    setMateriasDisponibles(materiasUnicas);
  }, [materiasUnicas]);

  useEffect(() => {
    setDepartamentosDisponibles(departamentosUnicos);
  }, [departamentosUnicos]);

  const profesoresFiltrados = useMemo(() => {
    let resultados = profesores;

    if (busquedaDefer && busquedaDefer.trim() !== '') {
      const q = normalizar(busquedaDefer);
      resultados = resultados.filter(
        (p) =>
          p._nyap.includes(q) ||
          p._dni.includes(q)
      );
    }

    if (materiaSeleccionada && materiaSeleccionada !== '') {
      const matNorm = normalizar(materiaSeleccionada);
      resultados = resultados.filter((p) => {
        const lista = Array.isArray(p?.materias) ? p.materias : (p?.materia_principal ? [p.materia_principal] : []);
        return lista.some(m => normalizar(m) === matNorm);
      });
    }

    if (departamentoSeleccionado && departamentoSeleccionado !== '') {
      const depNorm = normalizar(departamentoSeleccionado);
      resultados = resultados.filter((p) =>
        normalizar(p?.departamento ?? p?.area ?? '') === depNorm
      );
    }

    if (filtroActivo === 'todos') {
      resultados = profesores;
    }

    return resultados;
  }, [profesores, busquedaDefer, materiaSeleccionada, departamentoSeleccionado, filtroActivo]);

  const puedeExportar = useMemo(() => {
    return (hayFiltros || filtroActivo === 'todos') && profesoresFiltrados.length > 0 && !cargando;
  }, [hayFiltros, filtroActivo, profesoresFiltrados.length, cargando]);

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
  useEffect(() => {
    if (profesoresFiltrados.length > 0) {
      const timer = setTimeout(() => setBloquearInteraccion(false), 300);
      return () => clearTimeout(timer);
    }
  }, [profesoresFiltrados]);

  useEffect(() => {
    const handleClickOutsideFiltros = (event) => {
      if (filtrosRef.current && !filtrosRef.current.contains(event.target)) {
        setMostrarFiltros(false);
      }
    };

    const handleClickOutsideTable = (event) => {
      if (!event.target.closest('.pro-row')) {
        setProfesorSeleccionado(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutsideFiltros);
    document.addEventListener('click', handleClickOutsideTable);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideFiltros);
      document.removeEventListener('click', handleClickOutsideTable);
    };
  }, []);

  const mostrarToast = useCallback((mensaje, tipo = 'exito') => {
    setToast({ mostrar: true, tipo, mensaje });
  }, []);

  // ======= Apertura/cierre de modales =======
  // 👉 Abrimos primero con datos base y luego enriquecemos con fetch (evita que “no se vea nada”).
  const abrirModalInfo = useCallback((profesorBase) => {
    if (!profesorBase) return;
    setProfesorInfo(profesorBase);
    setMostrarModalInfo(true);

    // fetch en segundo plano para traer campos extendidos
    (async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/api.php?action=profesores&id=${encodeURIComponent(profesorBase.id_profesor)}&ts=${Date.now()}`
        );
        const data = await res.json();
        if (data?.exito && Array.isArray(data.profesores) && data.profesores.length > 0) {
          const extendido = data.profesores[0];
          setProfesorInfo((prev) => ({ ...(prev || profesorBase), ...extendido }));
        }
      } catch {
        // silencioso: ya mostramos lo base
      }
    })();
  }, []);

  const cerrarModalInfo = useCallback(() => {
    setMostrarModalInfo(false);
    setProfesorInfo(null);
  }, []);

  const abrirModalEliminar = useCallback((profesor) => {
    setProfesorAEliminar(profesor);
    setMostrarModalEliminar(true);
  }, []);

  const cerrarModalEliminar = useCallback(() => {
    setMostrarModalEliminar(false);
    setProfesorAEliminar(null);
  }, []);

  const abrirModalDarBaja = useCallback((profesor) => {
    setProfesorDarBaja(profesor);
    setMostrarModalDarBaja(true);
  }, []);

  const cerrarModalDarBaja = useCallback(() => {
    setMostrarModalDarBaja(false);
    setProfesorDarBaja(null);
  }, []);

  // Carga inicial
  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        setCargando(true);

        const response = await fetch(`${BASE_URL}/api.php?action=profesores`);
        const data = await response.json();

        if (data.exito) {
          const procesados = (data.profesores || []).map((p) => {
            const nyap = p?.nombre_completo ?? '';
            return {
              ...p,
              _nyap: normalizar(nyap),
              _dni: String(p?.dni ?? p?.num_documento ?? '').toLowerCase(),
            };
          });

          setProfesores(procesados);
          setProfesoresDB(procesados);
        } else {
          mostrarToast(`Error al obtener profesores: ${data.mensaje}`, 'error');
        }
      } catch (error) {
        mostrarToast('Error de red al obtener profesores', 'error');
      } finally {
        setCargando(false);
      }
    };

    cargarDatosIniciales();

    const handlePopState = () => {
      if (window.location.pathname === '/panel') {
        setFiltros({
          busqueda: '',
          materiaSeleccionada: '',
          departamentoSeleccionado: '',
          filtroActivo: null,
        });
        localStorage.removeItem('filtros_profesores');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [mostrarToast]);

  useEffect(() => {
    localStorage.setItem('filtros_profesores', JSON.stringify(filtros));
  }, [filtros]);

  useEffect(() => {
    const prev = prevBusquedaRef.current || '';
    const ahora = (busquedaDefer || '').trim();
    if (prev === '' && ahora !== '') {
      triggerCascadaConPreMask();
    }
    prevBusquedaRef.current = ahora;
  }, [busquedaDefer, triggerCascadaConPreMask]);

  /* ================================
     Acciones de fila/lista
  ================================= */
  const manejarSeleccion = useCallback(
    (profesor) => {
      if (bloquearInteraccion || animacionActiva) return;
      setProfesorSeleccionado((prev) => (prev?.id_profesor !== profesor.id_profesor ? profesor : null));
    },
    [bloquearInteraccion, animacionActiva]
  );

  const eliminarProfesor = useCallback(
    async (id) => {
      try {
        const response = await fetch(`${BASE_URL}/api.php?action=eliminar_profesor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_profesor: id }),
        });

        const data = await response.json();
        if (data.exito) {
          setProfesores((prev) => prev.filter((p) => p.id_profesor !== id));
          setProfesoresDB((prev) => prev.filter((p) => p.id_profesor !== id));
          mostrarToast('Profesor eliminado correctamente');
        } else {
          mostrarToast(`Error al eliminar: ${data.mensaje}`, 'error');
        }
      } catch (error) {
        mostrarToast('Error de red al intentar eliminar', 'error');
      } finally {
        cerrarModalEliminar();
      }
    },
    [mostrarToast, cerrarModalEliminar]
  );

  const darDeBajaProfesor = useCallback(
    async (id, motivo) => {
      try {
        const response = await fetch(`${BASE_URL}/api.php?action=dar_baja_profesor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_profesor: id, motivo }),
        });
        const data = await response.json();

        if (data.exito) {
          setProfesores((prev) => prev.filter((p) => p.id_profesor !== id));
          setProfesoresDB((prev) =>
            prev.map((p) => (p.id_profesor === id ? { ...p, activo: 0, motivo, ingreso: data.fecha || p.ingreso } : p))
          );
          mostrarToast('Profesor dado de baja correctamente');
        } else {
          mostrarToast(`Error: ${data.mensaje}`, 'error');
        }
      } catch (error) {
        mostrarToast('Error de red al intentar dar de baja', 'error');
      } finally {
        cerrarModalDarBaja();
      }
    },
    [mostrarToast, cerrarModalDarBaja]
  );

  const construirDomicilio = useCallback((domicilio) => (domicilio || '').trim(), []);

  // Exporta SOLO lo visible
  const exportarExcel = useCallback(() => {
    if (!puedeExportar) {
      mostrarToast('No hay filas visibles para exportar.', 'error');
      return;
    }

    const filas = profesoresFiltrados.map((p) => ({
      'ID Profesor': p?.id_profesor ?? '',
      'Apellido y Nombre (DB)': p?.nombre_completo ?? '',
      'Cargo': p?.cargo_nombre ?? '',
      'Materia principal': p?.materia_principal ?? '',
      'Total materias': p?.materias_total ?? 0,
      'Tipo de documento': p?.tipo_documento_nombre ?? '',
      'Sigla': p?.tipo_documento_sigla ?? '',
      'Nº Documento': p?.num_documento ?? p?.dni ?? '',
      'Sexo': p?.sexo_nombre ?? '',
      'Teléfono': p?.telefono ?? '',
      'Fecha de ingreso': formatearFechaISO(p?.ingreso ?? ''),
      'Domicilio': construirDomicilio(p?.domicilio),
      'Localidad': p?.localidad ?? '',
      'Departamento': p?.departamento ?? p?.area ?? '',
    }));

    const headers = [
      'ID Profesor','Apellido y Nombre (DB)','Cargo','Materia principal','Total materias',
      'Tipo de documento','Sigla','Nº Documento','Sexo','Teléfono','Fecha de ingreso',
      'Domicilio','Localidad','Departamento',
    ];

    const ws = XLSX.utils.json_to_sheet(filas, { header: headers });

    ws['!cols'] = [
      { wch: 12 },{ wch: 28 },{ wch: 20 },{ wch: 26 },{ wch: 14 },
      { wch: 22 },{ wch: 8  },{ wch: 16 },{ wch: 10 },{ wch: 14 },
      { wch: 14 },{ wch: 28 },{ wch: 20 },{ wch: 22 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profesores');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');

    const sufijo = filtroActivo === 'todos' ? 'Todos' : 'Filtrados';
    const fechaStr = `${yyyy}-${mm}-${dd}`;
    saveAs(blob, `Profesores_${sufijo}_${fechaStr}(${filas.length}).xlsx`);
  }, [puedeExportar, profesoresFiltrados, filtroActivo, mostrarToast, construirDomicilio]);

  // Mostrar todos
  const handleMostrarTodos = useCallback(() => {
    setFiltros({
      busqueda: '',
      materiaSeleccionada: '',
      departamentoSeleccionado: '',
      filtroActivo: 'todos',
    });
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  // Handlers filtros
  const handleBuscarChange = useCallback((valor) => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: valor };
      next.filtroActivo =
        (valor?.trim() || prev.materiaSeleccionada || prev.departamentoSeleccionado)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const handleFiltrarPorMateria = useCallback((materia) => {
    setFiltros((prev) => {
      const next = { ...prev, materiaSeleccionada: materia };
      next.filtroActivo =
        (prev.busqueda?.trim() || materia || prev.departamentoSeleccionado)
          ? 'filtros'
          : null;
      return next;
    });
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleFiltrarPorDepartamento = useCallback((departamento) => {
    setFiltros((prev) => {
      const next = { ...prev, departamentoSeleccionado: departamento };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.materiaSeleccionada || departamento)
          ? 'filtros'
          : null;
      return next;
    });
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  // Quitar chips individuales
  const quitarBusqueda = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: '' };
      next.filtroActivo =
        (prev.materiaSeleccionada || prev.departamentoSeleccionado)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarMateria = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, materiaSeleccionada: '' };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.departamentoSeleccionado)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarDepartamento = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, departamentoSeleccionado: '' };
      next.filtroActivo =
        (prev.busqueda?.trim() || prev.materiaSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  // Limpieza total
  const limpiarTodosLosChips = useCallback(() => {
    setFiltros((prev) => ({
      ...prev,
      busqueda: '',
      materiaSeleccionada: '',
      departamentoSeleccionado: '',
      filtroActivo: null,
    }));
  }, []);

  /* ================================
     Badge de materias
  ================================= */
  const BadgeMaterias = ({ total }) => {
    if (!total || total <= 1) return null;
    return (
      <span
        className="pro-badge-materias"
        title={`${total} materias`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 8,
          minWidth: 20,
          height: 20,
          padding: '0 6px',
          borderRadius: 999,
          fontSize: 12,
          lineHeight: '20px',
          background: 'var(--soc-primary, #2c7be5)',
          color: 'white',
          fontWeight: 600,
        }}
      >
        {total}
      </span>
    );
  };

  /* ================================
     Fila virtualizada (desktop)
  ================================= */
  const Row = React.memo(({ index, style, data }) => {
    const {
      rows,
      profesorSeleccionado,
      manejarSeleccion,
      isVista,
      abrirModalInfo,
      abrirModalEliminar,
      abrirModalDarBaja,
      navigate,
      animacionActiva,
      preCascada,
    } = data;

    const profesor = rows[index];
    const esFilaPar = index % 2 === 0;
    const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = preCascada && index < MAX_CASCADE_ITEMS;

    const materiaPrincipal = profesor.materia_principal ?? '';
    const nombreDesdeDB = profesor.nombre_completo ?? '';

    return (
      <div
        style={{
          ...style,
          animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
          opacity: preMask ? 0 : undefined,
          transform: preMask ? 'translateY(8px)' : undefined,
        }}
        className={`pro-row ${esFilaPar ? 'pro-even-row' : 'pro-odd-row'} ${profesorSeleccionado?.id_profesor === profesor.id_profesor ? 'pro-selected-row' : ''} ${willAnimate ? 'pro-cascade' : ''}`}
        onClick={() => manejarSeleccion(profesor)}
      >
        <div className="pro-column pro-column-dni" title={profesor.id_profesor}>
          {profesor.id_profesor}
        </div>

        <div className="pro-column pro-column-nombre" title={nombreDesdeDB}>
          {nombreDesdeDB}
        </div>

        <div className="pro-column pro-column-materia" title={materiaPrincipal}>
          <span>{materiaPrincipal}</span>
          <BadgeMaterias total={profesor.materias_total} />
        </div>

        <div className="pro-column pro-icons-column">
          {profesorSeleccionado?.id_profesor === profesor.id_profesor && (
            <div className="pro-icons-container">
              {/* INFO */}
              <button
                className="pro-iconchip is-info"
                title="Ver información"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirModalInfo(profesor);
                }}
                aria-label="Ver información"
              >
                <FaInfoCircle />
              </button>

              {/* SOLO Admin: Editar / Eliminar / Dar de baja */}
              {!isVista && (
                <>
                  <button
                    className="pro-iconchip is-edit"
                    title="Editar"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/profesores/editar/${profesor.id_profesor}`);
                    }}
                    aria-label="Editar"
                  >
                    <FaEdit />
                  </button>

                  <button
                    className="pro-iconchip is-delete"
                    title="Eliminar"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModalEliminar(profesor);
                    }}
                    aria-label="Eliminar"
                  >
                    <FaTrash />
                  </button>

                  <button
                    className="pro-iconchip is-baja"
                    title="Dar de baja"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModalDarBaja(profesor);
                    }}
                    aria-label="Dar de baja"
                  >
                    <FaUserMinus />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  });

  /* ================================
     Render
  ================================= */
  const hayChips = !!(busqueda || materiaSeleccionada || departamentoSeleccionado);

  return (
    <div className="pro-profesor-container">
      <div className="pro-profesor-box">
        {toast.mostrar && (
          <Toast
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            onClose={() => setToast({ mostrar: false, tipo: '', mensaje: '' })}
            duracion={3000}
          />
        )}

        {/* Header superior */}
        <div className="pro-front-row-pro">
          <span className="pro-profesor-title">Gestión de Profesores</span>

          {/* Búsqueda */}
          <div className="pro-search-input-container">
            <input
              type="text"
              placeholder="Buscar por nombre DB o DNI"
              className="pro-search-input"
              value={busqueda}
              onChange={(e) => handleBuscarChange(e.target.value)}
              disabled={cargando}
            />
            {busqueda ? (
              <FaTimes className="pro-clear-search-icon" onClick={quitarBusqueda} />
            ) : null}
            <button className="pro-search-button" title="Buscar">
              <FaSearch className="pro-search-icon" />
            </button>
          </div>

          {/* Filtros */}
          <div className="pro-filtros-container" ref={filtrosRef}>
            <button
              className="pro-filtros-button"
              onClick={() => {
                setMostrarFiltros((prev) => {
                  const next = !prev;
                  if (next) setOpenSecciones((s) => ({ ...s, materia: false }));
                  return next;
                });
              }}
              disabled={cargando}
            >
              <FaFilter className="pro-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown className={`pro-chevron-icon ${mostrarFiltros ? 'pro-rotate' : ''}`} />
            </button>

            {mostrarFiltros && (
              <div className="pro-filtros-menu" role="menu">
                {/* MATERIA */}
                <div className="pro-filtros-group">
                  <button
                    type="button"
                    className={`pro-filtros-group-header ${openSecciones.materia ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, materia: !s.materia }))}
                    aria-expanded={openSecciones.materia}
                  >
                    <span className="pro-filtros-group-title">Filtrar por materia</span>
                    <FaChevronDown className="pro-accordion-caret" />
                  </button>

                  <div className={`pro-filtros-group-body ${openSecciones.materia ? 'is-open' : 'is-collapsed'}`}>
                    <div className="pro-grid-filtros">
                      {(materiasDisponibles.length ? materiasDisponibles : materiasUnicas).map((mat) => (
                        <button
                          key={`mat-${mat}`}
                          className={`pro-chip-filtro ${filtros.materiaSeleccionada === mat ? 'pro-active' : ''}`}
                          onClick={() => handleFiltrarPorMateria(mat)}
                          title={`Filtrar por materia ${mat}`}
                        >
                          {mat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* DEPARTAMENTO */}
                <div className="pro-filtros-group">
                  <button
                    type="button"
                    className={`pro-filtros-group-header ${openSecciones.departamento ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, departamento: !s.departamento }))}
                    aria-expanded={openSecciones.departamento}
                  >
                    <span className="pro-filtros-group-title">Filtrar por departamento</span>
                    <FaChevronDown className="pro-accordion-caret" />
                  </button>

                  <div className={`pro-filtros-group-body ${openSecciones.departamento ? 'is-open' : 'is-collapsed'}`}>
                    <div className="pro-grid-filtros">
                      {(departamentosDisponibles.length ? departamentosDisponibles : departamentosUnicos).map((dep) => (
                        <button
                          key={`dep-${dep}`}
                          className={`pro-chip-filtro ${filtros.departamentoSeleccionado === dep ? 'pro-active' : ''}`}
                          onClick={() => handleFiltrarPorDepartamento(dep)}
                          title={`Filtrar por departamento ${dep}`}
                        >
                          {dep}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mostrar Todos */}
                <div
                  className="pro-filtros-menu-item pro-mostrar-todas"
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
        <div className="pro-profesores-list">
          <div className="pro-contenedor-list-items">
            {/* Contador */}
            <div className="pro-left-inline">
              <div className="pro-contador-container">
                <span className="pro-profesores-desktop">
                  Cant profesores: {(hayFiltros || filtroActivo === 'todos') ? profesoresFiltrados.length : 0}
                </span>
                <span className="pro-profesores-mobile">
                  {(hayFiltros || filtroActivo === 'todos') ? profesoresFiltrados.length : 0}
                </span>
                <FaUsers className="pro-icono-profesor" />
              </div>

              {/* Chips */}
              {hayChips && (
                <div className="pro-chips-container">
                  {busqueda && (
                    <div className="pro-chip-mini" title="Filtro activo">
                      <span className="pro-chip-mini-text pro-profesores-desktop">Búsqueda: {busqueda}</span>
                      <span className="pro-chip-mini-text pro-profesores-mobile">
                        {busqueda.length > 3 ? `${busqueda.substring(0, 3)}...` : busqueda}
                      </span>
                      <button
                        className="pro-chip-mini-close"
                        onClick={quitarBusqueda}
                        aria-label="Quitar filtro"
                        title="Quitar este filtro"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {materiaSeleccionada && (
                    <div className="pro-chip-mini" title="Filtro activo">
                      <span className="pro-chip-mini-text pro-profesores-desktop">Materia: {materiaSeleccionada}</span>
                      <span className="pro-chip-mini-text pro-profesores-mobile">{materiaSeleccionada}</span>
                      <button
                        className="pro-chip-mini-close"
                        onClick={quitarMateria}
                        aria-label="Quitar filtro"
                        title="Quitar este filtro"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {departamentoSeleccionado && (
                    <div className="pro-chip-mini" title="Filtro activo">
                      <span className="mi-chip-mini-text pro-profesores-desktop">Departamento: {departamentoSeleccionado}</span>
                      <span className="mi-chip-mini-text pro-profesores-mobile">{departamentoSeleccionado}</span>
                      <button
                        className="pro-chip-mini-close"
                        onClick={quitarDepartamento}
                        aria-label="Quitar filtro"
                        title="Quitar este filtro"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="pro-chip-mini pro-chip-clear-all"
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
            <div className="pro-box-table">
              <div className="pro-header">
                <div className="pro-column-header pro-header-dni">ID Docente</div>
                <div className="pro-column-header pro-header-nombre">Apellido y Nombre</div>
                <div className="pro-column-header pro-header-materia">Materia</div>
                <div className="pro-column-header pro-icons-column">Acciones</div>
              </div>

              <div className="pro-body">
                {!hayFiltros && filtroActivo !== 'todos' ? (
                  <div className="pro-no-data-message">
                    <div className="pro-message-content">
                      <p>Por favor aplicá búsqueda o filtros para ver los profesores</p>
                      <button className="pro-btn-show-all" onClick={handleMostrarTodos}>
                        Mostrar todos los profesores
                      </button>
                    </div>
                  </div>
                ) : mostrarLoader ? (
                  <div className="pro-loading-spinner-container">
                    <div className="pro-loading-spinner"></div>
                  </div>
                ) : profesores.length === 0 ? (
                  <div className="pro-no-data-message">
                    <div className="pro-message-content">
                      <p>No hay profesores registrados</p>
                    </div>
                  </div>
                ) : profesoresFiltrados.length === 0 ? (
                  <div className="pro-no-data-message">
                    <div className="pro-message-content">
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
                          itemCount={profesoresFiltrados.length}
                          itemSize={48}
                          itemData={{
                            rows: profesoresFiltrados,
                            profesorSeleccionado,
                            manejarSeleccion,
                            isVista,
                            abrirModalInfo,
                            abrirModalEliminar,
                            abrirModalDarBaja,
                            navigate,
                            animacionActiva,
                            preCascada,
                          }}
                          overscanCount={10}
                          itemKey={(index, data) => data.rows[index]?.id_profesor ?? index}
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
              className={`pro-cards-wrapper ${
                animacionActiva && profesoresFiltrados.length <= MAX_CASCADE_ITEMS ? 'pro-cascade-animation' : ''
              }`}
            >
              {!hayFiltros && filtroActivo !== 'todos' ? (
                <div className="pro-no-data-message pro-no-data-mobile">
                  <div className="pro-message-content">
                    <p>Usá la búsqueda o aplicá filtros para ver resultados</p>
                    <button className="pro-btn-show-all" onClick={handleMostrarTodos}>
                      Mostrar todos
                    </button>
                  </div>
                </div>
              ) : mostrarLoader ? (
                <div className="pro-no-data-message pro-no-data-mobile">
                  <div className="pro-message-content">
                    <p>Cargando profesores...</p>
                  </div>
                </div>
              ) : profesores.length === 0 ? (
                <div className="pro-no-data-message pro-no-data-mobile">
                  <div className="pro-message-content">
                    <p>No hay profesores registrados</p>
                  </div>
                </div>
              ) : profesoresFiltrados.length === 0 ? (
                <div className="pro-no-data-message pro-no-data-mobile">
                  <div className="pro-message-content">
                    <p>No hay resultados con los filtros actuales</p>
                  </div>
                </div>
              ) : (
                profesoresFiltrados.map((profesor, index) => {
                  const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
                  const preMask = preCascada && index < MAX_CASCADE_ITEMS;
                  const materiaPrincipal = profesor.materia_principal ?? '';
                  const nombreDesdeDB = profesor.nombre_completo ?? '';
                  return (
                    <div
                      key={profesor.id_profesor || `card-${index}`}
                      className={`pro-card ${willAnimate ? 'pro-cascade' : ''}`}
                      style={{
                        animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
                        opacity: preMask ? 0 : undefined,
                        transform: preMask ? 'translateY(8px)' : undefined,
                      }}
                      onClick={() => manejarSeleccion(profesor)}
                    >
                      <div className="pro-card-header">
                        <h3 className="pro-card-title">{nombreDesdeDB}</h3>
                      </div>

                      <div className="pro-card-body">
                        <div className="pro-card-row">
                          <span className="pro-card-label">ID</span>
                          <span className="pro-card-value">{profesor.id_profesor}</span>
                        </div>
                        <div className="pro-card-row">
                          <span className="pro-card-label">Materia</span>
                          <span className="pro-card-value">
                            {materiaPrincipal}
                            <BadgeMaterias total={profesor.materias_total} />
                          </span>
                        </div>
                      </div>

                      <div className="pro-card-actions">
                        {/* INFO */}
                        <button
                          className="pro-action-btn pro-iconchip is-info"
                          title="Información"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirModalInfo(profesor);
                          }}
                          aria-label="Información"
                        >
                          <FaInfoCircle />
                        </button>

                        {/* SOLO Admin: Editar / Eliminar / Dar de baja */}
                        {!isVista && (
                          <>
                            <button
                              className="pro-action-btn pro-iconchip is-edit"
                              title="Editar"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/profesores/editar/${profesor.id_profesor}`);
                              }}
                              aria-label="Editar"
                            >
                              <FaEdit />
                            </button>
                            <button
                              className="pro-action-btn pro-iconchip is-delete"
                              title="Eliminar"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalEliminar(profesor);
                              }}
                              aria-label="Eliminar"
                            >
                              <FaTrash />
                            </button>
                            <button
                              className="pro-action-btn pro-iconchip is-baja"
                              title="Dar de baja"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalDarBaja(profesor);
                              }}
                              aria-label="Dar de baja"
                            >
                              <FaUserMinus />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* BOTONERA INFERIOR */}
        <div className="pro-down-container">
          <button
            className="pro-profesor-button pro-hover-effect pro-volver-atras"
            onClick={() => {
              setFiltros({
                busqueda: '',
                materiaSeleccionada: '',
                departamentoSeleccionado: '',
                filtroActivo: null,
              });
              localStorage.removeItem('filtros_profesores');
              navigate('/panel');
            }}
            aria-label="Volver"
            title="Volver"
          >
            <FaArrowLeft className="pro-profesor-icon-button" />
            <p>Volver Atrás</p>
          </button>

          <div className="pro-botones-container">
            {!isVista && (
              <button
                className="pro-profesor-button pro-hover-effect"
                onClick={() => navigate('/profesores/agregar')}
                aria-label="Agregar"
                title="Agregar profesor"
              >
                <FaUserPlus className="pro-profesor-icon-button" />
                <p>Agregar Profesor</p>
              </button>
            )}

            <button
              className="pro-profesor-button pro-hover-effect"
              onClick={exportarExcel}
              disabled={!puedeExportar}
              aria-label="Exportar"
              title={puedeExportar ? 'Exportar a Excel' : 'No hay filas visibles para exportar'}
            >
              <FaFileExcel className="pro-profesor-icon-button" />
              <p>Exportar a Excel</p>
            </button>

            <button
              className="pro-profesor-button pro-hover-effect pro-btn-baja-nav"
              onClick={() => navigate('/profesores/baja')}
              title="Dados de Baja"
              aria-label="Dados de Baja"
            >
              <FaUserSlash className="pro-profesor-icon-button" />
              <p>Dados de Baja</p>
            </button>
          </div>
        </div>
      </div>

      {/* ======= MODALES ======= */}
      <ModalEliminarProfesor
        mostrar={mostrarModalEliminar}
        profesor={profesorAEliminar}
        onClose={cerrarModalEliminar}
        onEliminar={eliminarProfesor}
      />

      <ModalInfoProfesor
        mostrar={mostrarModalInfo}
        profesor={profesorInfo}
        onClose={cerrarModalInfo}
      />

      <ModalDarBajaProfesor
        mostrar={mostrarModalDarBaja}
        profesor={profesorDarBaja}
        onClose={cerrarModalDarBaja}
        onDarBaja={darDeBajaProfesor}
      />
    </div>
  );
};

export default Profesores;

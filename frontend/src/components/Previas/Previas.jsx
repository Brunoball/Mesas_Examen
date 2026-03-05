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
  FaSearch,
  FaTimes,
  FaUsers,
  FaFilter,
  FaChevronDown,
  FaTrash,
  FaPlus,
  FaEdit,
  FaCheckCircle,
  FaBroom,
  FaUpload,
  FaUserMinus,
  FaList,
} from 'react-icons/fa';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Toast from '../Global/Toast';

import InscribirModal from './modales/InscribirModal';
import ModalInfoPrevia from './modales/ModalInfoPrevia';
import ImportarPreviasModal from './modales/ImportarPreviasModal';
import DarBajaPreviaModal from './modales/DarBajaPreviaModal';
import ConfirmarCopiaModal from './modales/ConfirmarCopiaModal';

import '../Global/roots.css';
import '../Global/section-ui.css';
import './Previas.css';

/* ================================
   Utils
================================ */
const normalizar = (str = '') =>
  str
    .toString()
    .toLowerCase?.() ?? String(str).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const MAX_CASCADE_ITEMS = 15;
const ITEM_SIZE = 48;

// Clave para sessionStorage
const SCROLL_KEY = 'previas_scroll_offset';

const formatearFechaISO = (v) => {
  if (!v || typeof v !== 'string') return '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const esTerMatPorCond = (p) =>
  ((p?.condicion_nombre || '') + '').toUpperCase().includes('TER.MAT');

const esCondicionPrevia = (p) => {
  const condicion = String(p?.condicion_nombre || '').toUpperCase().trim();
  return condicion === 'PREVIA' || condicion.includes('PREVIA');
};

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

/* ========= Modal de confirmación ========= */
const ConfirmActionModal = ({
  open,
  mode,
  item,
  loading,
  error,
  onCancel,
  onConfirm,
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const isWarn = mode === 'desinscribir';
  const isDanger = mode === 'eliminar' || mode === 'limpiar';

  const titulo =
    mode === 'desinscribir'
      ? 'Marcar como NO inscripto'
      : mode === 'limpiar'
      ? 'Vaciar tabla de previas'
      : 'Confirmar eliminación';

  const subtitulo =
    mode === 'desinscribir'
      ? '¿Confirmás pasar este alumno a NO inscripto?'
      : mode === 'limpiar'
      ? 'Esta operación no se puede deshacer. Solo continuá si estás absolutamente seguro de que querés reiniciar toda la información de previas y mesas de examen.'
      : 'Esta acción eliminará el registro de forma definitiva.';

  return (
    <div
      className="logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onMouseDown={onCancel}
    >
      <div
        className={`logout-modal-container ${
          isWarn ? 'logout-modal--warn' : isDanger ? 'logout-modal--danger' : ''
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={`logout-modal__icon ${isWarn ? 'is-warn' : 'is-danger'}`}
          aria-hidden="true"
        >
          <FaTrash />
        </div>

        <h3
          id="confirm-modal-title"
          className="logout-modal-title logout-modal-title--danger"
        >
          {titulo}
        </h3>

        <p className="logout-modal-text">{subtitulo}</p>

        {item && mode !== 'limpiar' && (
          <div className="prev-modal-item" style={{ marginTop: 12 }}>
            <strong>{item.alumno}</strong> — DNI {item.dni}
            <br />
            Materia: {item.materia_nombre}
          </div>
        )}

        {error && (
          <div className="prev-modal-error" role="alert">
            {error}
          </div>
        )}

        <div className="logout-modal-buttons">
          <button
            type="button"
            className="logout-btn logout-btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            id="inscribir"
            type="button"
            className="logout-btn logout-btn--solid-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading
              ? 'Procesando...'
              : mode === 'desinscribir'
              ? 'Confirmar'
              : mode === 'limpiar'
              ? 'Vaciar'
              : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ========= Outer de react-window con gutter estable ========= */
const OuterWithStableGutter = React.forwardRef((props, ref) => (
  <div {...props} ref={ref} className={`rw-outer ${props.className || ''}`} />
));
OuterWithStableGutter.displayName = 'OuterWithStableGutter';

/* ================================
   Componente Previas
================================ */
const Previas = () => {
  const [previas, setPrevias] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [tab, setTab] = useState('todos');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [animacionActiva, setAnimacionActiva] = useState(false);
  const [preCascada, setPreCascada] = useState(false);

  const filtrosRef = useRef(null);
  const prevBusquedaRef = useRef('');
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  const [toast, setToast] = useState({
    mostrar: false,
    tipo: '',
    mensaje: '',
  });

  const [openSecciones, setOpenSecciones] = useState({
    curso: false,
    division: false,
    condicion: false,
  });

  const [modal, setModal] = useState({
    open: false,
    mode: null,
    item: null,
    loading: false,
    error: '',
  });

  const [modalCopia, setModalCopia] = useState({
    open: false,
    loading: false,
    error: '',
  });

  const [modalBaja, setModalBaja] = useState({
    open: false,
    item: null,
    loading: false,
    error: '',
  });

  const [modalIns, setModalIns] = useState({
    open: false,
    item: null,
    materiasAlumno: [],
    loading: false,
    error: '',
  });

  const [modalInfo, setModalInfo] = useState({
    open: false,
    item: null,
  });

  const [modalImport, setModalImport] = useState(false);

  const [listas, setListas] = useState({
    cursos: [],
    divisiones: [],
    condiciones: [],
  });

  const listRef = useRef(null);
  const savedScrollOffsetRef = useRef(0);
  const viewportHeightRef = useRef(0);

  // Para restauraciones internas (eliminar, desinscribir, baja, inscribir)
  const restorationRef = useRef(null);

  // Para restauración desde editar — persiste entre renders hasta que se use
  const scrollFromEditRef = useRef(null);

  // Indica que ya leímos el sessionStorage y hay que restaurar cuando los datos estén
  const pendingEditScrollRef = useRef(false);

  const [filtros, setFiltros] = useState(() => {
    const saved = localStorage.getItem('filtros_previas');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          busqueda: parsed.busqueda ?? '',
          cursoSeleccionado: parsed.cursoSeleccionado ?? '',
          divisionSeleccionada: parsed.divisionSeleccionada ?? '',
          condicionSeleccionada: parsed.condicionSeleccionada ?? '',
          filtroActivo: parsed.filtroActivo ?? null,
        };
      } catch {}
    }
    return {
      busqueda: '',
      cursoSeleccionado: '',
      divisionSeleccionada: '',
      condicionSeleccionada: '',
      filtroActivo: null,
    };
  });

  const {
    busqueda,
    cursoSeleccionado,
    divisionSeleccionada,
    condicionSeleccionada,
    filtroActivo,
  } = filtros;

  const busquedaDefer = useDeferredValue(busqueda);

  const hayFiltros = !!(
    (busquedaDefer && busquedaDefer.trim() !== '') ||
    (cursoSeleccionado && cursoSeleccionado !== '') ||
    (divisionSeleccionada && divisionSeleccionada !== '') ||
    (condicionSeleccionada && condicionSeleccionada !== '')
  );

  const basePorTab = useMemo(() => {
    let base = previas;
    if (tab === 'inscriptos') {
      base = previas.filter((p) => Number(p?.inscripcion ?? 0) === 1);
    }
    return [...base].sort((a, b) => {
      const nombreA = (a.alumno || '').toLowerCase();
      const nombreB = (b.alumno || '').toLowerCase();
      return nombreA.localeCompare(nombreB);
    });
  }, [tab, previas]);

  const previasFiltradas = useMemo(() => {
    let resultados = basePorTab;

    if (busquedaDefer && busquedaDefer.trim() !== '') {
      const q = normalizar(busquedaDefer);
      resultados = resultados.filter(
        (p) =>
          p._alumno?.includes(q) || p._dni?.includes(q) || p._materia?.includes(q)
      );
    }

    if (cursoSeleccionado && cursoSeleccionado !== '') {
      const curNorm = normalizar(cursoSeleccionado);
      resultados = resultados.filter(
        (p) => normalizar(p?.cursando_curso_nombre ?? '') === curNorm
      );
    }

    if (divisionSeleccionada && divisionSeleccionada !== '') {
      const divNorm = normalizar(divisionSeleccionada);
      resultados = resultados.filter(
        (p) => normalizar(p?.cursando_division_nombre ?? '') === divNorm
      );
    }

    if (condicionSeleccionada && condicionSeleccionada !== '') {
      const condNorm = normalizar(condicionSeleccionada);
      resultados = resultados.filter(
        (p) => normalizar(p?.condicion_nombre ?? '') === condNorm
      );
    }

    if (filtroActivo === 'todos') {
      resultados = basePorTab;
    }

    return resultados;
  }, [
    basePorTab,
    busquedaDefer,
    cursoSeleccionado,
    divisionSeleccionada,
    condicionSeleccionada,
    filtroActivo,
  ]);

  const puedeExportar = useMemo(
    () =>
      (hayFiltros || filtroActivo === 'todos') &&
      previasFiltradas.length > 0 &&
      !cargando,
    [hayFiltros, filtroActivo, previasFiltradas.length, cargando]
  );

  const mostrarLoader = useMemo(
    () => cargando && (hayFiltros || filtroActivo === 'todos'),
    [cargando, hayFiltros, filtroActivo]
  );

  const tablaConDatos = useMemo(() => previas.length > 0, [previas]);

  const cantidadInscriptos = useMemo(() => {
    return previas.filter((p) => Number(p?.inscripcion ?? 0) === 1).length;
  }, [previas]);

  /* ================================
     Animación en cascada
  ================================= */
  const dispararCascadaUnaVez = useCallback(
    (duracionMs) => {
      const safeMs = 400 + (MAX_CASCADE_ITEMS - 1) * 30 + 300;
      const total = typeof duracionMs === 'number' ? duracionMs : safeMs;
      if (animacionActiva) return;
      setAnimacionActiva(true);
      window.setTimeout(() => setAnimacionActiva(false), total);
    },
    [animacionActiva]
  );

  const triggerCascadaConPreMask = useCallback(() => {
    setPreCascada(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dispararCascadaUnaVez();
        setPreCascada(false);
      });
    });
  }, [dispararCascadaUnaVez]);

  const mostrarToast = useCallback((mensaje, tipo = 'exito') => {
    setToast({ mostrar: true, tipo, mensaje });
  }, []);

  /* ================================
     Helper: aplicar scroll a la lista
  ================================= */
  const aplicarScroll = useCallback((offset, itemCount) => {
    if (!listRef.current) return;
    const max = Math.max(0, itemCount * ITEM_SIZE - (viewportHeightRef.current || 0));
    const clamped = Math.min(Math.max(0, offset), max);
    listRef.current.scrollTo(clamped);
  }, []);

  /* ================================
     Carga de datos
  ================================= */
  const cargarPrevias = useCallback(async () => {
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
          materia_curso_division: `${p.materia_curso_nombre || ''} ${
            p.materia_division_nombre || ''
          }`.trim(),
        }));
        setPrevias(procesados);
      } else {
        mostrarToast(
          `Error al obtener previas: ${data?.mensaje || 'desconocido'}`,
          'error'
        );
      }
    } catch {
      mostrarToast('Error de red al obtener previas', 'error');
    } finally {
      setCargando(false);
    }
  }, [mostrarToast]);

  /* ================================
     Al montar: leer sessionStorage ANTES de cargar datos
  ================================= */
  useEffect(() => {
    const stored = sessionStorage.getItem(SCROLL_KEY);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed > 0) {
        scrollFromEditRef.current = parsed;
        pendingEditScrollRef.current = true;
      }
      sessionStorage.removeItem(SCROLL_KEY);
    }
    cargarPrevias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchListas = async () => {
      try {
        const url = `${BASE_URL}/api.php?action=listas_basicas`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.exito) throw new Error(json.mensaje || 'Error al obtener listas');

        setListas({
          cursos: json.listas?.cursos ?? [],
          divisiones: json.listas?.divisiones ?? [],
          condiciones: json.listas?.condiciones ?? [],
        });
      } catch (e) {
        console.error('Error cargando listas:', e);
      }
    };
    fetchListas();
  }, []);

  useEffect(() => {
    localStorage.setItem('filtros_previas', JSON.stringify(filtros));
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
     RESTAURAR SCROLL DESDE EDITAR
     Se activa cuando cargando pasa a false y hay datos en previasFiltradas.
     Usamos setTimeout para darle tiempo a react-window a renderizar las filas.
  ================================= */
  useEffect(() => {
    if (!pendingEditScrollRef.current) return;
    if (cargando) return;
    if (previasFiltradas.length === 0) return;

    const target = scrollFromEditRef.current;
    if (target === null) return;

    // Marcar como consumido inmediatamente para no repetir
    pendingEditScrollRef.current = false;
    scrollFromEditRef.current = null;

    // Dar tiempo a react-window para pintar las filas virtualizadas
    const timer = setTimeout(() => {
      aplicarScroll(target, previasFiltradas.length);
    }, 80);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, previasFiltradas.length]);

  /* ================================
     RESTAURAR SCROLL INTERNO
     (eliminar, baja, inscribir, desinscribir)
  ================================= */
  useEffect(() => {
    const pending = restorationRef.current;
    if (!pending || pending.type !== 'offset') return;
    if (cargando) return;
    if (previasFiltradas.length === 0) return;

    const target = pending.value;
    restorationRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        aplicarScroll(target, previasFiltradas.length);
      });
    });
  }, [previasFiltradas, cargando, aplicarScroll]);

  /* ================================
     Handlers filtros/búsqueda
  ================================= */
  const handleMostrarTodos = useCallback(() => {
    setFiltros({
      busqueda: '',
      cursoSeleccionado: '',
      divisionSeleccionada: '',
      condicionSeleccionada: '',
      filtroActivo: 'todos',
    });
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleBuscarChange = useCallback((valor) => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: valor };
      next.filtroActivo =
        valor?.trim() ||
        prev.cursoSeleccionado ||
        prev.divisionSeleccionada ||
        prev.condicionSeleccionada
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const handleFiltrarPorCurso = useCallback(
    (cursoNombre) => {
      setFiltros((prev) => {
        const next = { ...prev, cursoSeleccionado: cursoNombre };
        next.filtroActivo =
          prev.busqueda?.trim() ||
          cursoNombre ||
          prev.divisionSeleccionada ||
          prev.condicionSeleccionada
            ? 'filtros'
            : null;
        return next;
      });
      setMostrarFiltros(false);
      triggerCascadaConPreMask();
    },
    [triggerCascadaConPreMask]
  );

  const handleFiltrarPorDivision = useCallback(
    (division) => {
      setFiltros((prev) => {
        const next = { ...prev, divisionSeleccionada: division };
        next.filtroActivo =
          prev.busqueda?.trim() ||
          prev.cursoSeleccionado ||
          division ||
          prev.condicionSeleccionada
            ? 'filtros'
            : null;
        return next;
      });
      setMostrarFiltros(false);
      triggerCascadaConPreMask();
    },
    [triggerCascadaConPreMask]
  );

  const handleFiltrarPorCondicion = useCallback(
    (condNombre) => {
      setFiltros((prev) => {
        const next = { ...prev, condicionSeleccionada: condNombre };
        next.filtroActivo =
          prev.busqueda?.trim() ||
          prev.cursoSeleccionado ||
          prev.divisionSeleccionada ||
          condNombre
            ? 'filtros'
            : null;
        return next;
      });
      setMostrarFiltros(false);
      triggerCascadaConPreMask();
    },
    [triggerCascadaConPreMask]
  );

  const quitarBusqueda = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: '' };
      next.filtroActivo =
        prev.cursoSeleccionado || prev.divisionSeleccionada || prev.condicionSeleccionada
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarCurso = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, cursoSeleccionado: '' };
      next.filtroActivo =
        prev.busqueda?.trim() || prev.divisionSeleccionada || prev.condicionSeleccionada
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarDivision = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, divisionSeleccionada: '' };
      next.filtroActivo =
        prev.busqueda?.trim() || prev.cursoSeleccionado || prev.condicionSeleccionada
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarCondicion = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, condicionSeleccionada: '' };
      next.filtroActivo =
        prev.busqueda?.trim() || prev.cursoSeleccionado || prev.divisionSeleccionada
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const limpiarTodosLosChips = useCallback(() => {
    setFiltros((prev) => ({
      ...prev,
      busqueda: '',
      cursoSeleccionado: '',
      divisionSeleccionada: '',
      condicionSeleccionada: '',
      filtroActivo: null,
    }));
  }, []);

  const abrirModalAccion = useCallback(
    (p) => {
      const mode = tab === 'inscriptos' ? 'desinscribir' : 'eliminar';
      setModal({ open: true, mode, item: p, loading: false, error: '' });
    },
    [tab]
  );

  const abrirModalLimpiar = useCallback(() => {
    setModal({ open: true, mode: 'limpiar', item: null, loading: false, error: '' });
  }, []);

  const abrirModalCopia = useCallback(() => {
    setModalCopia({ open: true, loading: false, error: '' });
  }, []);

  const cancelarModalCopia = useCallback(() => {
    if (modalCopia.loading) return;
    setModalCopia({ open: false, loading: false, error: '' });
  }, [modalCopia.loading]);

  const confirmarGuardarCopia = useCallback(async () => {
    try {
      setModalCopia((m) => ({ ...m, loading: true, error: '' }));

      const res = await fetch(
        `${BASE_URL}/api.php?action=previas_guardar_copia_inscriptos`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || 'No se pudo guardar la copia');

      setModalCopia({ open: false, loading: false, error: '' });
      mostrarToast(`Copia guardada. Registros copiados: ${json?.copiados ?? 0}`, 'exito');
    } catch (e) {
      setModalCopia((m) => ({
        ...m,
        loading: false,
        error: e.message || 'Error desconocido',
      }));
    }
  }, [mostrarToast]);

  const abrirModalBaja = useCallback((p) => {
    setModalBaja({ open: true, item: p, loading: false, error: '' });
  }, []);

  const cerrarModalBaja = useCallback(() => {
    if (modalBaja.loading) return;
    setModalBaja({ open: false, item: null, loading: false, error: '' });
  }, [modalBaja.loading]);

  const confirmarDarBaja = useCallback(
    async ({ fecha_baja, motivo_baja }) => {
      try {
        setModalBaja((m) => ({ ...m, loading: true, error: '' }));

        restorationRef.current = {
          type: 'offset',
          value: savedScrollOffsetRef.current || 0,
        };

        const payload = {
          id_previa: modalBaja.item?.id_previa,
          fecha_baja,
          motivo_baja,
        };

        const res = await fetch(`${BASE_URL}/api.php?action=previa_dar_baja`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || 'No se pudo dar de baja');

        await cargarPrevias();
        setModalBaja({ open: false, item: null, loading: false, error: '' });
        mostrarToast('Previa dada de baja', 'exito');
      } catch (e) {
        setModalBaja((m) => ({
          ...m,
          loading: false,
          error: e.message || 'Error desconocido',
        }));
      }
    },
    [modalBaja.item, cargarPrevias, mostrarToast]
  );

  const confirmarAccion = useCallback(async () => {
    if (!modal.mode) return;
    try {
      setModal((m) => ({ ...m, loading: true, error: '' }));

      restorationRef.current = {
        type: 'offset',
        value: savedScrollOffsetRef.current || 0,
      };

      if (modal.mode === 'limpiar') {
        const res = await fetch(`${BASE_URL}/api.php?action=previas_lab_truncate`, {
          method: 'POST',
        });
        const js = await res.json();
        if (!js?.exito) throw new Error(js?.mensaje || 'No se pudo limpiar previas');
        mostrarToast('Tabla vaciada correctamente', 'exito');
        await cargarPrevias();
        setModal({ open: false, mode: null, item: null, loading: false, error: '' });
        return;
      }

      const action = modal.mode === 'desinscribir' ? 'previa_desinscribir' : 'previa_eliminar';

      const res = await fetch(`${BASE_URL}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_previa: modal.item?.id_previa }),
      });
      const json = await res.json();

      if (!json?.exito) throw new Error(json?.mensaje || 'Operación no realizada');
      await cargarPrevias();

      if (modal.mode === 'eliminar') mostrarToast('Registro eliminado correctamente', 'exito');
      else mostrarToast('Se marcó como NO inscripto', 'exito');

      setModal({ open: false, mode: null, item: null, loading: false, error: '' });
    } catch (e) {
      setModal((m) => ({ ...m, loading: false, error: e.message || 'Error desconocido' }));
    }
  }, [modal, mostrarToast, cargarPrevias]);

  const cancelarModal = useCallback(() => {
    if (modal.loading) return;
    setModal({ open: false, mode: null, item: null, loading: false, error: '' });
  }, [modal.loading]);

  const abrirModalInscribir = useCallback(
    (p) => {
      const dniActual = String(p?.dni ?? '').trim();
      const materiasAlumno = previas.filter(
        (x) =>
          String(x?.dni ?? '').trim() === dniActual &&
          Number(x?.id_condicion ?? 0) === 3 &&
          Number(x?.inscripcion ?? 0) === 0
      );

      setModalIns({
        open: true,
        item: p,
        materiasAlumno,
        loading: false,
        error: '',
      });
    },
    [previas]
  );

  const confirmarInscripcion = useCallback(
    async ({ ids }) => {
      if (!ids || !Array.isArray(ids) || ids.length === 0) return;
      try {
        setModalIns((m) => ({ ...m, loading: true, error: '' }));

        restorationRef.current = {
          type: 'offset',
          value: savedScrollOffsetRef.current || 0,
        };

        const res = await fetch(`${BASE_URL}/api.php?action=previa_inscribir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || 'No se pudo inscribir');

        await cargarPrevias();
        setModalIns({
          open: false,
          item: null,
          materiasAlumno: [],
          loading: false,
          error: '',
        });
        mostrarToast('Alumno inscripto correctamente', 'exito');
      } catch (e) {
        setModalIns((m) => ({ ...m, loading: false, error: e.message || 'Error desconocido' }));
      }
    },
    [mostrarToast, cargarPrevias]
  );

  const cancelarInscripcion = useCallback(() => {
    if (modalIns.loading) return;
    setModalIns({ open: false, item: null, materiasAlumno: [], loading: false, error: '' });
  }, [modalIns.loading]);

  const abrirModalInfo = useCallback((p) => {
    setModalInfo({ open: true, item: p });
  }, []);
  const cerrarModalInfo = useCallback(() => {
    setModalInfo({ open: false, item: null });
  }, []);

  const exportarExcel = useCallback(() => {
    const puede =
      (hayFiltros || filtroActivo === 'todos') && previasFiltradas.length > 0 && !cargando;
    if (!puede) {
      setToast({ mostrar: true, tipo: 'error', mensaje: 'No hay filas visibles para exportar.' });
      return;
    }

    const filas = previasFiltradas.map((p) => ({
      'ID Previa': p?.id_previa ?? '',
      Alumno: p?.alumno ?? '',
      DNI: p?.dni ?? '',
      'Año (previa)': p?.anio ?? '',
      'Curso (cursando)': p?.cursando_curso_nombre ?? '',
      'División (cursando)': p?.cursando_division_nombre ?? '',
      Materia: p?.materia_nombre ?? '',
      'Curso Materia': p?.materia_curso_nombre ?? '',
      'División Materia': p?.materia_division_nombre ?? '',
      Condición: p?.condicion_nombre ?? '',
      Inscripto: Number(p?.inscripcion ?? 0) === 1 ? 'INSCRIPTO' : 'PENDIENTE',
      'Fecha carga': formatearFechaISO(p?.fecha_carga ?? ''),
    }));

    const headers = [
      'ID Previa',
      'Alumno',
      'DNI',
      'Año (previa)',
      'Curso (cursando)',
      'División (cursando)',
      'Materia',
      'Curso Materia',
      'División Materia',
      'Condición',
      'Inscripto',
      'Fecha carga',
    ];

    const ws = XLSX.utils.json_to_sheet(filas, { header: headers });
    ws['!cols'] = [
      { wch: 10 },
      { wch: 28 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 20 },
      { wch: 26 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Previas');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');

    const sufijo =
      tab === 'inscriptos' ? 'Inscriptos' : filtroActivo === 'todos' ? 'Todos' : 'Filtrados';
    const fechaStr = `${yyyy}-${mm}-${dd}`;
    saveAs(blob, `Previas_${sufijo}_${fechaStr}(${filas.length}).xlsx`);
  }, [hayFiltros, filtroActivo, previasFiltradas, cargando, tab]);

  const handleTabChange = useCallback(
    (nuevoTab) => {
      setTab(nuevoTab);
      triggerCascadaConPreMask();
    },
    [triggerCascadaConPreMask]
  );

  const handleListScroll = useCallback(({ scrollOffset }) => {
    savedScrollOffsetRef.current = scrollOffset;
  }, []);

  // Navegar a editar guardando scroll en sessionStorage
  const handleEditarPrevia = useCallback(
    (p) => {
      sessionStorage.setItem(SCROLL_KEY, String(savedScrollOffsetRef.current || 0));
      navigate(`/previas/editar/${p.id_previa}`);
    },
    [navigate]
  );

  /* ================================
     Fila virtualizada (desktop)
  ================================= */
  const Row = React.memo(({ index, style, data }) => {
    const p = data[index];
    const esFilaPar = index % 2 === 0;
    const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = preCascada && index < MAX_CASCADE_ITEMS;

    const estado = Number(p?.inscripcion ?? 0) === 1 ? 'INSCRIPTO' : 'PENDIENTE';
    const mostrarBotonInscribir = estado === 'PENDIENTE' && esCondicionPrevia(p);

    return (
      <div
        style={{
          ...style,
          gridTemplateColumns: ' 1.5fr 0.7fr 1.3fr .6fr 0.5fr .7fr 1fr',
          animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
          opacity: preMask ? 0 : undefined,
          transform: preMask ? 'translateY(8px)' : undefined,
        }}
        className={`glob-row ${esFilaPar ? 'glob-even-row' : 'glob-odd-row'} ${
          willAnimate ? 'glob-cascade' : ''
        }`}
      >
        <div className="glob-column glob-column-nombre" title={p.alumno}>
          {p.alumno}
        </div>
        <div className="glob-column glob-column-dni" title={p.dni}>
          {p.dni}
        </div>
        <div className="glob-column" title={p.materia_nombre}>
          {p.materia_nombre}
        </div>
        <div className="glob-column" title={p.condicion_nombre}>
          {p.condicion_nombre}
        </div>

        <div className="glob-column" title={p.materia_curso_division}>
          {p.materia_curso_division}
        </div>

        <div className={`glob-column ${estado === 'INSCRIPTO' ? 'glob-badge-ok' : 'glob-badge-warn'}`}>
          {estado}
        </div>

        <div className="glob-column glob-icons-column">
          <div className="glob-icons-container">
            <button
              className="glob-iconchip is-info"
              title="Ver información"
              onClick={() => abrirModalInfo(p)}
              aria-label="Ver información"
            >
              <FaInfoCircle />
            </button>

            {/* Usar handleEditarPrevia para guardar scroll antes de navegar */}
            <button
              className="glob-iconchip is-edit"
              title="Editar"
              onClick={() => handleEditarPrevia(p)}
              aria-label="Editar"
            >
              <FaEdit />
            </button>

            <button
              className="glob-iconchip is-delete"
              title="Dar de baja"
              onClick={() => abrirModalBaja(p)}
              aria-label="Dar de baja"
            >
              <FaUserMinus />
            </button>

            {mostrarBotonInscribir && (
              <button
                id="is_affirm"
                className="glob-iconchip is-affirm"
                title="Inscribir manualmente"
                onClick={() => abrirModalInscribir(p)}
                aria-label="Inscribir"
              >
                <FaCheckCircle />
              </button>
            )}

            <button
              className="glob-iconchip is-delete"
              title={tab === 'inscriptos' ? 'Marcar NO inscripto' : 'Eliminar registro'}
              onClick={() => abrirModalAccion(p)}
              aria-label={tab === 'inscriptos' ? 'Marcar NO inscripto' : 'Eliminar registro'}
            >
              <FaTrash />
            </button>
          </div>
        </div>
      </div>
    );
  });

  const hayChips = !!(busqueda || cursoSeleccionado || divisionSeleccionada || condicionSeleccionada);

  return (
    <div className="glob-profesor-container">
      <div className="glob-profesor-box">
        {toast.mostrar && (
          <Toast
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            onClose={() => setToast({ mostrar: false, tipo: '', mensaje: '' })}
            duracion={3000}
          />
        )}

        <ConfirmActionModal
          open={modal.open}
          mode={modal.mode}
          item={modal.item}
          loading={modal.loading}
          error={modal.error}
          onCancel={cancelarModal}
          onConfirm={confirmarAccion}
        />

        <ConfirmarCopiaModal
          open={modalCopia.open}
          loading={modalCopia.loading}
          error={modalCopia.error}
          cantidad={cantidadInscriptos}
          onCancel={cancelarModalCopia}
          onConfirm={confirmarGuardarCopia}
        />

        <DarBajaPreviaModal
          open={modalBaja.open}
          item={modalBaja.item}
          loading={modalBaja.loading}
          error={modalBaja.error}
          onCancel={cerrarModalBaja}
          onConfirm={confirmarDarBaja}
        />

        <InscribirModal
          open={modalIns.open}
          item={modalIns.item}
          materiasAlumno={modalIns.materiasAlumno}
          loading={modalIns.loading}
          error={modalIns.error}
          onConfirm={confirmarInscripcion}
          onCancel={cancelarInscripcion}
        />

        <ModalInfoPrevia open={modalInfo.open} previa={modalInfo.item} onClose={cerrarModalInfo} />

        <ImportarPreviasModal open={modalImport} onClose={() => setModalImport(false)} onSuccess={cargarPrevias} />

        {/* Header superior */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Gestión de Previas</span>

          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por alumno, DNI o materia"
              className="glob-search-input"
              value={busqueda}
              onChange={(e) => handleBuscarChange(e.target.value)}
              disabled={cargando}
            />
            {busqueda ? <FaTimes className="glob-clear-search-icon" onClick={quitarBusqueda} /> : null}
            <button className="glob-search-button" title="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => {
                setMostrarFiltros((prev) => {
                  const next = !prev;
                  if (next) {
                    setOpenSecciones((s) => ({
                      ...s,
                      curso: false,
                      division: false,
                      condicion: false,
                    }));
                  }
                  return next;
                });
              }}
              disabled={cargando}
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown className={`glob-chevron-icon ${mostrarFiltros ? 'glob-rotate' : ''}`} />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                {/* CURSO */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${openSecciones.curso ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, curso: !s.curso }))}
                    aria-expanded={openSecciones.curso}
                  >
                    <span className="glob-filtros-group-title">Filtrar por curso (cursando)</span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className={`glob-filtros-group-body ${openSecciones.curso ? 'is-open' : 'is-collapsed'}`}>
                    <div className="glob-grid-filtros">
                      {listas.cursos.length === 0 ? (
                        <span className="glob-chip-mini">No hay cursos disponibles</span>
                      ) : (
                        listas.cursos.map((c) => (
                          <button
                            key={`curso-${c.id}-${c.nombre}`}
                            className={`glob-chip-filtro ${filtros.cursoSeleccionado === c.nombre ? 'glob-active' : ''}`}
                            onClick={() => handleFiltrarPorCurso(c.nombre)}
                            title={`Filtrar por curso ${c.nombre}`}
                          >
                            {c.nombre}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* DIVISION */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${openSecciones.division ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, division: !s.division }))}
                    aria-expanded={openSecciones.division}
                  >
                    <span className="glob-filtros-group-title">Filtrar por división (cursando)</span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className={`glob-filtros-group-body ${openSecciones.division ? 'is-open' : 'is-collapsed'}`}>
                    <div className="glob-grid-filtros">
                      {listas.divisiones.length === 0 ? (
                        <span className="glob-chip-mini">No hay divisiones disponibles</span>
                      ) : (
                        listas.divisiones.map((d) => (
                          <button
                            key={`div-${d.id}-${d.nombre}`}
                            className={`glob-chip-filtro ${filtros.divisionSeleccionada === d.nombre ? 'glob-active' : ''}`}
                            onClick={() => handleFiltrarPorDivision(d.nombre)}
                            title={`Filtrar por división ${d.nombre}`}
                          >
                            {d.nombre}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* CONDICION */}
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${openSecciones.condicion ? 'is-open' : ''}`}
                    onClick={() => setOpenSecciones((s) => ({ ...s, condicion: !s.condicion }))}
                    aria-expanded={openSecciones.condicion}
                  >
                    <span className="glob-filtros-group-title">Filtrar por condición</span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div className={`glob-filtros-group-body ${openSecciones.condicion ? 'is-open' : 'is-collapsed'}`}>
                    <div className="glob-grid-filtros">
                      {listas.condiciones.length === 0 ? (
                        <span className="glob-chip-mini">No hay condiciones disponibles</span>
                      ) : (
                        listas.condiciones.map((cnd) => (
                          <button
                            key={`cond-${cnd.id}-${cnd.nombre}`}
                            className={`glob-chip-filtro ${filtros.condicionSeleccionada === cnd.nombre ? 'glob-active' : ''}`}
                            onClick={() => handleFiltrarPorCondicion(cnd.nombre)}
                            title={`Filtrar por condición ${cnd.nombre}`}
                          >
                            {cnd.nombre}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className="glob-filtros-menu-item glob-mostrar-todas"
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

        {/* CONTADOR + TABS + CHIPS + LISTADO */}
        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline">
              <div className="sep-boton">
                <div className="glob-contador-container">
                  <span className="glob-profesores-desktop">
                    {tab === 'inscriptos' ? 'Inscriptos: ' : 'Cant previas: '}
                    {hayFiltros || filtroActivo === 'todos' ? previasFiltradas.length : 0}
                  </span>
                  <span className="glob-profesores-mobile">
                    {hayFiltros || filtroActivo === 'todos' ? previasFiltradas.length : 0}
                  </span>
                  <FaUsers className="glob-icono-profesor" />
                </div>

                <div className="glob-tabs glob-tabs--inline" role="tablist" aria-label="Filtro por estado de inscripción">
                  <button
                    role="tab"
                    aria-selected={tab === 'todos'}
                    className={`glob-tab ${tab === 'todos' ? 'glob-tab--active' : ''}`}
                    onClick={() => handleTabChange('todos')}
                    title="Ver todas las previas"
                  >
                    Todos
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === 'inscriptos'}
                    className={`glob-tab ${tab === 'inscriptos' ? 'glob-tab--active' : ''}`}
                    onClick={() => handleTabChange('inscriptos')}
                    title="Ver solo inscriptos"
                  >
                    Inscriptos
                  </button>
                </div>
              </div>

              {/* CHIPS */}
              {hayChips && (
                <div className="glob-chips-container">
                  {busqueda && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">Búsqueda: {busqueda}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">
                        {busqueda.length > 3 ? `${busqueda.substring(0, 3)}...` : busqueda}
                      </span>
                      <button className="glob-chip-mini-close" onClick={quitarBusqueda} aria-label="Quitar filtro" title="Quitar este filtro">
                        ×
                      </button>
                    </div>
                  )}

                  {cursoSeleccionado && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">Curso: {cursoSeleccionado}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">{cursoSeleccionado}</span>
                      <button className="glob-chip-mini-close" onClick={quitarCurso} title="Quitar este filtro">
                        ×
                      </button>
                    </div>
                  )}

                  {divisionSeleccionada && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">División: {divisionSeleccionada}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">{divisionSeleccionada}</span>
                      <button className="glob-chip-mini-close" onClick={quitarDivision} title="Quitar este filtro">
                        ×
                      </button>
                    </div>
                  )}

                  {condicionSeleccionada && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">Condición: {condicionSeleccionada}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">{condicionSeleccionada}</span>
                      <button className="glob-chip-mini-close" onClick={quitarCondicion} title="Quitar este filtro">
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="glob-chip-mini glob-chip-clear-all"
                    onClick={limpiarTodosLosChips}
                    title="Quitar todos los filtros"
                    disabled={cargando}
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}

              {/* VACIAR TABLA */}
              <button
                className="glob-profesor-button glob-hover-effect glob-btn--danger glob-chip-action-fixed"
                onClick={abrirModalLimpiar}
                disabled={cargando}
                title="Vaciar completamente previas"
              >
                <FaBroom className="glob-profesor-icon-button" />
                <p>Vaciar tabla</p>
              </button>
            </div>
          </div>

          {!isMobile && (
            <div className="glob-box-table">
              <div className="glob-header" style={{ gridTemplateColumns: '1.5fr 0.7fr 1.3fr .6fr 0.5fr .7fr 1fr' }}>
                <div className="glob-column-header">Alumno</div>
                <div className="glob-column-header">DNI</div>
                <div className="glob-column-header">Materia</div>
                <div className="glob-column-header">Condición</div>
                <div className="glob-column-header">Curso</div>
                <div className="glob-column-header">Inscripción</div>
                <div className="glob-column-header">Acciones</div>
              </div>

              <div className="glob-body">
                {!hayFiltros && filtroActivo !== 'todos' ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
                      <FaFilter className="glob-empty-icon" aria-hidden="true" />
                      <p>Aplicá búsqueda o filtros para ver las previas</p>
                      <button className="glob-btn-show-all" onClick={handleMostrarTodos}>
                        Mostrar todas
                      </button>
                    </div>
                  </div>
                ) : mostrarLoader ? (
                  <div className="glob-loading-spinner-container">
                    <div className="glob-loading-spinner"></div>
                  </div>
                ) : basePorTab.length === 0 ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
                      <p>{tab === 'inscriptos' ? 'No hay inscriptos aún' : 'No hay previas registradas'}</p>
                    </div>
                  </div>
                ) : previasFiltradas.length === 0 ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
                      <p>No hay resultados con los filtros actuales</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: '55vh', width: '100%' }}>
                    <AutoSizer>
                      {({ height, width }) => {
                        viewportHeightRef.current = height;
                        return (
                          <List
                            ref={listRef}
                            height={height}
                            width={width}
                            itemCount={previasFiltradas.length}
                            itemSize={ITEM_SIZE}
                            itemData={previasFiltradas}
                            overscanCount={10}
                            itemKey={(index, data) => data[index]?.id_previa ?? index}
                            outerElementType={OuterWithStableGutter}
                            onScroll={handleListScroll}
                          >
                            {Row}
                          </List>
                        );
                      }}
                    </AutoSizer>
                  </div>
                )}
              </div>
            </div>
          )}

          {isMobile && (
            <div className="glob-no-data-message glob-no-data-mobile">
              <div className="glob-message-content">
                <p>En móvil también queda integrado (si querés te lo pego completo).</p>
              </div>
            </div>
          )}
        </div>

        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => {
              setFiltros({
                busqueda: '',
                cursoSeleccionado: '',
                divisionSeleccionada: '',
                condicionSeleccionada: '',
                filtroActivo: null,
              });
              localStorage.removeItem('filtros_previas');
              navigate('/panel');
            }}
            aria-label="Volver"
            title="Volver"
          >
            <FaArrowLeft className="glob-profesor-icon-button" />
            <p>Volver Atrás</p>
          </button>

          <div className="glob-botones-container">
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => navigate('/previas/agregar')}
              aria-label="Agregar Previa"
              title="Agregar Previa"
            >
              <FaPlus className="glob-profesor-icon-button" />
              <p>Agregar Previa</p>
            </button>

            {tab === 'inscriptos' && (
              <button
                className="glob-profesor-button glob-hover-effect"
                onClick={abrirModalCopia}
                aria-label="Guardar copia"
                title={cantidadInscriptos > 0 ? 'Guardar copia snapshot de inscriptos' : 'No hay inscriptos para copiar'}
                disabled={cantidadInscriptos === 0 || cargando}
              >
                <FaUpload className="glob-profesor-icon-button" />
                <p>Guardar copia</p>
              </button>
            )}

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!puedeExportar}
              aria-label="Exportar"
              title={puedeExportar ? 'Exportar a Excel' : 'No hay filas visibles para exportar'}
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar a Excel</p>
            </button>

            <button
              id="Importar-Excel"
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setModalImport(true)}
              aria-label="Importar Excel"
              disabled={tablaConDatos}
              title={tablaConDatos ? 'Deshabilitado porque la tabla ya tiene datos' : 'Importar Excel'}
            >
              <FaUpload className="glob-profesor-icon-button" />
              <p>Importar Excel</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              id="BTNBaja"
              onClick={() => navigate('/previas/baja')}
              aria-label="Dados de baja"
              title="Ver registros dados de baja"
            >
              <FaList className="glob-profesor-icon-button" />
              <p>Dados de baja</p>
            </button>

            <button
              id="Btn-vercopias"
              className="glob-profesor-button glob-hover-effect"
              onClick={() => navigate('/previas/copias')}
              aria-label="Ver copias"
              title="Ver historial de copias (snapshot) de inscriptos"
            >
              <FaList className="glob-profesor-icon-button" />
              <p>Ver copias</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Previas;

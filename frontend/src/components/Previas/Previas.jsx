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
} from 'react-icons/fa';

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import Toast from '../Global/Toast';
import InscribirModal from './InscribirModal';
import ModalInfoPrevia from './modales/ModalInfoPrevia';
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
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
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

/* ================================
   Componente Previas
================================ */
const Previas = () => {
  const [previas, setPrevias] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [tab, setTab] = useState('todos'); // 'todos' | 'inscriptos'

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
    mensaje: ''
  });

  const [openSecciones, setOpenSecciones] = useState({
    curso: false,
    division: false,
  });

  // Modal confirmación (eliminar / desinscribir)
  const [modal, setModal] = useState({
    open: false,
    mode: null, // 'eliminar' | 'desinscribir'
    item: null,
    loading: false,
    error: '',
  });

  // Modal INSCRIBIR
  const [modalIns, setModalIns] = useState({
    open: false,
    item: null,
    loading: false,
    error: '',
  });

  // Modal INFO PREVIA
  const [modalInfo, setModalInfo] = useState({
    open: false,
    item: null,
  });

  // Listas básicas (desde backend)
  const [listas, setListas] = useState({ cursos: [], divisiones: [] });

  // Filtros
  const [filtros, setFiltros] = useState(() => {
    const saved = localStorage.getItem('filtros_previas');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          busqueda: parsed.busqueda ?? '',
          cursoSeleccionado: parsed.cursoSeleccionado ?? '',
          divisionSeleccionada: parsed.divisionSeleccionada ?? '',
          filtroActivo: parsed.filtroActivo ?? null,
        };
      } catch {}
    }
    return {
      busqueda: '',
      cursoSeleccionado: '',
      divisionSeleccionada: '',
      filtroActivo: null,
    };
  });

  const {
    busqueda,
    cursoSeleccionado,
    divisionSeleccionada,
    filtroActivo
  } = filtros;

  const busquedaDefer = useDeferredValue(busqueda);

  const hayFiltros = !!(
    (busquedaDefer && busquedaDefer.trim() !== '') ||
    (cursoSeleccionado && cursoSeleccionado !== '') ||
    (divisionSeleccionada && divisionSeleccionada !== '')
  );

  // Base por pestaña
  const basePorTab = useMemo(() => {
    if (tab === 'inscriptos') {
      return previas.filter((p) => Number(p?.inscripcion ?? 0) === 1);
    }
    return previas;
  }, [tab, previas]);

  // Filtrado + búsqueda
  const previasFiltradas = useMemo(() => {
    let resultados = basePorTab;

    if (busquedaDefer && busquedaDefer.trim() !== '') {
      const q = normalizar(busquedaDefer);
      resultados = resultados.filter(
        (p) =>
          (p._alumno?.includes(q)) ||
          (p._dni?.includes(q)) ||
          (p._materia?.includes(q))
      );
    }

    if (cursoSeleccionado && cursoSeleccionado !== '') {
      const curNorm = normalizar(cursoSeleccionado);
      resultados = resultados.filter((p) =>
        normalizar(p?.cursando_curso_nombre ?? '') === curNorm
      );
    }

    if (divisionSeleccionada && divisionSeleccionada !== '') {
      const divNorm = normalizar(divisionSeleccionada);
      resultados = resultados.filter((p) =>
        normalizar(p?.cursando_division_nombre ?? '') === divNorm
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
    filtroActivo
  ]);

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

  // Cargar PREVIAS
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
            materia_curso_division: `${p.materia_curso_nombre || ''} ${p.materia_division_nombre || ''}`.trim()
          }));
          setPrevias(procesados);
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

  // Cargar listas básicas (cursos y divisiones) para filtros
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
        });
      } catch (e) {
        console.error('Error cargando listas:', e);
      }
    };
    fetchListas();
  }, []);

  // Persistencia de filtros
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
     Handlers
  ================================= */
  const handleMostrarTodos = useCallback(() => {
    setFiltros({
      busqueda: '',
      cursoSeleccionado: '',
      divisionSeleccionada: '',
      filtroActivo: 'todos',
    });
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleBuscarChange = useCallback((valor) => {
    setFiltros((prev) => {
      const next = { ...prev, busqueda: valor };
      next.filtroActivo =
        (valor?.trim() ||
          prev.cursoSeleccionado ||
          prev.divisionSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const handleFiltrarPorCurso = useCallback((cursoNombre) => {
    setFiltros((prev) => {
      const next = { ...prev, cursoSeleccionado: cursoNombre };
      next.filtroActivo =
        (prev.busqueda?.trim() ||
          cursoNombre ||
          prev.divisionSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
    setMostrarFiltros(false);
    triggerCascadaConPreMask();
  }, [triggerCascadaConPreMask]);

  const handleFiltrarPorDivision = useCallback((division) => {
    setFiltros((prev) => {
      const next = { ...prev, divisionSeleccionada: division };
      next.filtroActivo =
        (prev.busqueda?.trim() ||
          prev.cursoSeleccionado ||
          division)
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
        (prev.cursoSeleccionado ||
          prev.divisionSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarCurso = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, cursoSeleccionado: '' };
      next.filtroActivo =
        (prev.busqueda?.trim() ||
          prev.divisionSeleccionada)
          ? 'filtros'
          : null;
      return next;
    });
  }, []);

  const quitarDivision = useCallback(() => {
    setFiltros((prev) => {
      const next = { ...prev, divisionSeleccionada: '' };
      next.filtroActivo =
        (prev.busqueda?.trim() ||
          prev.cursoSeleccionado)
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
      filtroActivo: null,
    }));
  }, []);

  // Abrir modal acción (eliminar / desinscribir)
  const abrirModalAccion = useCallback((p) => {
    const mode = (tab === 'inscriptos') ? 'desinscribir' : 'eliminar';
    setModal({ open: true, mode, item: p, loading: false, error: '' });
  }, [tab]);

  // Confirmar acción (eliminar / desinscribir)
  const confirmarAccion = useCallback(async () => {
    if (!modal.item || !modal.mode) return;
    try {
      setModal((m) => ({ ...m, loading: true, error: '' }));

      const action = modal.mode === 'desinscribir'
        ? 'previa_desinscribir'
        : 'previa_eliminar';

      const res = await fetch(`${BASE_URL}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_previa: modal.item.id_previa }),
      });
      const json = await res.json();

      if (!json?.exito) throw new Error(json?.mensaje || 'Operación no realizada');

      if (modal.mode === 'eliminar') {
        setPrevias((arr) => arr.filter(x => Number(x.id_previa) !== Number(modal.item.id_previa)));
        mostrarToast('Registro eliminado correctamente', 'exito');
      } else {
        setPrevias((arr) =>
          arr.map(x =>
            Number(x.id_previa) === Number(modal.item.id_previa)
              ? { ...x, inscripcion: 0 }
              : x
          )
        );
        mostrarToast('Se marcó como NO inscripto', 'exito');
      }

      setModal({ open: false, mode: null, item: null, loading: false, error: '' });
    } catch (e) {
      setModal((m) => ({ ...m, loading: false, error: e.message || 'Error desconocido' }));
    }
  }, [modal, mostrarToast]);

  const cancelarModal = useCallback(() => {
    if (modal.loading) return;
    setModal({ open: false, mode: null, item: null, loading: false, error: '' });
  }, [modal.loading]);

  // Abrir modal INSCRIBIR
  const abrirModalInscribir = useCallback((p) => {
    setModalIns({ open: true, item: p, loading: false, error: '' });
  }, []);

  // Confirmar INSCRIPCIÓN
  const confirmarInscripcion = useCallback(async () => {
    if (!modalIns.item) return;
    try {
      setModalIns((m) => ({ ...m, loading: true, error: '' }));

      const res = await fetch(`${BASE_URL}/api.php?action=previa_inscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_previa: modalIns.item.id_previa }),
      });
      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || 'No se pudo inscribir');

      // Actualiza la fila en memoria
      setPrevias((arr) =>
        arr.map(x =>
          Number(x.id_previa) === Number(modalIns.item.id_previa)
            ? { ...x, inscripcion: 1 }
            : x
        )
      );

      setModalIns({ open: false, item: null, loading: false, error: '' });
      mostrarToast('Alumno inscripto correctamente', 'exito');
    } catch (e) {
      setModalIns((m) => ({ ...m, loading: false, error: e.message || 'Error desconocido' }));
    }
  }, [modalIns.item, mostrarToast]);

  const cancelarInscripcion = useCallback(() => {
    if (modalIns.loading) return;
    setModalIns({ open: false, item: null, loading: false, error: '' });
  }, [modalIns.loading]);

  // Modal Info (abrir/cerrar)
  const abrirModalInfo = useCallback((p) => {
    setModalInfo({ open: true, item: p });
  }, []);
  const cerrarModalInfo = useCallback(() => {
    setModalInfo({ open: false, item: null });
  }, []);

  // Exportar a Excel (solo lo visible)
  const exportarExcel = useCallback(() => {
    const puede = (hayFiltros || filtroActivo === 'todos') && previasFiltradas.length > 0 && !cargando;
    if (!puede) {
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
      'Inscripto': Number(p?.inscripcion ?? 0) === 1 ? 'INSCRIPTO' : 'PENDIENTE',
      'Fecha carga': formatearFechaISO(p?.fecha_carga ?? '')
    }));

    const headers = [
      'ID Previa','Alumno','DNI','Año (previa)','Curso (cursando)','División (cursando)',
      'Materia','Curso Materia','División Materia','Condición','Inscripto','Fecha carga'
    ];

    const ws = XLSX.utils.json_to_sheet(filas, { header: headers });
    ws['!cols'] = [
      { wch: 10 },{ wch: 28 },{ wch: 14 },{ wch: 12 },{ wch: 18 },{ wch: 20 },
      { wch: 26 },{ wch: 16 },{ wch: 18 },{ wch: 14 },{ wch: 10 },{ wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Previas');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

    const fecha = new Date();
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');

    const sufijo = tab === 'inscriptos' ? 'Inscriptos' : (filtroActivo === 'todos' ? 'Todos' : 'Filtrados');
    const fechaStr = `${yyyy}-${mm}-${dd}`;
    saveAs(blob, `Previas_${sufijo}_${fechaStr}(${filas.length}).xlsx`);
  }, [hayFiltros, filtroActivo, previasFiltradas, cargando, tab]);

  /* ================================
     Fila virtualizada (desktop)
  ================================= */
  const Row = React.memo(({ index, style, data }) => {
    const p = data[index];
    const esFilaPar = index % 2 === 0;
    const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
    const preMask = preCascada && index < MAX_CASCADE_ITEMS;

    const estado = Number(p?.inscripcion ?? 0) === 1 ? 'INSCRIPTO' : 'PENDIENTE';

    return (
      <div
        style={{
          ...style,
          animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
          opacity: preMask ? 0 : undefined,
          transform: preMask ? 'translateY(8px)' : undefined,
        }}
        className={`glob-row ${esFilaPar ? 'glob-even-row' : 'glob-odd-row'} ${willAnimate ? 'glob-cascade' : ''}`}
      >
        <div className="glob-column glob-column-nombre" title={p.alumno}>{p.alumno}</div>
        <div className="glob-column glob-column-dni" title={p.dni}>{p.dni}</div>
        <div className="glob-column" title={p.materia_nombre}>{p.materia_nombre}</div>
        <div className="glob-column" title={p.condicion_nombre}>{p.condicion_nombre}</div>

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

            <button
              className="glob-iconchip is-edit"
              title="Editar"
              onClick={() => navigate(`/previas/editar/${p.id_previa}`)}
              aria-label="Editar"
            >
              <FaEdit />
            </button>

            {estado === 'PENDIENTE' && (
              <button
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

  /* ================================
     Render
  ================================= */
  const hayChips = !!(busqueda || cursoSeleccionado || divisionSeleccionada);

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

        {/* Modal Confirmación (eliminar / desinscribir) */}
        {modal.open && (
          <div className="glob-modal-backdrop" role="dialog" aria-modal="true">
            <div className="glob-modal">
              <div className="glob-modal-header">
                <h3>
                  {modal.mode === 'desinscribir' ? 'Marcar como NO inscripto' : 'Eliminar registro'}
                </h3>
              </div>
              <div className="glob-modal-body">
                <p>
                  {modal.mode === 'desinscribir'
                    ? '¿Confirmás pasar este alumno a NO inscripto?'
                    : '¿Confirmás eliminar definitivamente este registro?'}
                </p>
                {modal.item && (
                  <div className="glob-modal-item">
                    <strong>{modal.item.alumno}</strong> — DNI {modal.item.dni}<br />
                    Materia: {modal.item.materia_nombre}
                  </div>
                )}
                {modal.error && <div className="glob-modal-error">{modal.error}</div>}
              </div>
              <div className="glob-modal-actions">
                <button
                  className="glob-profesor-button glob-hover-effect"
                  onClick={cancelarModal}
                  disabled={modal.loading}
                >
                  Cancelar
                </button>
                <button
                  className={`glob-profesor-button glob-hover-effect ${modal.mode === 'desinscribir' ? 'glob-btn-warn' : 'glob-btn-danger'}`}
                  onClick={confirmarAccion}
                  disabled={modal.loading}
                >
                  {modal.loading ? 'Procesando...' : (modal.mode === 'desinscribir' ? 'Confirmar' : 'Eliminar')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Inscribir */}
        <InscribirModal
          open={modalIns.open}
          item={modalIns.item}
          loading={modalIns.loading}
          error={modalIns.error}
          onConfirm={confirmarInscripcion}
          onCancel={cancelarInscripcion}
        />

        {/* Modal Info Previa */}
        <ModalInfoPrevia
          open={modalInfo.open}
          previa={modalInfo.item}
          onClose={cerrarModalInfo}
        />

        {/* Header superior */}
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Gestión de Previas</span>

          {/* Tabs (estilo chip global) */}
          <div className="glob-grid-filtros" style={{ gap: 8, alignItems: 'center' }}>
            <button
              className={`glob-chip-filtro ${tab === 'todos' ? 'glob-active' : ''}`}
              onClick={() => setTab('todos')}
              title="Ver todas las previas"
            >
              Todos
            </button>
            <button
              className={`glob-chip-filtro ${tab === 'inscriptos' ? 'glob-active' : ''}`}
              onClick={() => setTab('inscriptos')}
              title="Ver solo inscriptos"
            >
              Inscriptos
            </button>
          </div>

          {/* Búsqueda */}
          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por alumno, DNI o materia"
              className="glob-search-input"
              value={busqueda}
              onChange={(e) => handleBuscarChange(e.target.value)}
              disabled={cargando}
            />
            {busqueda ? (
              <FaTimes className="glob-clear-search-icon" onClick={quitarBusqueda} />
            ) : null}
            <button className="glob-search-button" title="Buscar">
              <FaSearch className="glob-search-icon" />
            </button>
          </div>

          {/* Filtros */}
          <div className="glob-filtros-container" ref={filtrosRef}>
            <button
              className="glob-filtros-button"
              onClick={() => {
                setMostrarFiltros((prev) => {
                  const next = !prev;
                  if (next) setOpenSecciones((s) => ({ ...s, curso: false, division: false }));
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
                {/* CURSO (cursando) */}
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

                {/* DIVISIÓN (cursando) */}
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

                {/* Mostrar Todos */}
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

        {/* CONTADOR + CHIPS + LISTADO */}
        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            {/* Contador */}
            <div className="glob-left-inline">
              <div className="glob-contador-container">
                <span className="glob-profesores-desktop">
                  {tab === 'inscriptos' ? 'Inscriptos: ' : 'Cant previas: '}
                  {(hayFiltros || filtroActivo === 'todos') ? previasFiltradas.length : 0}
                </span>
                <span className="glob-profesores-mobile">
                  {(hayFiltros || filtroActivo === 'todos') ? previasFiltradas.length : 0}
                </span>
                <FaUsers className="glob-icono-profesor" />
              </div>

              {/* Chips */}
              {hayFiltros && (
                <div className="glob-chips-container">
                  {busqueda && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">Búsqueda: {busqueda}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">
                        {busqueda.length > 3 ? `${busqueda.substring(0, 3)}...` : busqueda}
                      </span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={quitarBusqueda}
                        aria-label="Quitar filtro"
                        title="Quitar este filtro"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {cursoSeleccionado && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">Curso: {cursoSeleccionado}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">{cursoSeleccionado}</span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={quitarCurso}
                        aria-label="Quitar filtro"
                        title="Quitar este filtro"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {divisionSeleccionada && (
                    <div className="glob-chip-mini" title="Filtro activo">
                      <span className="glob-chip-mini-text glob-profesores-desktop">División: {divisionSeleccionada}</span>
                      <span className="glob-chip-mini-text glob-profesores-mobile">{divisionSeleccionada}</span>
                      <button
                        className="glob-chip-mini-close"
                        onClick={quitarDivision}
                        aria-label="Quitar filtro"
                        title="Quitar este filtro"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  <button
                    className="glob-chip-mini glob-chip-clear-all"
                    onClick={limpiarTodosLosChips}
                    title="Quitar todos los filtros"
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TABLA (desktop) */}
          {!isMobile && (
            <div className="glob-box-table">
              <div className="glob-header">
                <div className="glob-column-header">Alumno</div>
                <div className="glob-column-header">DNI</div>
                <div className="glob-column-header">Materia</div>
                <div className="glob-column-header">Condición</div>
                <div className="glob-column-header">Cur y Div (Mat)</div>
                <div className="glob-column-header">Inscripción</div>
                <div className="glob-column-header">Acciones</div>
              </div>

              <div className="glob-body">
                {!hayFiltros && filtroActivo !== 'todos' ? (
                  <div className="glob-no-data-message">
                    <div className="glob-message-content">
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

          {/* TARJETAS (mobile) */}
          {isMobile && (
            <div
              className={`glob-cards-wrapper ${animacionActiva && previasFiltradas.length <= MAX_CASCADE_ITEMS ? 'glob-cascade-animation' : ''}`}
            >
              {!hayFiltros && filtroActivo !== 'todos' ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>Usá la búsqueda o aplicá filtros para ver resultados</p>
                    <button className="glob-btn-show-all" onClick={handleMostrarTodos}>
                      Mostrar todas
                    </button>
                  </div>
                </div>
              ) : mostrarLoader ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>Cargando previas...</p>
                  </div>
                </div>
              ) : basePorTab.length === 0 ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>{tab === 'inscriptos' ? 'No hay inscriptos aún' : 'No hay previas registradas'}</p>
                  </div>
                </div>
              ) : previasFiltradas.length === 0 ? (
                <div className="glob-no-data-message glob-no-data-mobile">
                  <div className="glob-message-content">
                    <p>No hay resultados con los filtros actuales</p>
                  </div>
                </div>
              ) : (
                previasFiltradas.map((p, index) => {
                  const willAnimate = animacionActiva && index < MAX_CASCADE_ITEMS;
                  const preMask = preCascada && index < MAX_CASCADE_ITEMS;
                  const estado = Number(p?.inscripcion ?? 0) === 1 ? 'INSCRIPTO' : 'PENDIENTE';
                  return (
                    <div
                      key={p.id_previa || `card-${index}`}
                      className={`glob-card ${willAnimate ? 'glob-cascade' : ''}`}
                      style={{
                        animationDelay: willAnimate ? `${index * 0.03}s` : '0s',
                        opacity: preMask ? 0 : undefined,
                        transform: preMask ? 'translateY(8px)' : undefined,
                      }}
                    >
                      <div className="glob-card-header">
                        <h3 className="glob-card-title">{p.alumno}</h3>
                      </div>

                      <div className="glob-card-body">
                        <div className="glob-card-row">
                          <span className="glob-card-label">DNI</span>
                          <span className="glob-card-value">{p.dni}</span>
                        </div>
                        <div className="glob-card-row">
                          <span className="glob-card-label">Materia</span>
                          <span className="glob-card-value">{p.materia_nombre}</span>
                        </div>
                        <div className="glob-card-row">
                          <span className="glob-card-label">Condición</span>
                          <span className="glob-card-value">{p.condicion_nombre}</span>
                        </div>
                        <div className="glob-card-row">
                          <span className="glob-card-label">Curso/División</span>
                          <span className="glob-card-value">{p.materia_curso_division}</span>
                        </div>
                        <div className="glob-card-row">
                          <span className="glob-card-label">Inscripción</span>
                          <span className={`glob-card-value ${estado === 'INSCRIPTO' ? 'glob-badge-ok' : 'glob-badge-warn'}`}>{estado}</span>
                        </div>
                        <div className="glob-card-row">
                          <span className="glob-card-label">Fecha Carga</span>
                          <span className="glob-card-value">{formatearFechaISO(p.fecha_carga)}</span>
                        </div>
                      </div>

                      <div className="glob-card-actions">
                        <button
                          className="glob-action-btn glob-iconchip is-info"
                          title="Información"
                          onClick={() => abrirModalInfo(p)}
                          aria-label="Información"
                        >
                          <FaInfoCircle />
                        </button>

                        <button
                          className="glob-action-btn glob-iconchip is-edit"
                          title="Editar"
                          onClick={() => navigate(`/previas/editar/${p.id_previa}`)}
                          aria-label="Editar"
                        >
                          <FaEdit />
                        </button>

                        {estado === 'PENDIENTE' && (
                          <button
                            className="glob-action-btn glob-iconchip is-affirm"
                            title="Inscribir manualmente"
                            onClick={() => abrirModalInscribir(p)}
                            aria-label="Inscribir"
                          >
                            <FaCheckCircle />
                          </button>
                        )}

                        <button
                          className="glob-action-btn glob-iconchip is-delete"
                          title={tab === 'inscriptos' ? 'Marcar NO inscripto' : 'Eliminar registro'}
                          onClick={() => abrirModalAccion(p)}
                          aria-label={tab === 'inscriptos' ? 'Marcar NO inscripto' : 'Eliminar registro'}
                        >
                          <FaTrash />
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
        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => {
              setFiltros({
                busqueda: '',
                cursoSeleccionado: '',
                divisionSeleccionada: '',
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
              onClick={exportarExcel}
              disabled={!puedeExportar}
              aria-label="Exportar"
              title={puedeExportar ? 'Exportar a Excel' : 'No hay filas visibles para exportar'}
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar a Excel</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => navigate('/previas/agregar')}
              aria-label="Agregar Previa"
              title="Agregar Previa"
            >
              <FaPlus className="glob-profesor-icon-button" />
              <p>Agregar Previa</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Previas;

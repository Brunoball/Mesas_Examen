// ✅ REEMPLAZAR COMPLETO
// src/components/MesasExamen/MesasExamen.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  FaEdit,
  FaTrash,
  FaArrowLeft,
  FaUserPlus,
  FaFileExcel,
  FaSearch,
  FaTimes,
  FaUsers,
  FaFilter,
  FaChevronDown,
  FaCalendarAlt,
  FaClock,
  FaEraser,
  FaFilePdf,
  FaLayerGroup,
  FaUnlink,
  FaCheck,
  FaExclamationTriangle,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import BASE_URL from "../../config/config";
import "../Global/section-ui.css";

import Toast from "../Global/Toast";
import FullScreenLoader from "../Global/FullScreenLoader";

import ModalCrearMesas from "./modales/ModalCrearMesas";
import ModalEliminarMesas from "./modales/ModalEliminarMesas";
import ModalEliminarMesa from "./modales/ModalEliminarMesa";
import ModalTituloPDF from "./modales/ModalTituloPDF";
import ModalAvisoCorrelativa from "./modales/ModalAvisoCorrelativa";

import { generarPDFMesas } from "./modales/GenerarPDF";
import escudo from "../../imagenes/Escudo.png";

/* ================================
   Utils
================================ */
const normalizar = (str = "") =>
  str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const formatearFechaISO = (v) => {
  if (!v || typeof v !== "string") return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

/** ✅ Helper para extraer solo YYYY-MM-DD de cualquier formato de fecha */
const fechaKey = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

/** Debounce hook */
function useDebounce(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ================================
   Helpers para "Detalle (como PDF)"
================================ */
const mode = (arr = []) => {
  const counts = new Map();
  for (const v0 of arr) {
    const v = (v0 ?? "").toString().trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = "",
    max = -1;
  for (const [k, n] of counts) {
    if (n > max) {
      max = n;
      best = k;
    }
  }
  return best;
};

const nombreMes = (iso = "") => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return { dia: "", mesNum: "", anio: "", mesTxt: "" };
  const meses = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];
  return {
    dia: m[3],
    mesNum: m[2],
    anio: m[1],
    mesTxt: meses[parseInt(m[2], 10) - 1] || "",
  };
};

const diaSemana = (iso) => {
  const dias = [
    "DOMINGO",
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
  ];
  const d = new Date(`${iso || ""}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : dias[d.getDay()] || "";
};

const horaPorTurno = (turno = "", fallback = "07:30 HS.") => {
  const t = normalizar(turno);
  if (t.includes("man")) return "07:30 HS.";
  if (t.includes("tar")) return "13:30 HS.";
  return fallback;
};

/** Usa hora de la DB si viene; si no, cae al turno */
const formatearHoraDesdeDB = (hora = "", turno = "") => {
  const raw = (hora ?? "").toString().trim();
  if (raw) {
    const [hh = "", mm = ""] = raw.split(":");
    if (hh && mm) {
      return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")} HS.`;
    }
  }
  return horaPorTurno(turno);
};

const limpiarCurso = (s) =>
  String(s ?? "")
    .replace(/°\s*°/g, "°")
    .replace(/\s{2,}/g, " ")
    .trim();

/* ================================
   ✅ ORDEN: Curso → División → Apellido
================================ */

const cursoKey = (cursoRaw = "") => {
  const c = limpiarCurso(cursoRaw);
  const s = c.replace(/\s+/g, " ").trim().toUpperCase();

  const mYear = s.match(/(\d{1,2})/);
  const year = mYear ? parseInt(mYear[1], 10) : 999;

  let divToken = "";
  const afterYear = s.slice(mYear ? mYear.index + mYear[1].length : 0);
  const mDiv = afterYear.match(/^\s*°?\s*([A-ZÑ0-9]{1,3})/i);
  if (mDiv && mDiv[1]) divToken = String(mDiv[1]).toUpperCase();

  const divIsNum = /^\d+$/.test(divToken);
  const divNum = divIsNum ? parseInt(divToken, 10) : null;

  return {
    year: Number.isFinite(year) ? year : 999,
    divToken: divToken || "Z",
    divIsNum,
    divNum,
  };
};

const compararDivision = (a, b) => {
  if (a.divIsNum && b.divIsNum) return (a.divNum ?? 999) - (b.divNum ?? 999);
  if (a.divIsNum && !b.divIsNum) return -1;
  if (!a.divIsNum && b.divIsNum) return 1;
  return String(a.divToken || "").localeCompare(String(b.divToken || ""), "es", {
    sensitivity: "base",
    numeric: true,
  });
};

const apellidoKey = (nombreRaw = "") => {
  const s = String(nombreRaw ?? "").trim();
  if (!s) return "";
  const idx = s.indexOf(",");
  if (idx >= 0) return s.slice(0, idx).trim().toUpperCase();
  return s.split(/\s+/)[0].trim().toUpperCase();
};

const compararAlumnoCursoDivisionApellido = (A, B) => {
  const cA = cursoKey(A?.curso);
  const cB = cursoKey(B?.curso);

  if (cA.year !== cB.year) return cA.year - cB.year;

  const divCmp = compararDivision(cA, cB);
  if (divCmp !== 0) return divCmp;

  const apA = apellidoKey(A?.alumno);
  const apB = apellidoKey(B?.alumno);
  const apCmp = apA.localeCompare(apB, "es", { sensitivity: "base" });
  if (apCmp !== 0) return apCmp;

  const nA = String(A?.alumno ?? "");
  const nB = String(B?.alumno ?? "");
  const nCmp = nA.localeCompare(nB, "es", { sensitivity: "base" });
  if (nCmp !== 0) return nCmp;

  const dA = String(A?.dni ?? "");
  const dB = String(B?.dni ?? "");
  return dA.localeCompare(dB, "es", { sensitivity: "base" });
};

/**
 * Construye "mesas lógicas" a partir del detalle del backend.
 */
function buildMesasLogicas({
  detalle,
  agrupaciones,
  id_grupo,
  fallbackPorNumero,
}) {
  const subMesas = (Array.isArray(detalle) ? detalle : []).map((m) => {
    const numero = m.numero_mesa ?? null;

    let fecha = m.fecha ?? "";
    let turno = m.turno ?? "";
    let hora = m.hora ?? "";

    if (fallbackPorNumero && Number.isFinite(Number(numero))) {
      const fb = fallbackPorNumero.get(Number(numero));
      if (fb) {
        if (!fecha && fb.fecha) fecha = fb.fecha;
        if (!turno && fb.turno) turno = fb.turno;
        if (!hora && fb.hora) hora = fb.hora;
      }
    }

    return {
      numero_mesa: numero,
      fecha,
      turno,
      hora,
      id_materia: m.id_materia ?? null,
      materia: m.materia ?? "",
      docentes: Array.isArray(m.docentes) ? m.docentes.filter(Boolean) : [],
      alumnos: Array.isArray(m.alumnos)
        ? m.alumnos.map((a) => ({
            alumno: a.alumno ?? "",
            dni: a.dni ?? "",
            curso: a.curso ?? "",
            nota: a.nota ?? null,
            fecha_nota: a.fecha_nota ?? null,
            id_previa: a.id_previa ?? null,
            id_materia: m.id_materia ?? a.id_materia ?? null,
            numero_mesa: m.numero_mesa ?? null,
          }))
        : [],
    };
  });

  let agrupacionesEfectivas = [];
  if (Array.isArray(agrupaciones) && agrupaciones.length) {
    agrupacionesEfectivas = agrupaciones
      .map((arr) =>
        (arr || [])
          .map((n) => parseInt(n, 10))
          .filter(Number.isFinite)
      )
      .filter((a) => a.length);
  } else if (id_grupo != null) {
    const setNums = new Set(
      subMesas
        .map((x) => parseInt(x.numero_mesa, 10))
        .filter(Number.isFinite)
    );
    agrupacionesEfectivas = [Array.from(setNums).sort((a, b) => a - b)];
  } else {
    agrupacionesEfectivas = [
      Array.from(new Set(subMesas.map((sm) => sm.numero_mesa)))
        .filter(Boolean)
        .sort((a, b) => a - b),
    ];
  }

  const buildMesaLogicaFrom = (arr) => {
    const fechaStar =
      mode(arr.map((x) => x.fecha)) || arr.find((x) => x.fecha)?.fecha || "";
    const turnoStar =
      mode(arr.map((x) => x.turno)) || arr.find((x) => x.turno)?.turno || "";
    const horaStar =
      mode(arr.map((x) => x.hora)) || arr.find((x) => x.hora)?.hora || "";
    const materiaStar =
      mode(arr.map((x) => x.materia)) || arr[0]?.materia || "";

    const idMateriaStar =
      parseInt(mode(arr.map((x) => x.id_materia)), 10) ||
      arr.find((x) => Number.isFinite(Number(x.id_materia)))?.id_materia ||
      null;

    const subNumeros = [
      ...new Set(arr.map((x) => x.numero_mesa).filter((v) => v != null)),
    ].sort((a, b) => a - b);

    const DOC_FALLBACK = "-";
    const mapa = new Map();
    const add = (doc, mat, al) => {
      if (!mapa.has(doc)) mapa.set(doc, new Map());
      const m2 = mapa.get(doc);
      if (!m2.has(mat)) m2.set(mat, []);
      m2.get(mat).push(...al);
    };

    for (const sm of arr) {
      const docentesSM = sm.docentes?.length ? sm.docentes : [DOC_FALLBACK];
      for (const d of docentesSM) add(d, sm.materia || "", sm.alumnos || []);
    }

    const bloques = [];
    const docentes = [...mapa.keys()];
    const materiasSet = new Set();
    for (const d of docentes)
      for (const mat of mapa.get(d).keys()) materiasSet.add(mat);

    const materiasOrden = [...materiasSet].sort((A, B) =>
      String(A).localeCompare(String(B), "es", { sensitivity: "base" })
    );

    for (const mat of materiasOrden) {
      const dQueTienen = docentes
        .filter((d) => mapa.get(d).has(mat))
        .sort((A, B) =>
          String(A).localeCompare(String(B), "es", { sensitivity: "base" })
        );

      for (const d of dQueTienen) {
        const a = mapa.get(d).get(mat) || [];

        const uniq = Array.from(
          new Map(
            a.map((x, idx) => [
              (x.dni || "").trim() || (x.alumno || "").trim() || `idx-${idx}`,
              x,
            ])
          ).values()
        );

        uniq.sort(compararAlumnoCursoDivisionApellido);

        bloques.push({ docente: d, materia: mat, alumnos: uniq });
      }
    }

    return {
      fecha: fechaStar,
      turno: turnoStar,
      hora: horaStar,
      materia: materiaStar,
      id_materia: idMateriaStar,
      subNumeros,
      bloques,
    };
  };

  const mesasLogicas = [];
  for (const nums of agrupacionesEfectivas) {
    const setNums = new Set(nums);
    const arr = subMesas.filter((sm) => setNums.has(sm.numero_mesa));
    if (!arr.length) continue;
    mesasLogicas.push(buildMesaLogicaFrom(arr));
  }

  const turnRank = (t) => (normalizar(t).includes("man") ? 0 : 1);
  mesasLogicas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    const ta = turnRank(a.turno),
      tb = turnRank(b.turno);
    if (ta !== tb) return ta - tb;
    return (a.subNumeros[0] ?? 0) - (b.subNumeros[0] ?? 0);
  });

  return mesasLogicas;
}

/* ================================
   Componente Mesas de Examen
================================ */

const STORAGE_KEY = "mesasExamenUI_v1";
const STORAGE_FLAG_FROM_EDIT = "mesasExamen_from_edit";
const VALOR_AUSENTE = "AUSENTE";

const MesasExamen = () => {
  const navigate = useNavigate();

  const [vista, setVista] = useState("grupos");

  const [grupos, setGrupos] = useState([]);
  const [gruposDB, setGruposDB] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [noAgrupadas, setNoAgrupadas] = useState([]);
  const [noAgrupadasDB, setNoAgrupadasDB] = useState([]);
  const [cargandoNo, setCargandoNo] = useState(false);

  const [creandoMesas, setCreandoMesas] = useState(false);

  const [listas, setListas] = useState({
    cursos: [],
    divisiones: [],
    turnos: [],
  });

  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const filtrosRef = useRef(null);

  const [q, setQ] = useState("");
  const qDebounced = useDebounce(q, 220);

  const [fechaSel, setFechaSel] = useState("");
  const [turnoSel, setTurnoSel] = useState("");

  const [openFecha, setOpenFecha] = useState(false);
  const [openTurno, setOpenTurno] = useState(false);

  const [abrirCrear, setAbrirCrear] = useState(false);
  const [abrirEliminar, setAbrirEliminar] = useState(false);

  const [abrirEliminarUno, setAbrirEliminarUno] = useState(false);
  const [mesaAEliminar, setMesaAEliminar] = useState(null);

  const [abrirTituloPDF, setAbrirTituloPDF] = useState(false);
  const exportActionRef = useRef(null);

  const [toast, setToast] = useState(null);
  const notify = useCallback(
    ({ tipo = "info", mensaje = "", duracion = 3000 }) =>
      setToast({ tipo, mensaje, duracion }),
    []
  );

  const pdfScrollRef = useRef(null);
  const scrollPosRef = useRef(0);
  const initialStateLoadedRef = useRef(false);
  const scrollRestoredRef = useRef(false);

  const [notasPendientes, setNotasPendientes] = useState({});
  const [editandoNotas, setEditandoNotas] = useState(new Set());

  // ✅ correlativas bloqueadas + popup aviso
  const [bloqueosCorrelativas, setBloqueosCorrelativas] = useState({});
  const [alertaCorrelativa, setAlertaCorrelativa] = useState(null);

  // Restaurar estado
  useEffect(() => {
    if (initialStateLoadedRef.current) return;
    initialStateLoadedRef.current = true;

    if (typeof window === "undefined") return;

    let shouldRestore = false;

    try {
      const flag = window.sessionStorage.getItem(STORAGE_FLAG_FROM_EDIT);
      if (flag === "1") {
        shouldRestore = true;
        window.sessionStorage.removeItem(STORAGE_FLAG_FROM_EDIT);
      }
    } catch (e) {}

    if (!shouldRestore) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const st = JSON.parse(raw);

      if (st.vista === "grupos" || st.vista === "no-agrupadas") {
        setVista(st.vista);
      }
      if (typeof st.q === "string") setQ(st.q);
      if (typeof st.fechaSel === "string") setFechaSel(st.fechaSel);
      if (typeof st.turnoSel === "string") setTurnoSel(st.turnoSel);
      if (typeof st.scrollTop === "number") {
        scrollPosRef.current = st.scrollTop;
      }
    } catch (e) {}
  }, []);

  const persistState = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const el = pdfScrollRef.current;
      const scrollTop = el ? el.scrollTop : scrollPosRef.current || 0;
      scrollPosRef.current = scrollTop;

      const payload = {
        vista,
        q,
        fechaSel,
        turnoSel,
        scrollTop,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [vista, q, fechaSel, turnoSel]);

  useEffect(() => {
    persistState();
  }, [vista, q, fechaSel, turnoSel, persistState]);

  useEffect(() => {
    return () => {
      persistState();
    };
  }, [persistState]);

  const captureScroll = useCallback(() => {
    const el = pdfScrollRef.current;
    if (el) {
      scrollPosRef.current = el.scrollTop;
    }
  }, []);

  const restoreScroll = useCallback(() => {
    const pos = scrollPosRef.current;
    if (!pos) return;
    const tryRestore = (attempts = 0) => {
      const el = pdfScrollRef.current;
      if (el) {
        el.style.scrollBehavior = "auto";
        el.scrollTop = pos;
        requestAnimationFrame(() => {
          el.style.scrollBehavior = "";
        });
      } else if (attempts < 10) {
        setTimeout(() => tryRestore(attempts + 1), 16);
      }
    };
    requestAnimationFrame(() => tryRestore());
  }, []);

  const fetchListas = useCallback(async () => {
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=obtener_listas`, {
        cache: "no-store",
      });
      const json = await resp.json();
      if (json?.exito) {
        setListas({
          cursos: json.listas?.cursos || [],
          divisiones: json.listas?.divisiones || [],
          turnos: json.listas?.turnos || [],
        });
      }
    } catch {}
  }, []);

  const fetchGrupos = useCallback(async () => {
    setCargando(true);
    scrollRestoredRef.current = false;
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_listar_grupos`, {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito) throw new Error(json?.mensaje || "Error al listar grupos.");

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((g) => {
        const tribunalStr = Array.isArray(g.tribunal)
          ? g.tribunal.filter(Boolean).join(" | ")
          : g.tribunal || "";

        return {
          id: g.id_grupo,
          id_grupo: g.id_grupo,
          numero_mesa_1: g.numero_mesa_1,
          numero_mesa_2: g.numero_mesa_2,
          numero_mesa_3: g.numero_mesa_3,
          numero_mesa_4: g.numero_mesa_4 ?? null,
          id_materia: g.id_materia ?? null,
          materia: g.materia ?? "",
          fecha: fechaKey(g.fecha),
          id_turno: g.id_turno ?? null,
          turno: g.turno ?? "",
          profesor: tribunalStr,
          _materia: normalizar(g.materia ?? ""),
          _turno: normalizar(g.turno ?? ""),
          hora: g.hora ?? "",
        };
      });

      setGrupos(procesadas);
      setGruposDB(procesadas);
    } catch {
      setGrupos([]);
      setGruposDB([]);
    } finally {
      setCargando(false);
    }
  }, []);

  const fetchNoAgrupadas = useCallback(async () => {
    setCargandoNo(true);
    scrollRestoredRef.current = false;
    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=mesas_listar_no_agrupadas`,
        { cache: "no-store" }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (!json?.exito) {
        throw new Error(json?.mensaje || "Error al listar no agrupadas.");
      }

      const data = Array.isArray(json.data) ? json.data : [];

      const procesadas = data.map((r) => ({
        id: r.id,
        id_grupo: null,
        numero_mesa_1: r.numero_mesa,
        numero_mesa_2: null,
        numero_mesa_3: null,
        numero_mesa_4: null,
        id_materia: r.id_materia ?? null,
        materia: r.materia ?? "",
        fecha: fechaKey(r.fecha),
        id_turno: r.id_turno ?? null,
        turno: r.turno ?? "",
        profesor: r.tribunal || "",
        _materia: normalizar(r.materia ?? ""),
        _turno: normalizar(r.turno ?? ""),
        _esNoAgrupada: true,
        hora: r.hora ?? "",
      }));

      setNoAgrupadas(procesadas);
      setNoAgrupadasDB(procesadas);
    } catch {
      setNoAgrupadas([]);
      setNoAgrupadasDB([]);
    } finally {
      setCargandoNo(false);
    }
  }, []);

  useEffect(() => {
    fetchListas();
    fetchGrupos();
    fetchNoAgrupadas();
  }, [fetchListas, fetchGrupos, fetchNoAgrupadas]);

  const turnosUnicos = useMemo(() => {
    if (listas.turnos?.length) {
      return listas.turnos
        .map((t) => String(t.nombre ?? t.turno ?? "").trim())
        .filter(Boolean);
    }
    const dataset = vista === "grupos" ? gruposDB : noAgrupadasDB;
    const s = new Set((dataset || []).map((m) => m.turno).filter(Boolean));
    return Array.from(s).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [gruposDB, noAgrupadasDB, listas.turnos, vista]);

  const fechasUnicas = useMemo(() => {
    const dataset = vista === "grupos" ? gruposDB : noAgrupadasDB;
    const set = new Set(
      (dataset || []).map((m) => fechaKey(m.fecha)).filter(Boolean)
    );
    return Array.from(set).sort();
  }, [gruposDB, noAgrupadasDB, vista]);

  const datasetBase = vista === "grupos" ? grupos : noAgrupadas;
  const datasetBaseDB = vista === "grupos" ? gruposDB : noAgrupadasDB;
  const cargandoVista = vista === "grupos" ? cargando : cargandoNo;

  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [mesasDetalle, setMesasDetalle] = useState([]);
  const [detalleCache, setDetalleCache] = useState({});

  const loadDetalle = useCallback(
    async ({ preservarScroll = false } = {}) => {
      try {
        if (preservarScroll) {
          captureScroll();
        }

        setLoadingDetalle(true);
        setMesasDetalle([]);
        setDetalleCache({});
        setBloqueosCorrelativas({});

        const datasetDBLocal = vista === "grupos" ? gruposDB : noAgrupadasDB;
        if (!datasetDBLocal || !datasetDBLocal.length) return;

        const agrupaciones = datasetDBLocal
          .map((g) =>
            [
              g.numero_mesa_1,
              g.numero_mesa_2,
              g.numero_mesa_3,
              g.numero_mesa_4,
            ]
              .filter((n) => n != null)
              .map(Number)
          )
          .filter((arr) => arr.length);

        const fallbackPorNumero = new Map();
        for (const g of datasetDBLocal) {
          const numeros = [
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
          ]
            .filter((n) => n != null)
            .map(Number);

          for (const n of numeros) {
            if (!fallbackPorNumero.has(n)) {
              fallbackPorNumero.set(n, {
                fecha: g.fecha ?? "",
                turno: g.turno ?? "",
                hora: g.hora ?? "",
              });
            }
          }
        }

        const setNums = new Set();
        agrupaciones.forEach((arr) => arr.forEach((n) => setNums.add(n)));
        const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);
        if (!numerosOrdenados.length) return;

        const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle_pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numeros_mesa: numerosOrdenados }),
          cache: "no-store",
        });

        const raw = await resp.text();
        let json;
        try {
          json = JSON.parse(raw);
        } catch {
          throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
        }
        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || "No se pudo obtener el detalle.");
        }

        const detalle = Array.isArray(json.data) ? json.data : [];
        if (!detalle.length) {
          notify({ tipo: "warning", mensaje: "No hay detalle para mostrar." });
          return;
        }

        // ✅ correlativas bloqueadas
        try {
          const respBloq = await fetch(
            `${BASE_URL}/api.php?action=mesas_correlativas_bloqueadas`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ numeros_mesa: numerosOrdenados }),
              cache: "no-store",
            }
          );

          const rawBloq = await respBloq.text();
          let jsonBloq = null;
          try {
            jsonBloq = JSON.parse(rawBloq);
          } catch {
            jsonBloq = null;
          }

          if (respBloq.ok && jsonBloq?.exito) {
            setBloqueosCorrelativas(jsonBloq.data || {});
          } else {
            setBloqueosCorrelativas({});
          }
        } catch {
          setBloqueosCorrelativas({});
        }

        const mesasLogicas = buildMesasLogicas({
          detalle,
          agrupaciones,
          id_grupo: null,
          fallbackPorNumero,
        });
        setMesasDetalle(mesasLogicas);

        const nuevoCache = {};
        for (const m of detalle) {
          const num = Number(m.numero_mesa);
          if (!Number.isFinite(num)) continue;
          let texto = "";
          if (Array.isArray(m.docentes)) texto += " " + m.docentes.join(" ");
          if (Array.isArray(m.alumnos)) {
            for (const a of m.alumnos) if (a?.alumno) texto += " " + a.alumno;
          }
          const norm = normalizar(texto);
          if (!norm) continue;
          nuevoCache[num] = (nuevoCache[num] || "") + " " + norm;
        }
        setDetalleCache(nuevoCache);

        setNotasPendientes({});
        setEditandoNotas(new Set());

        if (preservarScroll) {
          restoreScroll();
        }
      } catch (e) {
        notify({
          tipo: "error",
          mensaje: e?.message || "No se pudo cargar el detalle.",
        });
      } finally {
        setLoadingDetalle(false);
      }
    },
    [vista, gruposDB, noAgrupadasDB, notify, captureScroll, restoreScroll]
  );

  useEffect(() => {
    loadDetalle();
  }, [loadDetalle]);

  const filasFiltradas = useMemo(() => {
    let res = datasetBase;

    if (qDebounced?.trim()) {
      const nq = normalizar(qDebounced);

      res = res.filter((m) => {
        const baseMatch =
          m._materia.includes(nq) ||
          m._turno.includes(nq) ||
          (m.fecha || "").includes(nq) ||
          String(m.id_grupo ?? "").includes(nq) ||
          String(m.numero_mesa_1 ?? "").includes(nq) ||
          String(m.numero_mesa_2 ?? "").includes(nq) ||
          String(m.numero_mesa_3 ?? "").includes(nq) ||
          String(m.numero_mesa_4 ?? "").includes(nq);

        if (baseMatch) return true;

        if (detalleCache && Object.keys(detalleCache).length) {
          const nums = [
            m.numero_mesa_1,
            m.numero_mesa_2,
            m.numero_mesa_3,
            m.numero_mesa_4,
          ]
            .filter((n) => n != null)
            .map(Number);

          for (const n of nums) {
            const texto = detalleCache[n] || "";
            if (texto.includes(nq)) return true;
          }
        }

        return false;
      });
    }

    if (fechaSel) {
      res = res.filter((m) => fechaKey(m.fecha) === fechaSel);
    }

    if (turnoSel) {
      const nt = normalizar(turnoSel);
      res = res.filter((m) => m._turno === nt);
    }

    return res;
  }, [datasetBase, qDebounced, fechaSel, turnoSel, detalleCache]);

  const hayResultados = filasFiltradas.length > 0;

  const hayAlgunaMesa = useMemo(() => {
    return (gruposDB?.length || 0) + (noAgrupadasDB?.length || 0) > 0;
  }, [gruposDB, noAgrupadasDB]);

  const exportarExcel = useCallback(async () => {
    try {
      if (!filasFiltradas.length) return;

      const setNums = new Set();
      for (const g of filasFiltradas) {
        [
          g.numero_mesa_1,
          g.numero_mesa_2,
          g.numero_mesa_3,
          g.numero_mesa_4,
        ]
          .filter((n) => n != null)
          .map(Number)
          .forEach((n) => setNums.add(n));
      }
      const numerosOrdenados = Array.from(setNums).sort((a, b) => a - b);
      if (!numerosOrdenados.length) {
        notify({
          tipo: "warning",
          mensaje: "No hay números de mesa visibles para exportar.",
        });
        return;
      }

      const resp = await fetch(`${BASE_URL}/api.php?action=mesas_detalle_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeros_mesa: numerosOrdenados }),
        cache: "no-store",
      });

      const raw = await resp.text();
      let json;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(raw.slice(0, 400) || "Respuesta no JSON del servidor.");
      }
      if (!resp.ok || !json?.exito) {
        throw new Error(
          json?.mensaje || "No se pudo obtener el detalle para Excel."
        );
      }

      const detalle = Array.isArray(json.data) ? json.data : [];
      if (!detalle.length) {
        notify({
          tipo: "warning",
          mensaje: "El servidor no devolvió detalle para exportar.",
        });
        return;
      }

      const limpiarCursoX = (s) =>
        String(s ?? "")
          .replace(/°\s*°/g, "°")
          .replace(/\s{2,}/g, " ")
          .trim();

      const turnoRank = (t) => {
        const x = (t || "").toLowerCase();
        if (x.includes("mañ") || x.includes("man")) return 0;
        if (x.includes("tar")) return 1;
        return 2;
      };

      const horaX = (t, desdeDB = "") => {
        const limpia = (desdeDB || "").trim();
        if (limpia) {
          const [hh = "", mm = ""] = limpia.split(":");
          if (hh && mm) return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
        }
        const x = (t || "").toLowerCase();
        if (x.includes("mañ") || x.includes("man")) return "07:30";
        if (x.includes("tar")) return "13:30";
        return "";
      };

      const cursoKeyExcel = (cursoRaw = "") => {
        const c = limpiarCursoX(cursoRaw);
        const s = c.replace(/\s+/g, " ").trim().toUpperCase();

        const mYear = s.match(/(\d{1,2})/);
        const year = mYear ? parseInt(mYear[1], 10) : 999;

        let divToken = "";
        const afterYear = s.slice(mYear ? mYear.index + mYear[1].length : 0);
        const mDiv = afterYear.match(/^\s*°?\s*([A-ZÑ0-9]{1,3})/i);
        if (mDiv && mDiv[1]) divToken = String(mDiv[1]).toUpperCase();

        const divIsNum = /^\d+$/.test(divToken);
        const divNum = divIsNum ? parseInt(divToken, 10) : null;

        return {
          year: Number.isFinite(year) ? year : 999,
          divToken: divToken || "Z",
          divIsNum,
          divNum,
        };
      };

      const compararDivisionExcel = (a, b) => {
        if (a.divIsNum && b.divIsNum)
          return (a.divNum ?? 999) - (b.divNum ?? 999);
        if (a.divIsNum && !b.divIsNum) return -1;
        if (!a.divIsNum && b.divIsNum) return 1;
        return String(a.divToken || "").localeCompare(
          String(b.divToken || ""),
          "es",
          { sensitivity: "base", numeric: true }
        );
      };

      const apellidoKeyExcel = (nombreRaw = "") => {
        const s = String(nombreRaw ?? "").trim();
        if (!s) return "";
        const idx = s.indexOf(",");
        if (idx >= 0) return s.slice(0, idx).trim().toUpperCase();
        return s.split(/\s+/)[0].trim().toUpperCase();
      };

      const mapaNumero = new Map();
      for (const g of filasFiltradas) {
        [
          g.numero_mesa_1,
          g.numero_mesa_2,
          g.numero_mesa_3,
          g.numero_mesa_4,
        ]
          .filter((n) => n != null)
          .map(Number)
          .forEach((n) => {
            if (!mapaNumero.has(n)) {
              mapaNumero.set(n, {
                id_grupo: g.id_grupo ?? null,
                fecha: g.fecha ?? "",
                turno: g.turno ?? "",
              });
            }
          });
      }

      const filas = [];
      for (const m of detalle) {
        const numeroMesa = m.numero_mesa ?? null;
        const fb = mapaNumero.get(numeroMesa) || {
          id_grupo: "",
          fecha: "",
          turno: "",
        };
        const fechaISO = m.fecha || fb.fecha || "";
        const turno = m.turno || fb.turno || "";
        const idGrupo = fb.id_grupo ?? "";
        const horaCalc = horaX(turno, m.hora ?? "");
        const materia = m.materia ?? "";
        const docentes =
          Array.isArray(m.docentes) && m.docentes.length ? m.docentes : ["-"];
        const alumnos =
          Array.isArray(m.alumnos) && m.alumnos.length
            ? m.alumnos
            : [{ alumno: "-", dni: "-", curso: "-" }];

        for (const d of docentes) {
          for (const a of alumnos) {
            filas.push({
              "ID Grupo": idGrupo || "",
              "N° Mesa": numeroMesa ?? "",
              Fecha: fechaISO ? formatearFechaISO(fechaISO) : "",
              Turno: turno || "",
              Hora: horaCalc,
              "Espacio Curricular": materia || "",
              Docente: d || "-",
              Estudiante: a?.alumno || "-",
              DNI: a?.dni || "-",
              Curso: limpiarCursoX(a?.curso || "-"),
              _sortFechaISO: fechaISO || "9999-12-31",
              _sortTurnoRank: turnoRank(turno),
            });
          }
        }
      }

      filas.sort((A, B) => {
        if (A._sortFechaISO !== B._sortFechaISO)
          return A._sortFechaISO < B._sortFechaISO ? -1 : 1;
        if (A._sortTurnoRank !== B._sortTurnoRank)
          return A._sortTurnoRank - B._sortTurnoRank;

        const nA = parseInt(A["N° Mesa"] || 0, 10);
        const nB = parseInt(B["N° Mesa"] || 0, 10);
        if (nA !== nB) return nA - nB;

        const d = String(A.Docente || "").localeCompare(
          String(B.Docente || ""),
          "es",
          { sensitivity: "base" }
        );
        if (d !== 0) return d;

        const cA = cursoKeyExcel(A.Curso || "");
        const cB = cursoKeyExcel(B.Curso || "");
        if (cA.year !== cB.year) return cA.year - cB.year;

        const divCmp = compararDivisionExcel(cA, cB);
        if (divCmp !== 0) return divCmp;

        const apA = apellidoKeyExcel(A.Estudiante || "");
        const apB = apellidoKeyExcel(B.Estudiante || "");
        const apCmp = apA.localeCompare(apB, "es", { sensitivity: "base" });
        if (apCmp !== 0) return apCmp;

        return String(A.Estudiante || "").localeCompare(
          String(B.Estudiante || ""),
          "es",
          { sensitivity: "base" }
        );
      });

      const filasFinales = filas.map(
        ({ _sortFechaISO, _sortTurnoRank, ...rest }) => rest
      );

      const headers = [
        "ID Grupo",
        "N° Mesa",
        "Fecha",
        "Turno",
        "Hora",
        "Espacio Curricular",
        "Docente",
        "Estudiante",
        "DNI",
        "Curso",
      ];

      const ws = XLSX.utils.json_to_sheet(filasFinales, { header: headers });
      ws["!cols"] = [
        { wch: 10 },
        { wch: 9 },
        { wch: 12 },
        { wch: 10 },
        { wch: 9 },
        { wch: 28 },
        { wch: 26 },
        { wch: 28 },
        { wch: 12 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        vista === "grupos" ? "Mesas (detalle)" : "No agrupadas (detalle)"
      );

      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/octet-stream" });

      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const nombre =
        vista === "grupos"
          ? `MesasDeExamen_Detalle_${yyyy}-${mm}-${dd}(${filasFinales.length} filas).xlsx`
          : `MesasNoAgrupadas_Detalle_${yyyy}-${mm}-${dd}(${filasFinales.length} filas).xlsx`;
      saveAs(blob, nombre);

      notify({
        tipo: "exito",
        mensaje: `Exportadas ${filasFinales.length} filas detalladas.`,
      });
    } catch (e) {
      notify({
        tipo: "error",
        mensaje: e?.message || "No se pudo exportar el Excel detallado.",
      });
    }
  }, [filasFiltradas, notify, vista]);

  const mesasDetalleFiltradas = useMemo(() => {
    if (!mesasDetalle.length || !filasFiltradas.length) return [];

    const setNums = new Set();
    for (const g of filasFiltradas) {
      [
        g.numero_mesa_1,
        g.numero_mesa_2,
        g.numero_mesa_3,
        g.numero_mesa_4,
      ]
        .filter((n) => n != null)
        .map(Number)
        .forEach((n) => setNums.add(n));
    }

    if (!setNums.size) return [];

    let out = mesasDetalle.filter(
      (mesa) =>
        Array.isArray(mesa.subNumeros) &&
        mesa.subNumeros.some((n) => setNums.has(n))
    );

    if (fechaSel) {
      out = out.filter((m) => fechaKey(m.fecha) === fechaSel);
    }
    if (turnoSel) {
      out = out.filter((m) => normalizar(m.turno) === normalizar(turnoSel));
    }

    return out;
  }, [mesasDetalle, filasFiltradas, fechaSel, turnoSel]);

  useEffect(() => {
    if (cargandoVista || loadingDetalle) return;

    const frame = requestAnimationFrame(() => {
      const el = pdfScrollRef.current;
      if (!el) return;
      if (!scrollRestoredRef.current && scrollPosRef.current > 0) {
        el.style.scrollBehavior = "auto";
        el.scrollTop = scrollPosRef.current;
        requestAnimationFrame(() => {
          el.style.scrollBehavior = "";
        });
        scrollRestoredRef.current = true;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [cargandoVista, loadingDetalle, mesasDetalleFiltradas.length]);

  const restaurarScroll = useCallback(() => {
    const frame = requestAnimationFrame(() => {
      const el = pdfScrollRef.current;
      if (el && scrollPosRef.current > 0) {
        el.style.scrollBehavior = "auto";
        el.scrollTop = scrollPosRef.current;
        requestAnimationFrame(() => {
          el.style.scrollBehavior = "";
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const pedirTituloYExportar = useCallback((fnExport) => {
    exportActionRef.current = fnExport;
    setAbrirTituloPDF(true);
  }, []);

  /* ======================
   *  NOTAS
   * ====================== */

  const buildRowId = useCallback((mesa, bloque, alumno, filaFallback = 0) => {
    const mesaKey = Array.isArray(mesa?.subNumeros)
      ? mesa.subNumeros.join("-")
      : "NA";
    const fecha = fechaKey(mesa?.fecha || "");
    const turno = String(mesa?.turno || "");
    const materia = String(bloque?.materia || "");
    const docente = String(bloque?.docente || "");
    const dni = String(alumno?.dni || "").trim();
    const nom = String(alumno?.alumno || "").trim();
    const alumKey = dni || nom || String(filaFallback);
    return `${fecha}|${turno}|${mesaKey}|${materia}|${docente}|${alumKey}`;
  }, []);

  const getNotaUIValue = useCallback(
    (rowId) => {
      const pend = notasPendientes[rowId];
      if (pend && typeof pend === "object") return String(pend.value ?? "");
      return VALOR_AUSENTE;
    },
    [notasPendientes]
  );

  const onChangeNota = useCallback((rowId, nueva) => {
    setNotasPendientes((prev) => ({
      ...prev,
      [rowId]: { value: nueva },
    }));
  }, []);

  const toggleEditandoNota = useCallback((rowId) => {
    setEditandoNotas((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const cancelarEdicionNota = useCallback((rowId) => {
    setEditandoNotas((prev) => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
    setNotasPendientes((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  const abrirAlertaCorrelativa = useCallback((avisos = []) => {
    if (!Array.isArray(avisos) || !avisos.length) return;
    setAlertaCorrelativa({
      items: avisos,
      createdAt: Date.now(),
    });
  }, []);

  const confirmarNota = useCallback(
    async ({ rowId, alumno, mesa, bloque }) => {
      const pend = notasPendientes[rowId];
      if (!pend) return;

      const raw = String(pend.value ?? "").trim();
      const limpiar = raw === "" || raw === VALOR_AUSENTE;

      let n = null;
      if (!limpiar) {
        const parsed = parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
          notify({
            tipo: "warning",
            mensaje: "La nota debe estar entre 1 y 10.",
          });
          return;
        }
        n = parsed;
      }

      const id_previa = parseInt(String(alumno?.id_previa ?? ""), 10);
      const dni = String(alumno?.dni ?? "").trim();
      const nombreAlumno = String(alumno?.alumno ?? "").trim();
      const numero_mesa = Number(
        alumno?.numero_mesa ?? mesa?.subNumeros?.[0] ?? 0
      );
      const fecha_mesa = fechaKey(mesa?.fecha || "");

      const hoyISO = (() => {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      })();

      if (!Number.isFinite(numero_mesa) || numero_mesa <= 0) {
        notify({
          tipo: "error",
          mensaje: "No puedo guardar la nota: falta numero_mesa en el alumno.",
        });
        return;
      }

      try {
        captureScroll();

        const body = {
          id_previa: Number.isFinite(id_previa) && id_previa > 0 ? id_previa : 0,
          numero_mesa,
          fecha_mesa,
          nota: limpiar ? "" : n,
          fecha_nota: limpiar ? "" : hoyISO,
        };

        const resp = await fetch(`${BASE_URL}/api.php?action=agregar_nota`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const rawTxt = await resp.text();
        let json;
        try {
          json = JSON.parse(rawTxt);
        } catch {
          throw new Error(rawTxt.slice(0, 300) || "Respuesta no JSON del servidor.");
        }

        if (!resp.ok || !json?.exito) {
          throw new Error(json?.mensaje || "No se pudo guardar la nota.");
        }

        const avisosCorrelativa = Array.isArray(json?.data?.aviso_correlativa)
          ? json.data.aviso_correlativa
          : [];

        if (avisosCorrelativa.length) {
          abrirAlertaCorrelativa(avisosCorrelativa);

          const primero = avisosCorrelativa[0];
          notify({
            tipo: "warning",
            mensaje:
              `${primero.alumno} desaprobó "${primero.materia_desaprobada}" y no podrá rendir ` +
              `"${primero.materia_bloqueada}" (${primero.curso_bloqueado}).`,
          });
        }

        setNotasPendientes((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
        setEditandoNotas((prev) => {
          const next = new Set(prev);
          next.delete(rowId);
          return next;
        });

        setMesasDetalle((prev) => {
          if (!Array.isArray(prev) || !prev.length) return prev;

          const targetDni = String(dni || "").trim();
          const targetNom = String(nombreAlumno || "").trim();

          const matchAlumno = (a) => {
            const dniA = String(a?.dni || "").trim();
            const nomA = String(a?.alumno || "").trim();
            if (targetDni) return dniA && dniA === targetDni;
            return targetNom && nomA === targetNom;
          };

          return prev.map((m) => ({
            ...m,
            bloques: (m.bloques || []).map((b) => ({
              ...b,
              alumnos: (b.alumnos || []).map((a) => {
                if (!matchAlumno(a)) return a;
                return {
                  ...a,
                  nota: limpiar ? null : n,
                  fecha_nota: limpiar ? null : hoyISO,
                };
              }),
            })),
          }));
        });

        await loadDetalle({ preservarScroll: true });

        notify({
          tipo: "exito",
          mensaje: limpiar
            ? "Nota eliminada y tabla actualizada."
            : `Nota ${n} guardada y tabla actualizada.`,
        });
      } catch (e) {
        notify({
          tipo: "error",
          mensaje: e?.message || "Error guardando la nota en el backend.",
        });
      }
    },
    [
      notasPendientes,
      notify,
      loadDetalle,
      captureScroll,
      abrirAlertaCorrelativa,
    ]
  );

  const cancelarNota = useCallback((rowId) => {
    setNotasPendientes((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  const getNotaDB = useCallback((alumno) => {
    const rawN = alumno?.nota;
    if (rawN === null || rawN === undefined || rawN === "") return null;
    const n = parseInt(String(rawN), 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) return null;
    return n;
  }, []);

  return (
    <div className="glob-profesor-container">
      <FullScreenLoader visible={creandoMesas} title="Procesando…" />

      <div className="glob-profesor-box">
        <div className="glob-front-row-pro">
          <span className="glob-profesor-title">Mesas de Examen</span>

          <div className="glob-search-input-container">
            <input
              type="text"
              placeholder="Buscar por materia, turno, fecha, número, docente o alumno"
              className="glob-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={cargandoVista}
            />
            {q ? (
              <FaTimes
                className="glob-clear-search-icon"
                onClick={() => setQ("")}
              />
            ) : null}
            <button className="glob-search-button" type="button" title="Buscar">
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
                    setOpenFecha(false);
                    setOpenTurno(false);
                  }
                  return next;
                });
              }}
              disabled={cargandoVista}
              type="button"
            >
              <FaFilter className="glob-icon-button" />
              <span>Aplicar Filtros</span>
              <FaChevronDown
                className={`glob-chevron-icon ${
                  mostrarFiltros ? "glob-rotate" : ""
                }`}
              />
            </button>

            {mostrarFiltros && (
              <div className="glob-filtros-menu" role="menu">
                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${
                      openFecha ? "is-open" : ""
                    }`}
                    aria-expanded={openFecha}
                    onClick={() => setOpenFecha((v) => !v)}
                  >
                    <span className="glob-filtros-group-title">
                      <FaCalendarAlt style={{ marginRight: 8 }} /> Filtrar por
                      fecha
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div
                    className={`glob-filtros-group-body ${
                      openFecha ? "is-open" : "is-collapsed"
                    }`}
                  >
                    <div className="glob-grid-filtros">
                      {fechasUnicas.map((f) => (
                        <button
                          key={`fecha-${f}`}
                          type="button"
                          className={`glob-chip-filtro ${
                            fechaSel === f ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setFechaSel(fechaSel === f ? "" : f);
                            setMostrarFiltros(false);
                          }}
                          title={`Filtrar por ${formatearFechaISO(f)}`}
                        >
                          {formatearFechaISO(f)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="glob-filtros-group">
                  <button
                    type="button"
                    className={`glob-filtros-group-header ${
                      openTurno ? "is-open" : ""
                    }`}
                    aria-expanded={openTurno}
                    onClick={() => setOpenTurno((v) => !v)}
                  >
                    <span className="glob-filtros-group-title">
                      <FaClock style={{ marginRight: 8 }} /> Filtrar por turno
                    </span>
                    <FaChevronDown className="glob-accordion-caret" />
                  </button>

                  <div
                    className={`glob-filtros-group-body ${
                      openTurno ? "is-open" : "is-collapsed"
                    }`}
                  >
                    <div className="glob-grid-filtros">
                      {turnosUnicos.map((t) => (
                        <button
                          key={`turno-${t}`}
                          type="button"
                          className={`glob-chip-filtro ${
                            turnoSel === t ? "glob-active" : ""
                          }`}
                          onClick={() => {
                            setTurnoSel(turnoSel === t ? "" : t);
                            setMostrarFiltros(false);
                          }}
                          title={`Filtrar por ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="glob-profesores-list">
          <div className="glob-contenedor-list-items">
            <div className="glob-left-inline">
              <div className="contador-grups-noencontrado">
                <div className="glob-contador-container">
                  <span className="glob-profesores-desktop">
                    {vista === "grupos" ? "Grupos: " : "No agrupadas: "}
                    {filasFiltradas.length}
                  </span>
                  <span className="glob-profesores-mobile">
                    {filasFiltradas.length}
                  </span>
                  <FaUsers className="glob-icono-profesor" />
                </div>

                <div
                  className="glob-tabs glob-tabs--inline"
                  role="tablist"
                  aria-label="Cambiar vista"
                >
                  <button
                    className={`glob-tab ${
                      vista === "grupos" ? "glob-tab--active" : ""
                    }`}
                    onClick={() => {
                      setVista("grupos");
                      scrollRestoredRef.current = false;
                    }}
                    title="Ver grupos armados"
                    aria-pressed={vista === "grupos"}
                    role="tab"
                    type="button"
                  >
                    <FaLayerGroup style={{ marginRight: 6 }} />
                    Grupos
                  </button>
                  <button
                    className={`glob-tab ${
                      vista === "no-agrupadas" ? "glob-tab--active" : ""
                    }`}
                    onClick={() => {
                      setVista("no-agrupadas");
                      scrollRestoredRef.current = false;
                    }}
                    title="Ver mesas no agrupadas"
                    aria-pressed={vista === "no-agrupadas"}
                    role="tab"
                    type="button"
                  >
                    <FaUnlink style={{ marginRight: 6 }} />
                    No agrupadas
                  </button>
                </div>

                {(q || fechaSel || turnoSel) && (
                  <div className="glob-chips-container">
                    {q && (
                      <div className="glob-chip-mini" title="Filtro activo">
                        <span className="glob-chip-mini-text glob-profesores-desktop">
                          Búsqueda: {q}
                        </span>
                        <span className="glob-chip-mini-text glob-profesores-mobile">
                          {q.length > 6 ? `${q.substring(0, 6)}…` : q}
                        </span>
                        <button
                          className="glob-chip-mini-close"
                          onClick={() => setQ("")}
                          aria-label="Quitar"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {fechaSel && (
                      <div className="glob-chip-mini" title="Filtro activo">
                        <span className="glob-chip-mini-text">
                          Fecha: {formatearFechaISO(fechaSel)}
                        </span>
                        <button
                          className="glob-chip-mini-close"
                          onClick={() => setFechaSel("")}
                          aria-label="Quitar"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {turnoSel && (
                      <div className="glob-chip-mini" title="Filtro activo">
                        <span className="glob-chip-mini-text">
                          Turno: {turnoSel}
                        </span>
                        <button
                          className="glob-chip-mini-close"
                          onClick={() => setTurnoSel("")}
                          aria-label="Quitar"
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    <button
                      className="glob-chip-mini glob-chip-clear-all"
                      onClick={() => {
                        setQ("");
                        setFechaSel("");
                        setTurnoSel("");
                      }}
                      title="Quitar todos los filtros"
                      type="button"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="glob-box-table pdf-view">
            {cargandoVista || loadingDetalle ? (
              <div
                className="glob-loading-spinner-container"
                style={{ height: "50vh" }}
              >
                <div className="glob-loading-spinner" />
              </div>
            ) : datasetBaseDB.length === 0 ? (
              <div className="glob-no-data-message">
                <div className="glob-message-content">
                  <p>
                    {vista === "grupos"
                      ? "No hay grupos registrados"
                      : "No hay mesas no agrupadas registradas"}
                  </p>
                </div>
              </div>
            ) : !hayResultados ? (
              <div className="glob-no-data-message">
                <div className="glob-message-content">
                  <p>No hay resultados con los filtros actuales</p>
                </div>
              </div>
            ) : !mesasDetalleFiltradas.length ? (
              <div className="glob-no-data-message">
                <div className="glob-message-content">
                  <p>No hay detalle para mostrar.</p>
                </div>
              </div>
            ) : (
              <div
                className="pdf-scroll"
                ref={pdfScrollRef}
                style={{ scrollBehavior: "auto" }}
              >
                {mesasDetalleFiltradas.map((mesa, idxMesa) => {
                  const { dia, mesTxt, anio } = nombreMes(mesa.fecha);
                  const headerTitulo = `MESAS DE EXAMEN ${
                    mesTxt ? mesTxt + " " : ""
                  }${anio || ""}`.trim();
                  const sub =
                    `${diaSemana(mesa.fecha)} ${String(dia).padStart(2, "0")} · ` +
                    `${String(mesa.turno || "").toUpperCase()} · ${formatearHoraDesdeDB(
                      mesa.hora,
                      mesa.turno
                    )}`;

                  const nRowsPorBloque = mesa.bloques.map((b) =>
                    Math.max(1, b.alumnos.length)
                  );
                  const totalRows = nRowsPorBloque.reduce((a, b) => a + b, 0);

                  const segMateria = [];
                  let curMat = null,
                    accMat = 0,
                    startMat = 0,
                    rowCursor = 0;
                  for (let i = 0; i < mesa.bloques.length; i++) {
                    const mat = mesa.bloques[i].materia || "";
                    const n = nRowsPorBloque[i];
                    if (curMat === null) {
                      curMat = mat;
                      startMat = rowCursor;
                      accMat = 0;
                    }
                    if (mat !== curMat) {
                      segMateria.push({
                        materia: curMat,
                        startRow: startMat,
                        rowSpan: accMat,
                      });
                      curMat = mat;
                      startMat = rowCursor;
                      accMat = 0;
                    }
                    accMat += n;
                    rowCursor += n;
                  }
                  if (curMat !== null)
                    segMateria.push({
                      materia: curMat,
                      startRow: startMat,
                      rowSpan: accMat,
                    });

                  const segDocente = [];
                  let curDoc = null,
                    accDoc = 0,
                    startDoc = 0;
                  let rowCursor2 = 0;
                  for (let i = 0; i < mesa.bloques.length; i++) {
                    const doc = mesa.bloques[i].docente || "-";
                    const n = nRowsPorBloque[i];
                    if (curDoc === null) {
                      curDoc = doc;
                      startDoc = rowCursor2;
                      accDoc = 0;
                    }
                    if (doc !== curDoc) {
                      segDocente.push({
                        docente: curDoc,
                        startRow: startDoc,
                        rowSpan: accDoc,
                      });
                      curDoc = doc;
                      startDoc = rowCursor2;
                      accDoc = 0;
                    }
                    accDoc += n;
                    rowCursor2 += n;
                  }
                  if (curDoc !== null)
                    segDocente.push({
                      docente: curDoc,
                      startRow: startDoc,
                      rowSpan: accDoc,
                    });

                  const materiaStart = new Map(
                    segMateria.map((s) => [s.startRow, s])
                  );
                  const docenteStart = new Map(
                    segDocente.map((s) => [s.startRow, s])
                  );

                  const materiaEndRows = new Set(
                    Array.from(materiaStart.values()).map(
                      (s) => s.startRow + (s.rowSpan || 1) - 1
                    )
                  );
                  const docenteEndRows = new Set(
                    Array.from(docenteStart.values()).map(
                      (s) => s.startRow + (s.rowSpan || 1) - 1
                    )
                  );

                  const rowsHTML = [];
                  let filaGlobal = 0;

                  for (let bi = 0; bi < mesa.bloques.length; bi++) {
                    const bloque = mesa.bloques[bi];
                    const n = nRowsPorBloque[bi];

                    for (let i = 0; i < n; i++) {
                      const a =
                        bloque.alumnos[i] || {
                          alumno: "-",
                          dni: "-",
                          curso: "-",
                        };

                      const notaDB = getNotaDB(a);
                      const rowId = buildRowId(mesa, bloque, a, filaGlobal);
                      const notaUI = getNotaUIValue(rowId);
                      const tienePendiente = Boolean(notasPendientes[rowId]);
                      const estaEditando = editandoNotas.has(rowId);
                      const bloqueoCorrelativa =
                        a?.id_previa != null
                          ? bloqueosCorrelativas[String(a.id_previa)] || null
                          : null;

                      const celdas = [];

                      if (filaGlobal === 0) {
                        celdas.push(
                          <td
                            key="hora"
                            rowSpan={Math.max(totalRows, 1)}
                            className="pdf-hora-cell"
                          >
                            {`${diaSemana(mesa.fecha)}\n${String(dia).padStart(
                              2,
                              "0"
                            )}\n${mesTxt}\n${String(
                              mesa.turno || ""
                            ).toUpperCase()}\n${formatearHoraDesdeDB(
                              mesa.hora,
                              mesa.turno
                            )}`}
                          </td>
                        );
                      }

                      const mStart = materiaStart.get(filaGlobal);
                      if (mStart) {
                        celdas.push(
                          <td
                            key={`mat-${filaGlobal}`}
                            rowSpan={mStart.rowSpan || 1}
                            className="pdf-materia-cell"
                          >
                            {String(mStart.materia || "")}
                          </td>
                        );
                      }

                      celdas.push(
                        <td
                          key={`al-${filaGlobal}`}
                          className="pdf-td-left col-estudiante"
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            <span>{String(a.alumno || "")}</span>

                            {bloqueoCorrelativa && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  width: "fit-content",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: "#b42318",
                                  background: "rgba(231, 76, 60, 0.14)",
                                  border: "1px solid rgba(231, 76, 60, 0.25)",
                                  borderRadius: 999,
                                  padding: "3px 8px",
                                }}
                                title={
                                  `No puede rendir ${bloqueoCorrelativa.materia_bloqueada} ` +
                                  `porque desaprobó ${bloqueoCorrelativa.materia_desaprobada}`
                                }
                              >
                                <FaExclamationTriangle />
                                Correlativa bloqueada
                              </span>
                            )}
                          </div>
                        </td>
                      );

                      celdas.push(
                        <td key={`dni-${filaGlobal}`} className="col-dni">
                          {String(a.dni || "")}
                        </td>
                      );

                      celdas.push(
                        <td
                          key={`cur-${filaGlobal}`}
                          className="pdf-td-center col-curso"
                        >
                          {limpiarCurso(a.curso)}
                        </td>
                      );

                      celdas.push(
                        <td
                          key={`nota-${filaGlobal}`}
                          className="pdf-td-center col-nota"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {notaDB != null && !estaEditando ? (
                            <span
                              onDoubleClick={() => {
                                setNotasPendientes((prev) => ({
                                  ...prev,
                                  [rowId]: { value: String(notaDB) },
                                }));
                                toggleEditandoNota(rowId);
                              }}
                              style={{
                                display: "inline-block",
                                minWidth: 78,
                                padding: "6px 8px",
                                borderRadius: 8,
                                fontWeight: 800,
                                border: "1px solid rgba(0,0,0,0.10)",
                                background: "rgba(0,0,0,0.04)",
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                              title="Doble clic para editar la nota"
                            >
                              {notaDB}
                            </span>
                          ) : (
                            <>
                              <select
                                value={notaUI}
                                onChange={(e) =>
                                  onChangeNota(rowId, e.target.value)
                                }
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: bloqueoCorrelativa
                                    ? "1px solid rgba(231, 76, 60, 0.45)"
                                    : "1px solid rgba(0,0,0,0.12)",
                                  outline: "none",
                                  fontWeight: 700,
                                  width: 90,
                                  background: bloqueoCorrelativa
                                    ? "rgba(231, 76, 60, 0.08)"
                                    : tienePendiente && notaUI !== VALOR_AUSENTE
                                    ? "rgba(255, 193, 7, 0.18)"
                                    : "white",
                                }}
                                title={
                                  bloqueoCorrelativa
                                    ? `Atención: correlativa bloqueada por desaprobación de ${bloqueoCorrelativa.materia_desaprobada}`
                                    : estaEditando
                                    ? "Editando nota"
                                    : tienePendiente && notaUI !== VALOR_AUSENTE
                                    ? "Nota pendiente de confirmación"
                                    : "Seleccionar nota"
                                }
                              >
                                <option value={VALOR_AUSENTE}>Ausente</option>
                                {Array.from({ length: 10 }, (_, k) =>
                                  String(k + 1)
                                ).map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>

                              {(tienePendiente &&
                                notaUI !== VALOR_AUSENTE) ||
                              estaEditando ? (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    display: "inline-flex",
                                    gap: 6,
                                  }}
                                >
                                  {tienePendiente && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        confirmarNota({
                                          rowId,
                                          alumno: a,
                                          mesa,
                                          bloque,
                                        })
                                      }
                                      title={
                                        notaUI === VALOR_AUSENTE
                                          ? "Guardar como Ausente (sin nota)"
                                          : "Confirmar nota (guardar en DB)"
                                      }
                                      style={{
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 8px",
                                        cursor: "pointer",
                                        background: "rgba(46, 204, 113, 0.18)",
                                      }}
                                      aria-label="Confirmar nota"
                                    >
                                      <FaCheck />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (estaEditando) {
                                        cancelarEdicionNota(rowId);
                                      } else {
                                        cancelarNota(rowId);
                                      }
                                    }}
                                    title="Cancelar"
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 8px",
                                      cursor: "pointer",
                                      background: "rgba(231, 76, 60, 0.15)",
                                    }}
                                    aria-label="Cancelar nota"
                                  >
                                    <FaTimes />
                                  </button>
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                      );

                      const dStart = docenteStart.get(filaGlobal);
                      if (dStart) {
                        celdas.push(
                          <td
                            key={`doc-${filaGlobal}`}
                            rowSpan={dStart.rowSpan || 1}
                            className="pdf-docente-cell"
                          >
                            <div className="docente-cell-content">
                              <span className="docente-nombre">
                                {String(dStart.docente || "-")}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      const isDocenteStart = docenteStart.has(filaGlobal);
                      const isDocenteEnd = docenteEndRows.has(filaGlobal);
                      const isMateriaStart = materiaStart.has(filaGlobal);
                      const isMateriaEnd = materiaEndRows.has(filaGlobal);

                      rowsHTML.push(
                        <tr
                          key={`r-${idxMesa}-${filaGlobal}`}
                          className={`${isDocenteStart ? "doc-block-start" : ""} ${
                            isDocenteEnd ? "doc-block-end" : ""
                          } ${isMateriaStart ? "mat-block-start" : ""} ${
                            isMateriaEnd ? "mat-block-end" : ""
                          } ${bloqueoCorrelativa ? "row-correlativa-bloqueada" : ""}`}
                          style={
                            bloqueoCorrelativa
                              ? {
                                  background: "rgba(231, 76, 60, 0.12)",
                                  boxShadow: "inset 4px 0 0 #e74c3c",
                                }
                              : undefined
                          }
                        >
                          {celdas}
                        </tr>
                      );

                      filaGlobal++;
                    }
                  }

                  if (totalRows === 0) {
                    const bloqueFake = {
                      materia: mesa.materia || "-",
                      docente: "-",
                    };
                    const alumnoFake = {
                      alumno: "-",
                      dni: "-",
                      curso: "-",
                      nota: null,
                      id_previa: null,
                    };
                    const notaDB = getNotaDB(alumnoFake);
                    const rowId = buildRowId(mesa, bloqueFake, alumnoFake, 0);
                    const notaUI = getNotaUIValue(rowId);
                    const tienePendiente = Boolean(notasPendientes[rowId]);
                    const estaEditando = editandoNotas.has(rowId);

                    rowsHTML.push(
                      <tr
                        key={`r-empty-${idxMesa}`}
                        className="doc-block-start doc-block-end mat-block-start mat-block-end"
                      >
                        <td className="pdf-hora-cell">
                          {`${diaSemana(mesa.fecha)}\n${String(dia).padStart(
                            2,
                            "0"
                          )}\n${mesTxt}\n${String(
                            mesa.turno || ""
                          ).toUpperCase()}\n${formatearHoraDesdeDB(
                            mesa.hora,
                            mesa.turno
                          )}`}
                        </td>
                        <td className="pdf-materia-cell">
                          {mesa.materia || "-"}
                        </td>
                        <td className="pdf-td-left col-estudiante">-</td>
                        <td className="pdf-td-center col-dni">-</td>
                        <td className="pdf-td-center col-curso">-</td>

                        <td
                          className="pdf-td-center col-nota"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {notaDB != null && !estaEditando ? (
                            <span
                              onDoubleClick={() => {
                                setNotasPendientes((prev) => ({
                                  ...prev,
                                  [rowId]: { value: String(notaDB) },
                                }));
                                toggleEditandoNota(rowId);
                              }}
                              style={{
                                display: "inline-block",
                                minWidth: 78,
                                padding: "6px 8px",
                                borderRadius: 8,
                                fontWeight: 800,
                                border: "1px solid rgba(0,0,0,0.10)",
                                background: "rgba(0,0,0,0.04)",
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                              title="Doble clic para editar la nota"
                            >
                              {notaDB}
                            </span>
                          ) : (
                            <>
                              <select
                                value={notaUI}
                                onChange={(e) =>
                                  onChangeNota(rowId, e.target.value)
                                }
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  border: "1px solid rgba(0,0,0,0.12)",
                                  outline: "none",
                                  fontWeight: 700,
                                  width: 90,
                                  background:
                                    tienePendiente && notaUI !== VALOR_AUSENTE
                                      ? "rgba(255, 193, 7, 0.18)"
                                      : "white",
                                }}
                              >
                                <option value={VALOR_AUSENTE}>Ausente</option>
                                {Array.from({ length: 10 }, (_, k) =>
                                  String(k + 1)
                                ).map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                              {(tienePendiente && notaUI !== VALOR_AUSENTE) ||
                              estaEditando ? (
                                <span
                                  style={{
                                    marginLeft: 8,
                                    display: "inline-flex",
                                    gap: 6,
                                  }}
                                >
                                  {tienePendiente && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        confirmarNota({
                                          rowId,
                                          alumno: alumnoFake,
                                          mesa,
                                          bloque: bloqueFake,
                                        })
                                      }
                                      title="Confirmar nota (guardar en DB)"
                                      style={{
                                        border: "none",
                                        borderRadius: 8,
                                        padding: "6px 8px",
                                        cursor: "pointer",
                                        background: "rgba(46, 204, 113, 0.18)",
                                      }}
                                    >
                                      <FaCheck />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (estaEditando) {
                                        cancelarEdicionNota(rowId);
                                      } else {
                                        cancelarNota(rowId);
                                      }
                                    }}
                                    title="Cancelar"
                                    style={{
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 8px",
                                      cursor: "pointer",
                                      background: "rgba(231, 76, 60, 0.15)",
                                    }}
                                  >
                                    <FaTimes />
                                  </button>
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>

                        <td className="pdf-docente-cell">
                          <div className="docente-cell-content">
                            <span className="docente-nombre">-</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const primerNumero =
                    Array.isArray(mesa.subNumeros) && mesa.subNumeros.length
                      ? mesa.subNumeros[0]
                      : null;

                  return (
                    <div key={`mesa-${idxMesa}`} className="mesa-detalle-box">
                      <div className="pdf-header">
                        <div className="pdf-header-left">
                          <img src={escudo} alt="Logo" className="pdf-logo" />
                          <div className="pdf-header-titles">
                            <div className="pdf-title">{headerTitulo}</div>
                            <div className="pdf-subtitle">
                              IPET N° 50 "Ing. Emilio F. Olmos"
                            </div>
                          </div>
                        </div>

                        <div className="pdf-header-right">
                          <div className="pdf-subinfo">{sub}</div>
                          <div className="pdf-subinfo">
                            <strong>N° de mesa:</strong>{" "}
                            {mesa.subNumeros.join(" • ") || "-"}
                          </div>
                        </div>
                      </div>

                      <div className="pdf-table-wrapper">
                        <table className="tabla-detalle-mesa">
                          <thead>
                            <tr>
                              <th>Hora</th>
                              <th>Espacio Curricular</th>
                              <th>Estudiante</th>
                              <th className="col-dni">DNI</th>
                              <th className="pdf-td-center">Curso</th>
                              <th className="pdf-td-center">Nota</th>
                              <th>Docentes</th>
                            </tr>
                          </thead>
                          <tbody>{rowsHTML}</tbody>
                        </table>
                      </div>

                      <div className="pdf-actions">
                        <button
                          className="glob-iconchip pdfbuttons"
                          title="Exportar esta mesa a PDF"
                          onClick={() => {
                            const agrupacion = [mesa.subNumeros];
                            generarPDFMesas({
                              mesasFiltradas: mesa.subNumeros.map((n) => ({
                                numero_mesa: n,
                              })),
                              agrupaciones: agrupacion,
                              baseUrl: BASE_URL,
                              notify,
                              logoPath: escudo,
                            });
                          }}
                          aria-label="Exportar PDF de esta mesa"
                          type="button"
                        >
                          <FaFilePdf />
                          &nbsp; PDF (esta mesa)
                        </button>

                        <button
                          className="glob-iconchip pdfbuttons"
                          title="Editar (primera mesa de la agrupación)"
                          onClick={() => {
                            if (!primerNumero) return;

                            try {
                              if (typeof window !== "undefined") {
                                window.sessionStorage.setItem(
                                  STORAGE_FLAG_FROM_EDIT,
                                  "1"
                                );
                              }
                            } catch {}

                            persistState();
                            navigate(`/mesas/editar/${primerNumero}`);
                          }}
                          aria-label="Editar mesa"
                          style={{ marginLeft: 8 }}
                          type="button"
                        >
                          <FaEdit />
                          &nbsp; Editar
                        </button>

                        <button
                          className="glob-iconchip pdfbuttons"
                          title="Eliminar (primera mesa de la agrupación)"
                          onClick={() => {
                            if (!primerNumero) return;
                            setMesaAEliminar({ numero_mesa: primerNumero });
                            setAbrirEliminarUno(true);
                          }}
                          aria-label="Eliminar mesa"
                          style={{ marginLeft: 8 }}
                          type="button"
                        >
                          <FaTrash />
                          &nbsp; Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="glob-down-container">
          <button
            className="glob-profesor-button glob-hover-effect glob-volver-atras"
            onClick={() => {
              try {
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(STORAGE_KEY);
                  window.sessionStorage.removeItem(STORAGE_FLAG_FROM_EDIT);
                }
              } catch {}
              navigate("/panel");
            }}
            aria-label="Volver"
            title="Volver"
            type="button"
          >
            <FaArrowLeft className="glob-profesor-icon-button" />
            <p>Volver Atrás</p>
          </button>

          <div className="glob-botones-container">
            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirCrear(true)}
              aria-label="Crear"
              title={
                hayAlgunaMesa
                  ? "Ya hay mesas creadas. Elimina las mesas para volver a crear."
                  : "Crear mesas (confirmar)"
              }
              disabled={hayAlgunaMesa}
              type="button"
            >
              <FaUserPlus className="glob-profesor-icon-button" />
              <p>Crear Mesas</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={exportarExcel}
              disabled={!filasFiltradas.length}
              aria-label="Exportar"
              title={
                filasFiltradas.length
                  ? "Exportar Excel (detalle completo por mesa)"
                  : "No hay filas visibles para exportar"
              }
              type="button"
            >
              <FaFileExcel className="glob-profesor-icon-button" />
              <p>Exportar Excel</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => {
                if (!filasFiltradas.length) return;

                pedirTituloYExportar(({ tituloBase, tituloExtra }) => {
                  const agrupaciones = filasFiltradas.map((g) =>
                    [
                      g.numero_mesa_1,
                      g.numero_mesa_2,
                      g.numero_mesa_3,
                      g.numero_mesa_4,
                    ]
                      .filter((n) => n != null)
                      .map(Number)
                  );

                  const setNums = new Set();
                  for (const arr of agrupaciones)
                    for (const n of arr) setNums.add(n);
                  const numerosOrdenados = Array.from(setNums).sort(
                    (a, b) => a - b
                  );

                  generarPDFMesas({
                    mesasFiltradas: numerosOrdenados.map((n) => ({
                      numero_mesa: n,
                    })),
                    agrupaciones,
                    baseUrl: BASE_URL,
                    notify,
                    logoPath: escudo,
                    pdfTituloBase: tituloBase,
                    pdfTituloExtra: tituloExtra,
                  });
                });
              }}
              disabled={!filasFiltradas.length}
              aria-label="Exportar PDF"
              title="Exportar PDF (una hoja por mesa)"
              style={{ background: "var(--glob-primary, #2d3436)" }}
              type="button"
            >
              <FaFilePdf className="glob-profesor-icon-button" />
              <p>Exportar PDF</p>
            </button>

            <button
              className="glob-profesor-button glob-hover-effect"
              onClick={() => setAbrirEliminar(true)}
              aria-label="Eliminar"
              title="Eliminar mesas (confirmar)"
              disabled={!hayAlgunaMesa}
              type="button"
            >
              <FaEraser className="glob-profesor-icon-button" />
              <p>Eliminar Mesas</p>
            </button>
          </div>
        </div>
      </div>

      {abrirCrear && (
        <ModalCrearMesas
          open={abrirCrear}
          onClose={() => setAbrirCrear(false)}
          onLoadingChange={(v) => setCreandoMesas(Boolean(v))}
          onSuccess={async () => {
            setAbrirCrear(false);
            await fetchGrupos();
            await fetchNoAgrupadas();

            setVista("grupos");

            notify({
              tipo: "exito",
              mensaje: "Mesas creadas y grupos actualizados.",
            });

            restaurarScroll();
          }}
          onError={(mensaje) => {
            setAbrirCrear(false);
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudieron crear las mesas.",
            });
          }}
        />
      )}

      {abrirEliminar && (
        <ModalEliminarMesas
          open={abrirEliminar}
          onClose={() => setAbrirEliminar(false)}
          onSuccess={async () => {
            setAbrirEliminar(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            notify({
              tipo: "exito",
              mensaje: "Mesas eliminadas correctamente",
            });

            restaurarScroll();
          }}
          onError={(mensaje) =>
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudieron eliminar las mesas.",
            })
          }
          listas={listas}
        />
      )}

      {abrirEliminarUno && mesaAEliminar?.numero_mesa && (
        <ModalEliminarMesa
          open={abrirEliminarUno}
          mesa={{ numero_mesa: mesaAEliminar.numero_mesa }}
          onClose={() => setAbrirEliminarUno(false)}
          onSuccess={async () => {
            setAbrirEliminarUno(false);
            await fetchGrupos();
            await fetchNoAgrupadas();
            notify({ tipo: "exito", mensaje: "Mesa eliminada." });

            restaurarScroll();
          }}
          onError={(mensaje) =>
            notify({
              tipo: "error",
              mensaje: mensaje || "No se pudo eliminar la mesa.",
            })
          }
        />
      )}

      {abrirTituloPDF && (
        <ModalTituloPDF
          open={abrirTituloPDF}
          onClose={() => setAbrirTituloPDF(false)}
          tituloBase="MESAS DE EXAMEN"
          defaultExtra=""
          onConfirm={({ tituloBase, tituloExtra }) => {
            setAbrirTituloPDF(false);
            const fn = exportActionRef.current;
            exportActionRef.current = null;
            if (typeof fn === "function") fn({ tituloBase, tituloExtra });
          }}
        />
      )}

      <ModalAvisoCorrelativa
        open={
          Boolean(alertaCorrelativa) &&
          Array.isArray(alertaCorrelativa?.items) &&
          alertaCorrelativa.items.length > 0
        }
        items={alertaCorrelativa?.items || []}
        onClose={() => setAlertaCorrelativa(null)}
      />

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default MesasExamen;
// ✅ REEMPLAZAR COMPLETO
// src/components/Previas/PreviasBaja.jsx
import React, { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaInfoCircle, FaCheckCircle } from "react-icons/fa";
import {
  FaArrowLeft,
  FaUsers,
  FaSearch,
  FaTimes,
  FaUserPlus,
  FaTrash,
} from "react-icons/fa";
import BASE_URL from "../../config/config";
import Toast from "../Global/Toast";

import DarAltaPreviaModal from "./modales/DarAltaPreviaModal";
import ModalEliminarPreviaBaja from "./modales/ModalEliminarPreviaBaja";

import "../Global/roots.css";
import "../Global/section-ui.css";
import "../Profesores/ProfesorBaja.css";

/* ======================
   Helpers
====================== */
const normalizar = (str = "") =>
  (str?.toString?.() ?? String(str))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const fmtFechaAR = (v) => {
  if (!v) return "-";
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

const ymd = (v) => {
  if (!v) return "";
  return String(v).slice(0, 10); // YYYY-MM-DD
};

const ymdToNum = (s) => {
  // "YYYY-MM-DD" => number comparable
  if (!s || typeof s !== "string") return 0;
  const t = s.replaceAll("-", "");
  return /^\d{8}$/.test(t) ? Number(t) : 0;
};

/* =========================================================
   Modal motivo completo
========================================================= */
const MotivoCompletoModal = ({ open, motivo, tipo, onClose }) => {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="prevMot_modal" role="dialog" aria-modal="true">
      <button
        className="prevMot_backdrop"
        onClick={onClose}
        aria-label="Cerrar modal"
        type="button"
      />
      <div className="prevMot_card">
        <div className="prevMot_iconWrap">
          <div
            className={`prevMot_iconCircle ${
              tipo === "aprobado" ? "prevMot_iconCircle--ok" : ""
            }`}
          >
            {tipo === "aprobado" ? <FaCheckCircle /> : <FaInfoCircle />}
          </div>
        </div>

        <h3 className="prevMot_title">Motivo de la baja</h3>

        <div className="prevMot_box">{motivo || "-"}</div>

        <div className="prevMot_actions">
          <button
            ref={closeRef}
            type="button"
            className="prevMot_btn"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   PreviasBaja
========================================================= */
const PreviasBaja = () => {
  const navigate = useNavigate();

  const [previas, setPrevias] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [toast, setToast] = useState({ mostrar: false, tipo: "", mensaje: "" });

  // ✅ filtro fechas
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [modalAlta, setModalAlta] = useState({
    open: false,
    item: null,
    loading: false,
    error: "",
  });

  const [modalEliminar, setModalEliminar] = useState({
    open: false,
    item: null,
    loading: false,
    error: "",
  });

  const [modalMotivo, setModalMotivo] = useState({
    open: false,
    motivo: "",
    tipo: "baja",
  });

  const abrirModalMotivo = useCallback((motivo, tipo) => {
    setModalMotivo({ open: true, motivo: motivo || "", tipo: tipo || "baja" });
  }, []);

  const cerrarModalMotivo = useCallback(() => {
    setModalMotivo({ open: false, motivo: "", tipo: "baja" });
  }, []);

  const motivoRefs = useRef({});
  const [motivosOverflow, setMotivosOverflow] = useState({});

  const mostrarToast = useCallback((mensaje, tipo = "exito") => {
    setToast({ mostrar: true, tipo, mensaje });
  }, []);

  const cargarBajas = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch(
        `${BASE_URL}/api.php?action=previas_baja&ts=${Date.now()}`
      );
      const data = await res.json();
      if (!data?.exito) throw new Error(data?.mensaje || "Error desconocido");

      const procesadas = (data.previas || []).map((p) => {
        const fecha_real =
          p.tipo_baja === "aprobado" ? ymd(p.fecha_nota) : ymd(p.fecha_baja);

        const motivoVisible = p.motivo_baja_display || p.motivo_baja || "";

        return {
          ...p,
          motivo_display: motivoVisible,
          fecha_real,
          _fecha_num: ymdToNum(fecha_real),
          _alumno: normalizar(p.alumno),
          _dni: String(p.dni || "").toLowerCase(),
          _motivo: normalizar(motivoVisible),
        };
      });

      procesadas.sort((a, b) => {
        const fa = a._fecha_num || 0;
        const fb = b._fecha_num || 0;
        if (fb !== fa) return fb - fa;
        return String(a.alumno || "").localeCompare(String(b.alumno || ""), "es", {
          sensitivity: "base",
        });
      });

      setPrevias(procesadas);

      const fechas = procesadas
        .map((x) => x.fecha_real)
        .filter(Boolean)
        .sort();
      const min = fechas[0] || "";
      const max = fechas[fechas.length - 1] || "";

      setFechaDesde((old) => old || min);
      setFechaHasta((old) => old || max);
    } catch (e) {
      mostrarToast(e.message || "Error al obtener bajas", "error");
    } finally {
      setCargando(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    cargarBajas();
  }, [cargarBajas]);

  const rangoFechas = useMemo(() => {
    const fechas = previas.map((p) => p.fecha_real).filter(Boolean).sort();
    return { min: fechas[0] || "", max: fechas[fechas.length - 1] || "" };
  }, [previas]);

  const bajasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);

    const desdeNum = ymdToNum(fechaDesde || rangoFechas.min);
    const hastaNum = ymdToNum(fechaHasta || rangoFechas.max);

    const dentroRango = (p) => {
      if (!p._fecha_num) return true;
      if (desdeNum && p._fecha_num < desdeNum) return false;
      if (hastaNum && p._fecha_num > hastaNum) return false;
      return true;
    };

    const porTexto = (p) => {
      if (!q) return true;
      return p._alumno.includes(q) || p._dni.includes(q) || p._motivo.includes(q);
    };

    const arr = previas.filter((p) => dentroRango(p) && porTexto(p));

    arr.sort((a, b) => {
      const fa = a._fecha_num || 0;
      const fb = b._fecha_num || 0;
      if (fb !== fa) return fb - fa;
      return String(a.alumno || "").localeCompare(String(b.alumno || ""), "es", {
        sensitivity: "base",
      });
    });

    return arr;
  }, [previas, busqueda, fechaDesde, fechaHasta, rangoFechas.min, rangoFechas.max]);

  useEffect(() => {
    const medir = () => {
      const next = {};
      for (const p of bajasFiltradas) {
        const el = motivoRefs.current[p.id_previa];
        if (!el) continue;
        next[p.id_previa] = el.scrollWidth > el.clientWidth + 1;
      }
      setMotivosOverflow(next);
    };
    const t = setTimeout(medir, 0);
    window.addEventListener("resize", medir);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", medir);
    };
  }, [bajasFiltradas]);

  // ===== Abrir datepicker al click en cualquier parte =====
  const refDesde = useRef(null);
  const refHasta = useRef(null);

  const openDatePicker = useCallback((ref) => {
    const el = ref?.current;
    if (!el || el.disabled) return;

    if (typeof el.showPicker === "function") {
      el.showPicker();
    } else {
      el.focus();
      el.click();
    }
  }, []);

  // ===== MODAL ALTA =====
  const abrirModalAlta = useCallback((p) => {
    setModalAlta({ open: true, item: p, loading: false, error: "" });
  }, []);

  const cerrarModalAlta = useCallback(() => {
    setModalAlta((m) =>
      m.loading ? m : { open: false, item: null, loading: false, error: "" }
    );
  }, []);

  const confirmarAlta = useCallback(
    async ({ fecha_alta, motivo_alta }) => {
      try {
        setModalAlta((m) => ({ ...m, loading: true, error: "" }));
        const payload = {
          id_previa: modalAlta.item?.id_previa,
          fecha_alta,
          motivo_alta,
        };
        const res = await fetch(
          `${BASE_URL}/api.php?action=previa_dar_alta&ts=${Date.now()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const json = await res.json();
        if (!json?.exito) throw new Error(json?.mensaje || "No se pudo dar de alta");
        await cargarBajas();
        setModalAlta({ open: false, item: null, loading: false, error: "" });
        mostrarToast("Previa dada de alta", "exito");
      } catch (e) {
        setModalAlta((m) => ({
          ...m,
          loading: false,
          error: e?.message || "Error desconocido",
        }));
      }
    },
    [modalAlta.item, cargarBajas, mostrarToast]
  );

  // ===== MODAL ELIMINAR =====
  const abrirModalEliminar = useCallback((p) => {
    setModalEliminar({ open: true, item: p, loading: false, error: "" });
  }, []);

  const cerrarModalEliminar = useCallback(() => {
    setModalEliminar((m) =>
      m.loading ? m : { open: false, item: null, loading: false, error: "" }
    );
  }, []);

  const confirmarEliminar = useCallback(async () => {
    try {
      const id = Number(modalEliminar.item?.id_previa || 0);
      if (!id) throw new Error("ID inválido");
      setModalEliminar((m) => ({ ...m, loading: true, error: "" }));
      const res = await fetch(
        `${BASE_URL}/api.php?action=previa_eliminar&ts=${Date.now()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_previa: id }),
        }
      );
      const json = await res.json();
      if (!json?.exito) throw new Error(json?.mensaje || "No se pudo eliminar");
      await cargarBajas();
      setModalEliminar({ open: false, item: null, loading: false, error: "" });
      mostrarToast("Registro eliminado", "exito");
    } catch (e) {
      setModalEliminar((m) => ({
        ...m,
        loading: false,
        error: e?.message || "Error desconocido",
      }));
    }
  }, [modalEliminar.item, cargarBajas, mostrarToast]);

  const disabledUI = cargando || modalAlta.loading || modalEliminar.loading;

  const limpiarFechas = useCallback(() => {
    setFechaDesde(rangoFechas.min || "");
    setFechaHasta(rangoFechas.max || "");
  }, [rangoFechas.min, rangoFechas.max]);

  return (
    <div className="emp-baja-container prev-baja-container">
      {toast.mostrar && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          onClose={() => setToast({ mostrar: false, tipo: "", mensaje: "" })}
          duracion={3000}
        />
      )}

      <DarAltaPreviaModal
        open={modalAlta.open}
        item={modalAlta.item}
        loading={modalAlta.loading}
        error={modalAlta.error}
        onCancel={cerrarModalAlta}
        onConfirm={confirmarAlta}
      />

      <ModalEliminarPreviaBaja
        open={modalEliminar.open}
        item={modalEliminar.item}
        loading={modalEliminar.loading}
        error={modalEliminar.error}
        onCancel={cerrarModalEliminar}
        onConfirm={confirmarEliminar}
      />

      <MotivoCompletoModal
        open={modalMotivo.open}
        motivo={modalMotivo.motivo}
        tipo={modalMotivo.tipo}
        onClose={cerrarModalMotivo}
      />

      {/* Barra superior */}
      <div className="emp-baja-glass">
        <div className="emp-baja-barra-superior">
          <div className="emp-baja-titulo-container">
            <h2 className="emp-baja-titulo">Previas dadas de baja</h2>
          </div>
          <button
            className="emp-baja-nav-btn emp-baja-nav-btn--volver-top"
            onClick={() => navigate("/previas")}
            type="button"
          >
            <FaArrowLeft className="ico" />
            <span>Volver</span>
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="emp-baja-buscador-container">
        <input
          type="text"
          className="emp-baja-buscador"
          placeholder="Buscar por alumno, DNI o motivo..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          disabled={disabledUI}
        />
        {busqueda && (
          <button
            type="button"
            className="prev-baja-clear"
            onClick={() => setBusqueda("")}
            title="Limpiar"
            disabled={disabledUI}
          >
            <FaTimes />
          </button>
        )}
        <div className="emp-baja-buscador-icono">
          <FaSearch />
        </div>
      </div>

      {/* Controles */}
      <div className="emp-baja-controles-superiores prev-baja-controles">
        <div className="emp-baja-contador prev-baja-contador">
          Mostrando{" "}
          <strong style={{ margin: "0 6px" }}>{bajasFiltradas.length}</strong>{" "}
          previas
          <FaUsers style={{ marginLeft: 8, opacity: 0.7 }} />
        </div>

        <div className="prev-baja-fechas">
          <div
            className={`prev-baja-fechaField ${disabledUI ? "is-disabled" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => openDatePicker(refDesde)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openDatePicker(refDesde);
            }}
            title="Seleccionar fecha desde"
          >
            <span className="prev-baja-fechaLabel">Desde</span>
            <input
              ref={refDesde}
              className="prev-baja-fechaInput"
              type="date"
              value={fechaDesde}
              min={rangoFechas.min}
              max={rangoFechas.max}
              onChange={(e) => setFechaDesde(e.target.value)}
              disabled={disabledUI}
            />
          </div>

          <div
            className={`prev-baja-fechaField ${disabledUI ? "is-disabled" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => openDatePicker(refHasta)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") openDatePicker(refHasta);
            }}
            title="Seleccionar fecha hasta"
          >
            <span className="prev-baja-fechaLabel">Hasta</span>
            <input
              ref={refHasta}
              className="prev-baja-fechaInput"
              type="date"
              value={fechaHasta}
              min={rangoFechas.min}
              max={rangoFechas.max}
              onChange={(e) => setFechaHasta(e.target.value)}
              disabled={disabledUI}
            />
          </div>

          <button
            type="button"
            onClick={limpiarFechas}
            disabled={disabledUI}
            className="prev-baja-btn-limpiarFechas"
            title="Restablecer rango completo"
          >
            <FaTimes className="ico" />
            <span>Limpiar fechas</span>
          </button>
        </div>
      </div>

      {/* Tabla */}
      {cargando ? (
        <p className="emp-baja-cargando">Cargando previas dadas de baja...</p>
      ) : (
        <div className="emp-baja-tabla-container">
          <div className="emp-baja-tabla-header-container">
            <div
              className="emp-baja-tabla-header scrolbarheaders"
              style={{ gridTemplateColumns: "0.5fr 1.6fr 1.4fr 0.5fr .8fr" }}
            >
              <div className="prev-col-dni">DNI</div>
              <div className="prev-col-alumno">Alumno</div>
              <div className="prev-col-motivo">Motivo</div>
              <div className="prev-col-fecha">Fecha baja</div>
              <div className="prev-col-acciones">Acciones</div>
            </div>
          </div>

          <div className="emp-baja-tabla-body">
            {bajasFiltradas.length === 0 ? (
              <div className="emp-baja-sin-resultados emp-baja-sin-resultados--fill">
                <FaUsers className="emp-baja-sin-icono" />
                No hay registros dados de baja
              </div>
            ) : (
              bajasFiltradas.map((p) => (
                <div
                  className="emp-baja-fila"
                  key={p.id_previa}
                  style={{
                    gridTemplateColumns: "0.5fr 1.6fr 1.4fr 0.5fr .8fr",
                  }}
                >
                  <div className="prev-col-dni">{p.dni}</div>
                  <div className="prev-col-alumno">{p.alumno}</div>

                  <div
                    className={`prev-col-motivo${
                      p.tipo_baja === "aprobado"
                        ? " prev-col-motivo--aprobado"
                        : ""
                    }`}
                    title={p.motivo_display || ""}
                  >
                    <div className="prev-motivo-wrap" style={{ maxWidth: 350 }}>
                      <span
                        className="prev-motivo-text"
                        ref={(el) => {
                          if (el) motivoRefs.current[p.id_previa] = el;
                        }}
                      >
                        {p.motivo_display || "-"}
                      </span>

                      {motivosOverflow[p.id_previa] && (
                        <button
                          type="button"
                          className="prev-motivo-info"
                          title="Ver motivo completo"
                          aria-label="Ver motivo completo"
                          onClick={() =>
                            abrirModalMotivo(p.motivo_display, p.tipo_baja)
                          }
                        >
                          <FaInfoCircle />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="prev-col-fecha">
                    {p.tipo_baja === "aprobado"
                      ? fmtFechaAR(p.fecha_nota)
                      : fmtFechaAR(p.fecha_baja)}
                  </div>

                  <div className="prev-col-acciones">
                    <div className="emp-baja-iconos">
                      <button
                        className="emp-baja-icono prev-baja-btn-alta"
                        title="Dar de alta"
                        onClick={() => abrirModalAlta(p)}
                        aria-label="Dar de alta"
                        disabled={modalAlta.loading || modalEliminar.loading}
                        type="button"
                      >
                        <FaUserPlus />
                      </button>

                      <button
                        className="emp-baja-icono prev-baja-btn-trash"
                        title="Eliminar registro"
                        onClick={() => abrirModalEliminar(p)}
                        aria-label="Eliminar registro"
                        disabled={modalAlta.loading || modalEliminar.loading}
                        type="button"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviasBaja;
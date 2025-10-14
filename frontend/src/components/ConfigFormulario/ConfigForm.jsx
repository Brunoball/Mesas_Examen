// src/components/ConfigFormulario/ConfigForm.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "../Global/roots.css";
import "./ConfigForm.css";
import Toast from "../Global/Toast";

/* ================= Utils ================= */
const isoToLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

const localInputToMySQL = (local) => {
  if (!local) return null;
  return local.replace("T", " ") + ":00";
};

const fmtLargo = (iso) => {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

/* ================= Componente ================= */
const ConfigForm = () => {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Toast (slot único)
  const [toast, setToast] = useState(null);
  const pushToast = useCallback((t) => {
    setToast({
      id: crypto.randomUUID(),
      tipo: t.tipo,            // 'exito' | 'error' | 'advertencia' | 'info' | 'cargando'
      mensaje: t.mensaje,
      duracion: t.duracion ?? 3000,
    });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  // Helpers de notificación centralizados
  const notifyError = useCallback((mensaje, duracion = 4000) => {
    setError(mensaje);
    pushToast({ tipo: "error", mensaje, duracion });
  }, [pushToast]);

  const notifyWarn = useCallback((mensaje, duracion = 3000) => {
    pushToast({ tipo: "advertencia", mensaje, duracion });
  }, [pushToast]);

  const notifySuccess = useCallback((mensaje, duracion = 3000) => {
    setOkMsg(mensaje);
    pushToast({ tipo: "exito", mensaje, duracion });
  }, [pushToast]);

  // Estado del formulario (sin "activo")
  const [form, setForm] = useState({
    id_config: null,
    nombre: "",
    insc_inicio_local: "",
    insc_fin_local: "",
    mensaje_cerrado: "La inscripción está cerrada. Consultá Secretaría.",
  });

  const fetchConfig = useCallback(async (silent = true) => {
    setCargando(true);
    setError("");
    setOkMsg("");
    try {
      const resp = await fetch(`${BASE_URL}/api.php?action=form_obtener_config_inscripcion`);
      if (!resp.ok) {
        throw new Error(`Fallo HTTP ${resp.status} al obtener configuración`);
      }
      const json = await resp.json();

      if (!json.exito) {
        const msg = json.mensaje || "No se pudo obtener la configuración.";
        notifyError(msg);
        setCargando(false);
        return;
      }

      if (!json.hay_config) {
        setForm((f) => ({
          ...f,
          id_config: null,
          nombre: "Mesas Examen",
          insc_inicio_local: "",
          insc_fin_local: "",
          mensaje_cerrado: "La inscripción está cerrada. Consultá Secretaría.",
        }));
      } else {
        setForm({
          id_config: json.id_config ?? null,
          nombre: json.titulo || "Mesas Examen",
          insc_inicio_local: isoToLocalInput(json.inicio),
          insc_fin_local: isoToLocalInput(json.fin),
          mensaje_cerrado: json.mensaje_cerrado || "La inscripción está cerrada. Consultá Secretaría.",
        });
      }

      if (!silent) {
        notifySuccess("Configuración cargada.");
      }
    } catch (e) {
      notifyError(
        e instanceof Error
          ? `Error al consultar la configuración: ${e.message}`
          : "Error de red al consultar la configuración."
      );
    } finally {
      setCargando(false);
    }
  }, [BASE_URL, notifyError, notifySuccess]);

  useEffect(() => {
    fetchConfig(true);
  }, [fetchConfig]);

  // Abierta solo por fechas
  const abiertaPreview = useMemo(() => {
    if (!form.insc_inicio_local || !form.insc_fin_local) return false;
    const now = new Date();
    const ini = new Date(form.insc_inicio_local);
    const fin = new Date(form.insc_fin_local);
    return now >= ini && now <= fin;
  }, [form.insc_inicio_local, form.insc_fin_local]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Validación (devuelve string de error o null)
  const validar = () => {
    if (!form.nombre.trim()) return "Ingresá un título.";
    if (!form.insc_inicio_local) return "Seleccioná fecha/hora de inicio.";
    if (!form.insc_fin_local) return "Seleccioná fecha/hora de fin.";

    const ini = new Date(form.insc_inicio_local);
    const fin = new Date(form.insc_fin_local);
    if (isNaN(ini.getTime()) || isNaN(fin.getTime())) {
      return "Formato de fecha/hora inválido.";
    }
    if (!(ini < fin)) return "La fecha de inicio debe ser anterior a la de fin.";
    return null;
  };

  // Toast inmediato ante errores de validación al hacer blur en fechas (UX extra)
  const onBlurCampoFecha = (e) => {
    const err = validar();
    if (err) {
      notifyWarn(err, 3500);
    }
  };

  const onGuardar = async (e) => {
    e.preventDefault();
    setOkMsg("");

    const err = validar();
    if (err) {
      notifyWarn(err);
      return;
    }

    setError("");
    setGuardando(true);
    pushToast({ tipo: "cargando", mensaje: "Guardando configuración…", duracion: 2500 });

    try {
      const payload = {
        id_config: form.id_config,
        nombre: form.nombre.trim(),
        insc_inicio: localInputToMySQL(form.insc_inicio_local),
        insc_fin: localInputToMySQL(form.insc_fin_local),
        mensaje_cerrado: form.mensaje_cerrado.trim(),
        activo: 1, // compat con backend, UI siempre por fechas
      };

      const resp = await fetch(`${BASE_URL}/api.php?action=admin_guardar_config_inscripcion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error(`Fallo HTTP ${resp.status} al guardar configuración`);
      }

      let json;
      try {
        json = await resp.json();
      } catch {
        throw new Error("Respuesta del servidor inválida (no es JSON).");
      }

      if (!json.exito) {
        const msg = json.mensaje || "No se pudo guardar la configuración.";
        notifyError(msg, 4500);
        return;
      }

      notifySuccess("Configuración guardada correctamente.");
      await fetchConfig(true);
    } catch (e) {
      notifyError(
        e instanceof Error
          ? `Error al guardar la configuración: ${e.message}`
          : "Error de red al guardar la configuración."
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="config-page-bg">
      {/* ===== Toast (slot único) ===== */}
      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 9999 }}>
        {toast && (
          <Toast
            key={toast.id}
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            duracion={toast.duracion}
            onClose={clearToast}
          />
        )}
      </div>

      <div className="shell">
        <header className="topbar">
          <div className="topbar-left">
            <h1>Configurar Formulario</h1>
            <p>Definí el período de inscripción y el mensaje de cierre.</p>
          </div>
          <div className="topbar-right">
            <span className={`status-dot ${abiertaPreview ? "ok" : "off"}`} />
            <span className="status-text">
              {abiertaPreview ? "Inscripción abierta" : "Inscripción cerrada"}
            </span>
          </div>
        </header>

        <div className="content-grid">
          {/* MAIN */}
          <form className="panel" onSubmit={onGuardar} noValidate>
            {(cargando || error || okMsg) && (
              <div className="stack">
                {cargando && <div className="notice">Cargando configuración…</div>}
                {error && <div className="notice danger">{error}</div>}
                {okMsg && <div className="notice success">{okMsg}</div>}
              </div>
            )}

            <div className="form-grid">
              <label className="field col-12">
                <span className="label">Título</span>
                <input
                  type="text"
                  className="input"
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  placeholder="Mesas Examen Noviembre"
                  required
                />
              </label>

              <label className="field col-6">
                <span className="label">Inicio</span>
                <input
                  type="datetime-local"
                  className="input input-click"
                  name="insc_inicio_local"
                  value={form.insc_inicio_local}
                  onChange={handleChange}
                  onBlur={onBlurCampoFecha}
                  required
                />
              </label>

              <label className="field col-6">
                <span className="label">Fin</span>
                <input
                  type="datetime-local"
                  className="input input-click"
                  name="insc_fin_local"
                  value={form.insc_fin_local}
                  onChange={handleChange}
                  onBlur={onBlurCampoFecha}
                  required
                />
              </label>

              <label className="field col-12">
                <span className="label">Mensaje cuando está cerrado</span>
                <input
                  type="text"
                  className="input"
                  name="mensaje_cerrado"
                  value={form.mensaje_cerrado}
                  onChange={handleChange}
                />
              </label>
            </div>

            <div className="panel-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  pushToast({ tipo: "info", mensaje: "Volviendo…", duracion: 1200 });
                  navigate(-1);
                }}
              >
                Volver
              </button>
              <button type="submit" className="btn btn-primary" disabled={guardando || !!validar()}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>

          {/* ASIDE PREVIEW */}
          <aside className="aside">
            <div className="aside-card">
              <div className="aside-title">Previsualización</div>
              <ul className="meta">
                <li>
                  <b>Desde</b>
                  <span>{fmtLargo(form.insc_inicio_local)}</span>
                </li>
                <li>
                  <b>Hasta</b>
                  <span>{fmtLargo(form.insc_fin_local)}</span>
                </li>
                <li>
                  <b>Estado</b>
                  <span className={`chip ${abiertaPreview ? "chip-ok" : "chip-off"}`}>
                    {abiertaPreview ? "ABIERTA" : "CERRADA"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="aside-tip">
              <p>
                Consejo: usá rangos de fechas claros. El formulario queda abierto solo entre inicio y fin.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ConfigForm;

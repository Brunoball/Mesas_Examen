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

  // Slot único de toast
  const [toast, setToast] = useState(null);
  const pushToast = useCallback((t) => {
    setToast({
      id: crypto.randomUUID(),
      tipo: t.tipo,
      mensaje: t.mensaje,
      duracion: t.duracion ?? 3000,
    });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  const [form, setForm] = useState({
    id_config: null,
    nombre: "",
    insc_inicio_local: "",
    insc_fin_local: "",
    mensaje_cerrado: "La inscripción está cerrada. Consultá Secretaría.",
    activo: 1,
  });

  const fetchConfig = useCallback(async (silent = true) => {
    setCargando(true);
    setError("");
    setOkMsg("");
    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_obtener_config_inscripcion`
      );
      const json = await resp.json();

      if (!json.exito) {
        const msg = json.mensaje || "No se pudo obtener la configuración.";
        setError(msg);
        pushToast({ tipo: "error", mensaje: msg });
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
          activo: 1,
        }));
      } else {
        setForm({
          id_config: json.id_config ?? null,
          nombre: json.titulo || "Mesas Examen",
          insc_inicio_local: isoToLocalInput(json.inicio),
          insc_fin_local: isoToLocalInput(json.fin),
          mensaje_cerrado:
            json.mensaje_cerrado ||
            "La inscripción está cerrada. Consultá Secretaría.",
          activo: Number(json.activo ?? 1),
        });
      }

      if (!silent) {
        pushToast({ tipo: "exito", mensaje: "Configuración cargada.", duracion: 3000 });
      }
    } catch {
      setError("Error de red al consultar la configuración.");
      pushToast({ tipo: "error", mensaje: "Error de red al consultar la configuración." });
    } finally {
      setCargando(false);
    }
  }, [pushToast]);

  useEffect(() => {
    fetchConfig(true);
  }, [fetchConfig]);

  const abiertaPreview = useMemo(() => {
    if (!form.insc_inicio_local || !form.insc_fin_local) return false;
    const now = new Date();
    const ini = new Date(form.insc_inicio_local);
    const fin = new Date(form.insc_fin_local);
    return now >= ini && now <= fin && Number(form.activo) === 1;
  }, [form.insc_inicio_local, form.insc_fin_local, form.activo]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? (checked ? 1 : 0) : value,
    }));
    if (name === "activo") {
      pushToast({
        tipo: "advertencia",
        mensaje: checked ? "Esta configuración quedará ACTIVA." : "Configuración marcada como INACTIVA.",
        duracion: 2500,
      });
    }
  };

  const validar = () => {
    if (!form.nombre.trim()) return "Ingresá un título.";
    if (!form.insc_inicio_local) return "Seleccioná fecha/hora de inicio.";
    if (!form.insc_fin_local) return "Seleccioná fecha/hora de fin.";
    const ini = new Date(form.insc_inicio_local);
    const fin = new Date(form.insc_fin_local);
    if (!(ini < fin)) return "La fecha de inicio debe ser anterior a la de fin.";
    return null;
  };

  const onGuardar = async (e) => {
    e.preventDefault();
    setOkMsg("");

    const err = validar();
    if (err) {
      setError(err);
      pushToast({ tipo: "advertencia", mensaje: err });
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
        activo: Number(form.activo) || 0,
      };

      const resp = await fetch(
        `${BASE_URL}/api.php?action=admin_guardar_config_inscripcion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await resp.json();

      if (!json.exito) {
        const msg = json.mensaje || "No se pudo guardar la configuración.";
        setError(msg);
        pushToast({ tipo: "error", mensaje: msg, duracion: 3500 });
        return;
      }

      setOkMsg("Configuración guardada correctamente.");
      pushToast({ tipo: "exito", mensaje: "Actualizado correctamente", duracion: 3000 });
      await fetchConfig(true);
    } catch {
      setError("Error de red al guardar la configuración.");
      pushToast({ tipo: "error", mensaje: "Error de red al guardar la configuración." });
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
            <p>Definí el período de inscripción, el mensaje de cierre y el estado.</p>
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

              <label className="switch field col-12">
                <input
                  type="checkbox"
                  name="activo"
                  checked={!!Number(form.activo)}
                  onChange={handleChange}
                />
                <span className="switch-track">
                  <span className="switch-thumb" />
                </span>
                <span className="switch-text">Config activa</span>
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
                <li><b>Desde</b><span>{fmtLargo(form.insc_inicio_local)}</span></li>
                <li><b>Hasta</b><span>{fmtLargo(form.insc_fin_local)}</span></li>
                <li>
                  <b>Estado</b>
                  <span className={`chip ${abiertaPreview ? "chip-ok" : "chip-off"}`}>
                    {abiertaPreview ? "ABIERTA" : "CERRADA"}
                  </span>
                </li>
              </ul>
            </div>

            <div className="aside-tip">
              <p>Consejo: usá rangos cortos y mantené la “config activa” solo cuando el formulario esté listo.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ConfigForm;

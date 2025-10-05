// src/components/ConfigFormulario/ConfigForm.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "../Global/roots.css";
import "./ConfigForm.css";
import Toast from "../Global/Toast"; // ✅ Notificaciones

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
  // "YYYY-MM-DDTHH:MM" -> "YYYY-MM-DD HH:MM:00"
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

  // ✅ Slot único de toast (si llega uno nuevo, reemplaza)
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

  // 🔇 silent=true => no mostrar toast de éxito al cargar
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
    fetchConfig(true); // 🔇 primer load sin toast
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
    // 👉 mostramos solo "guardando…" y luego lo reemplazamos por éxito/ error
    pushToast({ tipo: "cargando", mensaje: "Guardando configuración…", duracion: 2500 });

    try {
      const payload = {
        id_config: form.id_config, // null/0 => inserta (historial)
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
      // ✅ reemplaza el toast anterior
      pushToast({ tipo: "exito", mensaje: "Actualizado correctamente", duracion: 3000 });

      // 🔇 recargar sin toasts extra
      await fetchConfig(true);
    } catch {
      setError("Error de red al guardar la configuración.");
      pushToast({ tipo: "error", mensaje: "Error de red al guardar la configuración." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="page-wrap">
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

      <form className="card" onSubmit={onGuardar} noValidate>
        <div className="card-header">
          <h1 className="page-title">Configurar formulario</h1>
          <p className="page-subtitle">
            Definí el período de inscripción, mensaje de cierre y estado.
          </p>
        </div>

        <div className="card-body">
          {cargando && (
            <div className="alert" role="status">Cargando configuración…</div>
          )}

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          {okMsg && (
            <div className="alert alert-success" role="alert">
              {okMsg}
            </div>
          )}

          <div className="form-grid">
            {/* === MISMA FILA: Título / Inicio / Fin === */}
            <label className="form-field col-4">
              <span className="form-label">Título</span>
              <input
                type="text"
                className="form-input"
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                placeholder="Mesas Examen Noviembre"
                required
              />
            </label>

            <label className="form-field col-4">
              <span className="form-label">Inicio</span>
              <input
                type="datetime-local"
                className="form-input clickable"
                name="insc_inicio_local"
                value={form.insc_inicio_local}
                onChange={handleChange}
                required
              />
            </label>

            <label className="form-field col-4">
              <span className="form-label">Fin</span>
              <input
                type="datetime-local"
                className="form-input clickable"
                name="insc_fin_local"
                value={form.insc_fin_local}
                onChange={handleChange}
                required
              />
            </label>

            <label className="form-field form-field--full">
              <span className="form-label">Mensaje cuando está cerrado</span>
              <input
                type="text"
                className="form-input"
                name="mensaje_cerrado"
                value={form.mensaje_cerrado}
                onChange={handleChange}
              />
            </label>

            <label className="form-field form-switch">
              <input
                type="checkbox"
                name="activo"
                checked={!!Number(form.activo)}
                onChange={handleChange}
              />
              <span>Config activa</span>
            </label>
          </div>

          <div className="preview-box">
            <p><strong>Previsualización:</strong></p>
            <ul>
              <li><strong>Desde: </strong>{fmtLargo(form.insc_inicio_local)}</li>
              <li><strong>Hasta: </strong>{fmtLargo(form.insc_fin_local)}</li>
              <li><strong>Estado (según ahora): </strong>{abiertaPreview ? "ABIERTA" : "CERRADA"}</li>
            </ul>
          </div>
        </div>

        <div className="card-footer">
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
    </div>
  );
};

export default ConfigForm;

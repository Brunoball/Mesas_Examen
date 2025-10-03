// src/components/Formulario/Formulario.jsx
import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import "./Formulario.css";
import Toast from "../global/Toast";
import escudo from "../../imagenes/Escudo.png";
import BASE_URL from "../../config/config";

/* ======== Claves de localStorage ======== */
const LS = {
  REMEMBER: "form_previas_recordarme",
  GMAIL: "form_previas_gmail",
  DNI: "form_previas_dni",
};

/* ======== Util: fecha/hora linda en ES ======== */
const fmtFechaHoraES = (iso) => {
  try {
    if (!iso) return "-";
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso || "-";
  }
};

/* =========================================================
   Hook ventana de inscripción con REFRESCO EN TIEMPO REAL
   ========================================================= */
const useVentanaInscripcion = (pollMs = 10000) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const prevAbiertaRef = useRef(null);

  const fetchVentana = useCallback(async () => {
    try {
      setError("");
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_obtener_config_inscripcion&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = await resp.json();
      if (!json.exito) {
        setError(json.mensaje || "No se pudo obtener la configuración.");
        setData((old) => (old ? { ...old, abierta: false } : null));
      } else {
        setData(json);
      }
    } catch (e) {
      setError("Error de red al consultar la configuración.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { fetchVentana(); }, [fetchVentana]);
  useEffect(() => {
    const id = setInterval(fetchVentana, pollMs);
    return () => clearInterval(id);
  }, [fetchVentana, pollMs]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") fetchVentana(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchVentana]);

  useEffect(() => {
    if (data?.abierta !== undefined && prevAbiertaRef.current !== null) {
      if (prevAbiertaRef.current !== data.abierta) {
        const ev = new CustomEvent("ventana:cambio", {
          detail: { abierta: data.abierta, data },
        });
        window.dispatchEvent(ev);
      }
    }
    if (data?.abierta !== undefined) prevAbiertaRef.current = data.abierta;
  }, [data]);

  return { cargando, error, data, refetch: fetchVentana };
};

/* ================== Pantalla fuera de término ================== */
const InscripcionCerrada = ({ cfg }) => {
  const titulo = cfg?.titulo || "Mesas de Examen";
  const msg = cfg?.mensaje_cerrado || "Inscripción cerrada / fuera de término.";
  return (
    <div className="auth-page">
      <div className="auth-card">
        <aside className="auth-hero is-login">
          <div className="hero-inner">
            <div className="her-container">
              <h1 className="hero-title">{titulo}</h1>
              <p className="hero-sub">Inscripción en línea</p>
            </div>
            <img src={escudo} alt="Escudo IPET 50" className="hero-logo hero-logo--big" />
          </div>
        </aside>

        <section className="auth-body">
          <header className="auth-header">
            <h2 className="auth-title">Inscripción no disponible</h2>
            <p className="auth-sub">{msg}</p>
          </header>

          {cfg?.inicio && cfg?.fin && (
            <div className="closed-box">
              <p><strong>Ventana de inscripción:</strong></p>
              <ul className="closed-list">
                <li><strong>Desde:</strong> {fmtFechaHoraES(cfg.inicio)}</li>
                <li><strong>Hasta:</strong> {fmtFechaHoraES(cfg.fin)}</li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* ============== Subvista: Resumen Alumno ============== */
const ResumenAlumno = ({ data, onVolver, onConfirmar, ventana, onVentanaCerro }) => {
  const [seleccion, setSeleccion] = useState(
    () => new Set(
      data.alumno.materias
        .filter((m) => !Number(m.inscripcion))
        .map((m) => m.id_materia)
    )
  );

  useEffect(() => {
    const handler = (e) => { if (e?.detail?.abierta === false) onVentanaCerro?.(); };
    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [onVentanaCerro]);

  const toggle = (id, disabled) => {
    if (disabled) return;
    setSeleccion((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const materiasOrdenadas = useMemo(
    () => [...data.alumno.materias].sort((a, b) =>
      a.materia.localeCompare(b.materia, "es", { sensitivity: "base" })
    ),
    [data.alumno.materias]
  );

  // 👉 Enviamos IDs y también NOMBRES de materias + gmail + nombre del alumno
  const handleConfirm = () => {
    const elegidas = materiasOrdenadas.filter(
      (m) => !Number(m.inscripcion) && seleccion.has(m.id_materia)
    );
    onConfirmar({
      dni: data.alumno.dni,
      gmail: data.gmail ?? "",
      nombre_alumno: data.alumno?.nombre ?? "",
      materias: elegidas.map((m) => m.id_materia),                 // IDs (para tu API)
      materias_nombres: elegidas.map((m) => m.materia || ""),      // NOMBRES (para email)
    });
  };

  const a = data.alumno;
  const abierta = !!ventana?.abierta;

  return (
    <div className="auth-card">
      <aside className="auth-hero">
        <div className="hero-inner">
          <div className="hero-top">
            <img src={escudo} alt="Escudo IPET 50" className="hero-logo" />
            <h1 className="hero-title">¡Bienvenido!</h1>
            <p className="hero-sub">Revisá tus datos de inscripción.</p>
          </div>

          <div className="hero-form" aria-label="Datos del alumno (solo lectura)">
            <label className="hf-field">
              <span className="hf-label">Nombre y Apellido</span>
              <input className="hf-input" value={a?.nombre ?? ""} readOnly />
            </label>

            <label className="hf-field">
              <span className="hf-label">DNI</span>
              <input className="hf-input" value={a?.dni ?? ""} readOnly />
            </label>

            <div className="hf-row-3">
              <label className="hf-field">
                <span className="hf-label ">Año actual</span>
                <input className="hf-input ACD-field" value={a?.anio_actual ?? ""} readOnly />
              </label>
              <label className="hf-field">
                <span className="hf-label">Curso</span>
                <input className="hf-input ACD-field" value={a?.cursando?.curso ?? ""} readOnly />
              </label>
              <label className="hf-field">
                <span className="hf-label">División</span>
                <input className="hf-input ACD-field" value={a?.cursando?.division ?? ""} readOnly />
              </label>
            </div>

            <label className="hf-field">
              <span className="hf-label">Gmail</span>
              <input className="hf-input" value={data?.gmail ?? ""} readOnly />
            </label>

            <div className="hf-hint">Estos datos no se pueden modificar aquí.</div>
          </div>

          <div className="hero-actions">
            <button type="button" className="btn-hero-secondary" onClick={onVolver}>
              Volver
            </button>
          </div>
        </div>
      </aside>

      <section className="auth-body">
        <header className="auth-header">
          <h2 className="auth-title">Materias pendientes de rendir</h2>
          <p className="auth-sub">Estas son tus materias previas (adeudadas).</p>
          {ventana && (
            <div className={`ventana-pill ${abierta ? "is-open" : "is-closed"}`}>
              {abierta ? (
                <>Inscripción abierta hasta <strong>{fmtFechaHoraES(ventana.fin)}</strong>.</>
              ) : (
                <>Inscripción cerrada (desde {fmtFechaHoraES(ventana.inicio)} hasta {fmtFechaHoraES(ventana.fin)}).</>
              )}
            </div>
          )}
        </header>

        <div className={`materias-grid ${abierta ? "" : "is-disabled"}`}>
          {materiasOrdenadas.map((m) => {
            const yaIncripto = !!Number(m.inscripcion);
            const checked = seleccion.has(m.id_materia);
            const disabled = yaIncripto || !abierta;
            return (
              <label
                key={m.id_materia}
                className={`materia-card ${yaIncripto ? "inscripto" : checked ? "selected" : ""} ${!abierta ? "disabled" : ""}`}
                title={
                  yaIncripto
                    ? "Ya estás inscripto en esta materia"
                    : !abierta
                    ? "La inscripción está cerrada"
                    : ""
                }
              >
                <input
                  type="checkbox"
                  checked={yaIncripto ? false : checked}
                  disabled={disabled}
                  onChange={() => !disabled && toggle(m.id_materia, false)}
                />
                <span className="nombre">
                  {m.materia}
                  {yaIncripto && <span className="badge-inscripto">INSCRIPTO</span>}
                </span>
                <small className="sub">{`(Curso ${m.curso} • Div. ${m.division})`}</small>
              </label>
            );
          })}
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={!abierta}
            title={!abierta ? "La inscripción está cerrada" : ""}
          >
            Confirmar inscripción
          </button>
        </div>
      </section>
    </div>
  );
};

/* ============== Formulario principal (login) ============== */
const Formulario = () => {
  const {
    cargando: cargandoVentana,
    error: errorVentana,
    data: ventana,
    refetch: refetchVentana,
  } = useVentanaInscripcion(10000);

  const [gmail, setGmail] = useState("");
  const [dni, setDni] = useState("");
  const [remember, setRemember] = useState(false);
  const [toast, setToast] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [dataAlumno, setDataAlumno] = useState(null);

  const mostrarToast = useCallback((tipo, mensaje, duracion = 3800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) {
        mostrarToast("advertencia", ventana?.mensaje_cerrado || "La inscripción se cerró.");
      } else if (e?.detail?.abierta === true) {
        mostrarToast("exito", "La inscripción se abrió.");
      }
    };
    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [mostrarToast, ventana?.mensaje_cerrado]);

  const isValidGmail = useCallback(
    (v) => /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(v.trim()),
    []
  );
  const isValidDni = useCallback((v) => /^[0-9]{7,9}$/.test(v), []);

  useEffect(() => {
    try {
      const savedRemember = localStorage.getItem(LS.REMEMBER) === "1";
      if (savedRemember) {
        const savedGmail = localStorage.getItem(LS.GMAIL) || "";
        const savedDni = localStorage.getItem(LS.DNI) || "";
        setRemember(true);
        if (savedGmail) setGmail(savedGmail);
        if (savedDni) setDni(savedDni);
      }
    } catch {}
  }, []);

  useEffect(() => { if (remember) try { localStorage.setItem(LS.GMAIL, gmail || ""); } catch {} }, [gmail, remember]);
  useEffect(() => { if (remember) try { localStorage.setItem(LS.DNI, dni || ""); } catch {} }, [dni, remember]);

  const onToggleRemember = (e) => {
    const checked = e.target.checked;
    setRemember(checked);
    try {
      if (checked) {
        localStorage.setItem(LS.REMEMBER, "1");
        localStorage.setItem(LS.GMAIL, gmail || "");
        localStorage.setItem(LS.DNI, dni || "");
      } else {
        localStorage.removeItem(LS.REMEMBER);
        localStorage.removeItem(LS.GMAIL);
        localStorage.removeItem(LS.DNI);
      }
    } catch {}
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    await refetchVentana();

    if (ventana && !ventana.abierta) {
      mostrarToast("advertencia", ventana.mensaje_cerrado || "Inscripción cerrada.");
      return;
    }
    if (!isValidGmail(gmail)) {
      mostrarToast("error", "Ingresá un Gmail válido (@gmail.com).");
      return;
    }
    if (!isValidDni(dni)) {
      mostrarToast("error", "Ingresá un DNI válido (7 a 9 dígitos).");
      return;
    }

    try {
      setCargando(true);
      const resp = await fetch(`${BASE_URL}/api.php?action=form_buscar_previas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail: gmail.trim(), dni }),
      });
      const json = await resp.json();

      if (!json.exito) {
        mostrarToast("advertencia", json.mensaje || "No se encontraron previas para el DNI.");
        return;
      }
      if (json.ya_inscripto) {
        mostrarToast(
          "advertencia",
          `Este alumno ya fue inscripto en las mesas de examen ${json.anio_inscripcion}.`
        );
        return;
      }
      setDataAlumno({ ...json, gmail: gmail.trim() });
    } catch (err) {
      mostrarToast("error", "Error consultando el servidor.");
    } finally {
      setCargando(false);
    }
  };

  // ⬇️ Aquí añadimos el envío de email luego del registro OK
  const confirmarInscripcion = async ({ dni, materias, materias_nombres, gmail, nombre_alumno }) => {
    if (!materias?.length) {
      mostrarToast("advertencia", "Seleccioná al menos una materia (no inscripta).");
      return;
    }

    await refetchVentana();
    if (ventana && !ventana.abierta) {
      mostrarToast("advertencia", ventana.mensaje_cerrado || "Inscripción cerrada.");
      return;
    }

    try {
      // 1) Registrar inscripción (igual que antes)
      const resp = await fetch(`${BASE_URL}/api.php?action=form_registrar_inscripcion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dni, materias }), // IDs al backend
      });
      const json = await resp.json();

      if (!json.exito) {
        mostrarToast("error", json?.mensaje || `No se pudo registrar la inscripción.`);
        return;
      }

      mostrarToast("exito", `Inscripción registrada (${json.insertados} materia/s).`);

      // 2) Enviar correo (no bloqueante para UX)
      try {
        await fetch(`https://inscripcion.ipet50.edu.ar/mails/confirm_inscripcion.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toEmail: gmail,
            nombre: nombre_alumno || "",
            dni,
            materias: materias_nombres || [],
          }),
        });
      } catch (e) {
        console.warn("Error enviando correo de confirmación", e);
      }

      // 3) Reset
      setDataAlumno(null);
      if (!remember) {
        setDni("");
        setGmail("");
      }
    } catch {
      mostrarToast("error", "Error de red al registrar la inscripción.");
    }
  };


  /* ==== Estados de carga/error/closed ==== */
  if (cargandoVentana) {
    return (
      <div className="auth-page">
        <div className="loading-center">
          <div className="spinner" aria-label="Cargando configuración..." />
          <p>Cargando…</p>
        </div>
      </div>
    );
  }

  if (errorVentana) {
    return (
      <InscripcionCerrada cfg={{ mensaje_cerrado: "Inscripción no disponible por el momento." }} />
    );
  }

  if (ventana && !ventana.abierta) {
    return <InscripcionCerrada cfg={ventana} />;
  }

  /* ==== Ventana abierta: render normal ==== */
  return (
    <div className="auth-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      {dataAlumno ? (
        <ResumenAlumno
          data={dataAlumno}
          onVolver={() => setDataAlumno(null)}
          onConfirmar={confirmarInscripcion}
          ventana={ventana}
          onVentanaCerro={() => {
            setDataAlumno(null);
          }}
        />
      ) : (
        <div className="auth-card">
          <aside className="auth-hero is-login">
            <div className="hero-inner">
              <div className="her-container">
                <h1 className="hero-title">{ventana?.titulo || "Mesas de Examen · IPET 50"}</h1>
                <p className="hero-sub">
                  Ingresá tu Gmail y DNI para consultar e inscribirte.
                </p>
              </div>
              <img src={escudo} alt="Escudo IPET 50" className="hero-logo hero-logo--big" />
            </div>
          </aside>

          <section className="auth-body">
            <header className="auth-header">
              <h2 className="auth-title">Iniciar sesión</h2>
              <p className="auth-sub">
                Inscripción abierta hasta <strong>{fmtFechaHoraES(ventana?.fin)}</strong>.
              </p>
            </header>

            <form className="auth-form" onSubmit={onSubmit} noValidate>
              <label className="field">
                <span className="field-label">Gmail</span>
                <input
                  className="field-input"
                  id="gmail"
                  type="email"
                  inputMode="email"
                  placeholder="tuusuario@gmail.com"
                  value={gmail}
                  onChange={(e) => setGmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>

              <label className="field">
                <span className="field-label">DNI</span>
                <input
                  className="field-input"
                  id="dni"
                  type="text"
                  inputMode="numeric"
                  placeholder="Solo números"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D+/g, ""))}
                  required
                  autoComplete="off"
                />
              </label>

              <div className="form-extra">
                <label className="remember">
                  <input type="checkbox" checked={remember} onChange={onToggleRemember} />{" "}
                  <span>Recordarme</span>
                </label>
              </div>

              <button type="submit" className="btn-cta" disabled={cargando}>
                {cargando ? "Buscando..." : "Continuar"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default Formulario;

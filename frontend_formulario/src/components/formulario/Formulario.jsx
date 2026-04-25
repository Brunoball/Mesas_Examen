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

  useEffect(() => {
    fetchVentana();
  }, [fetchVentana]);

  useEffect(() => {
    const id = setInterval(fetchVentana, pollMs);
    return () => clearInterval(id);
  }, [fetchVentana, pollMs]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") fetchVentana();
    };

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

    if (data?.abierta !== undefined) {
      prevAbiertaRef.current = data.abierta;
    }
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

            <img
              src={escudo}
              alt="Escudo IPET 50"
              className="hero-logo hero-logo--big"
            />
          </div>
        </aside>

        <section className="auth-body">
          <header className="auth-header">
            <h2 className="auth-title">Inscripción no disponible</h2>
            <p className="auth-sub">{msg}</p>
          </header>

          {cfg?.inicio && cfg?.fin && (
            <div className="closed-box">
              <p>
                <strong>Ventana de inscripción:</strong>
              </p>
              <ul className="closed-list">
                <li>
                  <strong>Desde:</strong> {fmtFechaHoraES(cfg.inicio)}
                </li>
                <li>
                  <strong>Hasta:</strong> {fmtFechaHoraES(cfg.fin)}
                </li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* ============== Subvista: Resumen Alumno ============== */
const ResumenAlumno = ({
  data,
  onVolver,
  onConfirmar,
  ventana,
  onVentanaCerro,
}) => {
  // Materias inscribibles (cond=3)
  const materiasCond3 = data?.alumno?.materias ?? [];

  // Materias "Tercera materia" (cond=5) — solo visualización
  const materiasCond5 = data?.alumno?.materias_cond5 ?? [];

  // Materias "pendientes" (cond=6) — solo visualización
  const materiasCond6 = data?.alumno?.materias_cond6 ?? [];

  // Grupos correlativos detectados en el backend
  const correlativas = data?.alumno?.correlativas ?? [];

  // Todas empiezan deseleccionadas
  const [seleccion, setSeleccion] = useState(() => new Set());

  useEffect(() => {
    setSeleccion(new Set());
  }, [materiasCond3.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) {
        onVentanaCerro?.();
      }
    };

    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [onVentanaCerro]);

  // Generar clave única para cada materia
  const generarClaveUnica = (materia) => {
    if (materia?.clave_unica) return materia.clave_unica;
    return `${materia.id_materia}_${materia.curso_id}_${materia.division_id}`;
  };

  const mapaMateriasPorClave = useMemo(() => {
    const map = new Map();

    materiasCond3.forEach((m) => {
      map.set(generarClaveUnica(m), m);
    });

    return map;
  }, [materiasCond3]);

  /* =========================================================
     ORDEN CORRECTO:
     Primero menor año/curso arriba.
     Ejemplo:
     MATEMÁTICA 5° arriba
     ANÁLISIS MATEMÁTICO 6° abajo
     ========================================================= */
  const obtenerNumeroCurso = (materia) => {
    const directo = Number(materia?.curso_id);

    if (!Number.isNaN(directo) && directo > 0) {
      return directo;
    }

    const desdeTexto = String(materia?.curso || "").match(/\d+/);
    return desdeTexto ? Number(desdeTexto[0]) : 999;
  };

  const obtenerNumeroDivision = (materia) => {
    const directo = Number(materia?.division_id);

    if (!Number.isNaN(directo) && directo > 0) {
      return directo;
    }

    return 999;
  };

  const ordenarMateriasPorAnio = (lista) => {
    return [...lista].sort((a, b) => {
      const cursoA = obtenerNumeroCurso(a);
      const cursoB = obtenerNumeroCurso(b);

      if (cursoA !== cursoB) {
        return cursoA - cursoB;
      }

      const divisionA = obtenerNumeroDivision(a);
      const divisionB = obtenerNumeroDivision(b);

      if (divisionA !== divisionB) {
        return divisionA - divisionB;
      }

      return String(a.materia || "").localeCompare(
        String(b.materia || ""),
        "es",
        {
          sensitivity: "base",
        }
      );
    });
  };

  const materiasOrdenadas = useMemo(
    () => ordenarMateriasPorAnio(materiasCond3),
    [materiasCond3]
  );

  const materias5Ordenadas = useMemo(
    () => ordenarMateriasPorAnio(materiasCond5),
    [materiasCond5]
  );

  const materias6Ordenadas = useMemo(
    () => ordenarMateriasPorAnio(materiasCond6),
    [materiasCond6]
  );

  /*
    NUEVO:
    El cartel amarillo solo aparece si hay correlativas
    y al menos una de esas materias NO está inscripta.
    Si todas ya están INSCRIPTO, se oculta.
  */
  const mostrarAvisoCorrelativas = useMemo(() => {
    if (!Array.isArray(correlativas) || correlativas.length === 0) {
      return false;
    }

    return correlativas.some((grupo) => {
      const materiasGrupo = Array.isArray(grupo?.materias)
        ? grupo.materias
        : [];

      return materiasGrupo.some((m) => !Number(m?.inscripcion));
    });
  }, [correlativas]);

  const materiaEstaDisponiblePorCorrelativa = useCallback(
    (materia, seleccionActual = seleccion) => {
      const anteriores = Array.isArray(materia?.correlativas_anteriores)
        ? materia.correlativas_anteriores
        : [];

      if (anteriores.length === 0) {
        return true;
      }

      // La posterior solo se habilita si todas las anteriores están seleccionadas
      // o ya estaban inscriptas.
      return anteriores.every((claveAnterior) => {
        const anterior = mapaMateriasPorClave.get(claveAnterior);

        if (!anterior) return false;

        const anteriorYaInscripta = !!Number(anterior.inscripcion);
        const anteriorSeleccionada = seleccionActual.has(claveAnterior);

        return anteriorYaInscripta || anteriorSeleccionada;
      });
    },
    [seleccion, mapaMateriasPorClave]
  );

  const obtenerMensajeBloqueoCorrelativa = (materia) => {
    const anteriores = Array.isArray(materia?.correlativas_anteriores)
      ? materia.correlativas_anteriores
      : [];

    if (anteriores.length === 0) return "";

    const nombresPendientes = anteriores
      .map((clave) => mapaMateriasPorClave.get(clave))
      .filter(
        (m) =>
          m &&
          !Number(m.inscripcion) &&
          !seleccion.has(generarClaveUnica(m))
      )
      .map((m) => m.materia);

    if (nombresPendientes.length === 0) return "";

    return `Primero seleccioná: ${nombresPendientes.join(", ")}`;
  };

  const quitarPosterioresDependientes = useCallback(
    (claveQuitada, seleccionBase) => {
      const next = new Set(seleccionBase);

      let huboCambios = true;

      while (huboCambios) {
        huboCambios = false;

        materiasCond3.forEach((m) => {
          const claveM = generarClaveUnica(m);

          if (!next.has(claveM)) return;

          const disponible = materiaEstaDisponiblePorCorrelativa(m, next);

          if (!disponible) {
            next.delete(claveM);
            huboCambios = true;
          }
        });
      }

      next.delete(claveQuitada);

      return next;
    },
    [materiasCond3, materiaEstaDisponiblePorCorrelativa]
  );

  const toggle = (materia, disabled) => {
    if (disabled) return;

    const claveUnica = generarClaveUnica(materia);

    setSeleccion((prev) => {
      const next = new Set(prev);

      if (next.has(claveUnica)) {
        next.delete(claveUnica);

        // Si saco la anterior, saco automáticamente las posteriores
        // que dependían de esa selección.
        return quitarPosterioresDependientes(claveUnica, next);
      }

      // Si intenta seleccionar una posterior sin la anterior, no dejamos.
      if (!materiaEstaDisponiblePorCorrelativa(materia, next)) {
        return next;
      }

      next.add(claveUnica);
      return next;
    });
  };

  const handleConfirm = () => {
    const elegidas = materiasOrdenadas.filter((m) => {
      const claveUnica = generarClaveUnica(m);
      return !Number(m.inscripcion) && seleccion.has(claveUnica);
    });

    // Seguridad extra en frontend:
    // si por cualquier motivo quedó seleccionada una posterior sin anterior, bloqueamos.
    const invalida = elegidas.find((m) => {
      const anteriores = Array.isArray(m?.correlativas_anteriores)
        ? m.correlativas_anteriores
        : [];

      if (anteriores.length === 0) return false;

      return !anteriores.every((claveAnterior) => {
        const anterior = mapaMateriasPorClave.get(claveAnterior);

        if (!anterior) return false;

        return !!Number(anterior.inscripcion) || seleccion.has(claveAnterior);
      });
    });

    if (invalida) {
      alert(
        `No podés inscribirte solo en "${invalida.materia}". Primero tenés que seleccionar la correlativa anterior.`
      );
      return;
    }

    onConfirmar({
      dni: data.alumno.dni,
      gmail: data.gmail ?? "",
      nombre_alumno: data.alumno?.nombre ?? "",
      materias: elegidas.map((m) => ({
        id_materia: m.id_materia,
        curso_id: m.curso_id,
        division_id: m.division_id,
      })),
      materias_nombres: elegidas.map((m) => m.materia || ""),
    });
  };

  const a = data.alumno;
  const abierta = !!ventana?.abierta;

  const handleKeyToggle = (e, materia, disabled) => {
    if (disabled) return;

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(materia, false);
    }
  };

  return (
    <div className="auth-card">
      {/* Caja izquierda */}
      <aside className="auth-hero">
        <div className="hero-scroll">
          <div className="hero-inner">
            <div className="hero-top">
              <img src={escudo} alt="Escudo IPET 50" className="hero-logo" />
              <h1 className="hero-title">¡Bienvenido!</h1>
              <p className="hero-sub">Revisá tus datos de inscripción.</p>
            </div>

            <div
              className="hero-form"
              aria-label="Datos del alumno (solo lectura)"
            >
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
                  <span className="hf-label">Año actual</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.anio_actual ?? ""}
                    readOnly
                  />
                </label>

                <label className="hf-field">
                  <span className="hf-label">Curso</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.cursando?.curso ?? ""}
                    readOnly
                  />
                </label>

                <label className="hf-field">
                  <span className="hf-label">División</span>
                  <input
                    className="hf-input ACD-field"
                    value={a?.cursando?.division ?? ""}
                    readOnly
                  />
                </label>
              </div>

              <label className="hf-field">
                <span className="hf-label">Gmail</span>
                <input
                  className="hf-input"
                  value={data?.gmail ?? ""}
                  readOnly
                />
              </label>

              <div className="hf-hint">
                Estos datos no se pueden modificar aquí.
              </div>
            </div>

            <div className="actions-left only-desktop">
              <button
                type="button"
                className="btn-hero-secondary"
                onClick={onVolver}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Caja derecha */}
      <section className="auth-body">
        <header className="auth-header">
          <h2 className="auth-title">Materias pendientes de rendir</h2>
          <p className="auth-sub">
            Estas son tus materias previas (adeudadas).
          </p>

          {ventana && (
            <div
              className={`ventana-pill ${abierta ? "is-open" : "is-closed"}`}
            >
              {abierta ? (
                <>
                  Inscripción abierta hasta{" "}
                  <strong className="fecha-cierre">
                    {fmtFechaHoraES(ventana.fin)}
                  </strong>
                  .
                </>
              ) : (
                <>
                  Inscripción cerrada (desde {fmtFechaHoraES(ventana.inicio)}{" "}
                  hasta {fmtFechaHoraES(ventana.fin)}).
                </>
              )}
            </div>
          )}

          {mostrarAvisoCorrelativas && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px",
                borderRadius: "8px",
                background: "#fef3c7",
                color: "#92400e",
                fontSize: "14px",
                fontWeight: "500",
                border: "1px solid #facc15",
              }}
            >
              Materias correlativas: primero seleccioná la anterior para poder
              inscribirte a la posterior.
            </div>
          )}
        </header>

        {/* Grid cond=3 */}
        <div className="materias-scroll">
          <div className="materias-grid">
            {materiasOrdenadas.map((m) => {
              const claveUnica = generarClaveUnica(m);
              const yaInscripto = !!Number(m.inscripcion);
              const selected = seleccion.has(claveUnica);

              const bloqueadaPorCorrelativa =
                !yaInscripto && !materiaEstaDisponiblePorCorrelativa(m);

              const disabled =
                yaInscripto || !abierta || bloqueadaPorCorrelativa;

              const classes = [
                "materia-card",
                yaInscripto ? "inscripto" : selected ? "selected" : "",
                !abierta || bloqueadaPorCorrelativa ? "disabled" : "",
                m.es_correlativa ? "es-correlativa" : "",
                "clickable",
              ]
                .join(" ")
                .trim();

              const mensajeBloqueo = obtenerMensajeBloqueoCorrelativa(m);

              const title = yaInscripto
                ? "Ya estás inscripto en esta materia"
                : !abierta
                ? "La inscripción está cerrada"
                : bloqueadaPorCorrelativa
                ? mensajeBloqueo ||
                  "Primero seleccioná la correlativa anterior"
                : "Click para seleccionar/deseleccionar";

              return (
                <div
                  key={claveUnica}
                  className={classes}
                  title={title}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-pressed={selected}
                  onClick={() => !disabled && toggle(m, false)}
                  onKeyDown={(e) => handleKeyToggle(e, m, disabled)}
                  style={
                    bloqueadaPorCorrelativa
                      ? {
                          opacity: 0.55,
                          cursor: "not-allowed",
                        }
                      : undefined
                  }
                >
                  <span className="nombre">
                    {m.materia}

                    {yaInscripto && (
                      <span className="badge-inscripto">INSCRIPTO</span>
                    )}

                    {m.es_correlativa && !yaInscripto && (
                      <span
                        style={{
                          display: "inline-block",
                          marginLeft: "8px",
                          padding: "2px 7px",
                          borderRadius: "999px",
                          background: "#fef3c7",
                          color: "#92400e",
                          fontSize: "11px",
                          fontWeight: "700",
                        }}
                      >
                        CORRELATIVA
                      </span>
                    )}
                  </span>

                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>

                  {bloqueadaPorCorrelativa && (
                    <small
                      style={{
                        display: "block",
                        marginTop: "6px",
                        color: "#92400e",
                        fontWeight: "600",
                      }}
                    >
                      {mensajeBloqueo || "Primero seleccioná la anterior"}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Materias pendientes cond=6 */}
        {materias6Ordenadas.length > 0 && (
          <div className="materias-pendientes-section">
            <h3 className="auth-title">Materias pendientes</h3>
            <p className="auth-sub">
              Solo visualización (no se puede inscribir en estas).
            </p>

            <div className="materias-grid">
              {materias6Ordenadas.map((m) => (
                <div
                  key={`c6-${generarClaveUnica(m)}`}
                  className="materia-card disabled only-visual"
                  title="Materia pendiente (no inscribible en esta instancia)"
                >
                  <span className="nombre">{m.materia}</span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tercera materia cond=5 */}
        {materias5Ordenadas.length > 0 && (
          <div className="tercera-materia-section">
            <h3 className="auth-title">Tercera materia</h3>
            <p className="auth-sub">
              Solo visualización (no se puede inscribir en estas).
            </p>

            <div className="materias-grid">
              {materias5Ordenadas.map((m) => (
                <div
                  key={`c5-${generarClaveUnica(m)}`}
                  className="materia-card disabled only-visual"
                  title="Tercera materia: solo visualización"
                >
                  <span className="nombre">{m.materia}</span>
                  <small className="sub">
                    {`(Curso ${m.curso} • Div. ${m.division})`}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="actions-right only-desktop">
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

      <nav className="nav-bar only-mobile">
        <button type="button" className="btn-light" onClick={onVolver}>
          Volver
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={handleConfirm}
          disabled={!abierta}
          title={!abierta ? "La inscripción está cerrada" : ""}
        >
          Confirmar inscripción
        </button>
      </nav>
    </div>
  );
};

/* ============== Formulario principal ============== */
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

  const showToastReplace = useCallback((tipo, mensaje, duracion = 3800) => {
    setToast(null);

    setTimeout(() => {
      setToast({ tipo, mensaje, duracion, key: Date.now() });
    }, 0);
  }, []);

  const [cargando, setCargando] = useState(false);
  const [dataAlumno, setDataAlumno] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.abierta === false) {
        showToastReplace(
          "advertencia",
          ventana?.mensaje_cerrado || "La inscripción se cerró."
        );
      } else if (e?.detail?.abierta === true) {
        showToastReplace("exito", "La inscripción se abrió.");
      }
    };

    window.addEventListener("ventana:cambio", handler);
    return () => window.removeEventListener("ventana:cambio", handler);
  }, [showToastReplace, ventana?.mensaje_cerrado]);

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

  useEffect(() => {
    if (remember) {
      try {
        localStorage.setItem(LS.GMAIL, gmail || "");
      } catch {}
    }
  }, [gmail, remember]);

  useEffect(() => {
    if (remember) {
      try {
        localStorage.setItem(LS.DNI, dni || "");
      } catch {}
    }
  }, [dni, remember]);

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
      showToastReplace(
        "advertencia",
        ventana.mensaje_cerrado || "Inscripción cerrada."
      );
      return;
    }

    if (!isValidGmail(gmail)) {
      showToastReplace("error", "Ingresá un Gmail válido (@gmail.com).");
      return;
    }

    if (!isValidDni(dni)) {
      showToastReplace("error", "Ingresá un DNI válido (7 a 9 dígitos).");
      return;
    }

    try {
      setCargando(true);

      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_buscar_previas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gmail: gmail.trim(), dni }),
        }
      );

      const json = await resp.json();

      if (!json.exito) {
        const mensajeServidor =
          typeof json.mensaje === "string" ? json.mensaje.trim() : "";
        const mensajeFallback = "No se encontraron previas para el DNI.";
        const mensajeMostrar = mensajeServidor || mensajeFallback;

        const esNoPrevias =
          /no se encontraron.*(materias\s*previas|previas).*(dni)/i.test(
            mensajeMostrar
          );

        showToastReplace(
          "advertencia",
          mensajeMostrar,
          esNoPrevias ? 3000 : 3800
        );
        return;
      }

      if (json.ya_inscripto) {
        showToastReplace(
          "advertencia",
          "El alumno ya fue inscrito en todas las materias adeudadas."
        );
      }

      setDataAlumno({ ...json, gmail: gmail.trim() });
    } catch (err) {
      showToastReplace("error", "Error consultando el servidor.");
    } finally {
      setCargando(false);
    }
  };

  const confirmarInscripcion = async ({
    dni,
    materias,
    materias_nombres,
    gmail,
    nombre_alumno,
  }) => {
    if (!materias?.length) {
      showToastReplace("advertencia", "Seleccioná al menos una materia.");
      return;
    }

    await refetchVentana();

    if (ventana && !ventana.abierta) {
      showToastReplace(
        "advertencia",
        ventana.mensaje_cerrado || "Inscripción cerrada."
      );
      return;
    }

    try {
      const resp = await fetch(
        `${BASE_URL}/api.php?action=form_registrar_inscripcion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dni,
            materias,
          }),
        }
      );

      const json = await resp.json();

      if (!json.exito) {
        showToastReplace(
          "error",
          json?.mensaje || "No se pudo registrar la inscripción."
        );
        return;
      }

      const insertados = Number(json.insertados || 0);
      const duracionExito = insertados === 1 ? 3000 : 3800;

      showToastReplace(
        "exito",
        `Inscripción registrada (${insertados} materia/s).`,
        duracionExito
      );

      try {
        await fetch(
          "https://inscripcion.ipet50.edu.ar/mails/confirm_inscripcion.php",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toEmail: gmail,
              nombre: nombre_alumno || "",
              dni,
              materias: materias_nombres || [],
            }),
          }
        );
      } catch (e) {
        console.warn("Error enviando correo de confirmación", e);
      }

      setDataAlumno(null);

      if (!remember) {
        setDni("");
        setGmail("");
      }
    } catch {
      showToastReplace("error", "Error de red al registrar la inscripción.");
    }
  };

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
      <InscripcionCerrada
        cfg={{
          mensaje_cerrado: "Inscripción no disponible por el momento.",
        }}
      />
    );
  }

  if (ventana && !ventana.abierta) {
    return <InscripcionCerrada cfg={ventana} />;
  }

  const isLoginScreen = !dataAlumno;

  return (
    <div className={`auth-page ${isLoginScreen ? "is-login-screen" : ""}`}>
      {toast && (
        <Toast
          key={toast.key}
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
                <h1 className="hero-title">
                  {ventana?.titulo || "Mesas de Examen · IPET 50"}
                </h1>
                <p className="hero-sub">
                  Ingresá tu Gmail y DNI para consultar e inscribirte.
                </p>
              </div>

              <img
                src={escudo}
                alt="Escudo IPET 50"
                className="hero-logo hero-logo--big"
              />
            </div>
          </aside>

          <section className="auth-body">
            <header className="auth-header">
              <h2 className="auth-title">Iniciar sesión</h2>
              <p className="auth-sub">
                Inscripción abierta hasta{" "}
                <strong className="fecha-cierre">
                  {fmtFechaHoraES(ventana?.fin)}
                </strong>
                .
              </p>

              <p
                style={{
                  marginTop: "10px",
                  padding: "10px",
                  borderRadius: "8px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                Si sos egresado, acercate a secretaría para realizar la
                inscripción.
              </p>
            </header>

            <form
              className="auth-form"
              onSubmit={onSubmit}
              noValidate
              id="login-form"
            >
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
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={onToggleRemember}
                  />{" "}
                  <span>Recordarme</span>
                </label>
              </div>

              <button
                type="submit"
                className="btn-cta only-desktop"
                disabled={cargando}
              >
                {cargando ? "Buscando..." : "Continuar"}
              </button>
            </form>
          </section>

          <nav className="nav-login-mobile only-mobile">
            <button
              type="submit"
              form="login-form"
              className="btn-cta"
              disabled={cargando}
            >
              {cargando ? "Buscando..." : "Continuar"}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};

export default Formulario;
<?php
// backend/routes/api.php

declare(strict_types=1);

// ===== CORS =====
$allowed = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowed, true)) {
  header("Access-Control-Allow-Origin: $origin");
  header("Access-Control-Allow-Credentials: true");
} else {
  header("Access-Control-Allow-Origin: *");
}
header("Vary: Origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

// Respuesta rápida a preflight
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
  exit;
}

date_default_timezone_set('America/Argentina/Cordoba');
mb_internal_encoding('UTF-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

/* =========================
   Ruta base de módulos
========================= */
$MODULES_DIR = realpath(__DIR__ . '/../modules');
if ($MODULES_DIR === false) {
  http_response_code(500);
  echo json_encode(['exito' => false, 'mensaje' => 'No se encontró la carpeta de módulos.'], JSON_UNESCAPED_UNICODE);
  exit;
}

/**
 * Incluye un archivo si existe.
 */
function include_module(string $path): bool {
  if (!is_file($path)) {
    http_response_code(404);
    echo json_encode(['exito' => false, 'mensaje' => 'Ruta no encontrada: ' . $path], JSON_UNESCAPED_UNICODE);
    return false;
  }
  require_once $path;
  return true;
}

/**
 * Resolver: intenta varias rutas relativas y usa la primera que exista.
 * Esto te permite reordenar carpetas sin romper actions.
 */
function include_module_resolve(string $modulesDir, array $relativeCandidates): bool {
  foreach ($relativeCandidates as $rel) {
    $full = $modulesDir . '/' . ltrim($rel, '/');
    if (is_file($full)) {
      require_once $full;
      return true;
    }
  }
  http_response_code(404);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Ruta no encontrada. Probadas: ' . implode(' | ', $relativeCandidates),
  ], JSON_UNESCAPED_UNICODE);
  return false;
}

try {
  switch ($action) {

    /* =========================
       Login / Registro
    ========================= */
    case 'inicio':
      include_module($MODULES_DIR . '/login/inicio.php');
      break;
    case 'registro':
      include_module($MODULES_DIR . '/login/registro.php');
      break;

    /* =========================
       Listas
    ========================= */
    case 'obtener_listas':
    case 'listas_basicas':
      include_module($MODULES_DIR . '/global/obtener_listas.php');
      break;

    /* =========================
       Formulario público
    ========================= */
    case 'form_obtener_config_inscripcion':
      include_module($MODULES_DIR . '/formulario/obtener_config_inscripcion.php');
      break;
    case 'form_buscar_previas':
      include_module($MODULES_DIR . '/formulario/buscar_previas.php');
      break;
    case 'form_registrar_inscripcion':
      include_module($MODULES_DIR . '/formulario/registrar_inscripcion.php');
      break;
    case 'admin_guardar_config_inscripcion':
      include_module($MODULES_DIR . '/formulario/guardar_config_inscripcion.php');
      break;

    /* =========================
       Previas (Backoffice)
    ========================= */
    case 'previas':
    case 'obtener_previas':
      include_module($MODULES_DIR . '/previas/obtener_previas.php');
      break;
    case 'previa_eliminar':
      include_module($MODULES_DIR . '/previas/eliminar_registro.php');
      break;
    case 'previa_desinscribir':
      include_module($MODULES_DIR . '/previas/desinscribir.php');
      break;
    case 'previa_inscribir':
      include_module($MODULES_DIR . '/previas/inscribir.php');
      break;
    case 'previa_agregar':
      include_module($MODULES_DIR . '/previas/agregar_previa.php');
      break;
    case 'materias_por_curso_division':
      include_module($MODULES_DIR . '/previas/materias_por_curso_division.php');
      break;
    case 'previa_actualizar':
      include_module($MODULES_DIR . '/previas/actualizar_previa.php');
      break;
    case 'previa_get':
      include_module($MODULES_DIR . '/previas/obtener_previa.php');
      break;

    case 'previa_dar_baja':
      include_module($MODULES_DIR . '/previas/previa_dar_baja.php');
      break;
    case 'previa_dar_alta':
      include_module($MODULES_DIR . '/previas/previa_dar_alta.php');
      break;
    case 'previas_baja':
      include_module($MODULES_DIR . '/previas/obtener_previas_baja.php');
      break;

    case 'previas_guardar_copia_inscriptos':
      include_module($MODULES_DIR . '/previas/previas_guardar_copia_inscriptos.php');
      break;

    case 'previas_copias_listar':
      include_module($MODULES_DIR . '/previas/previas_copias_listar.php');
      break;
    case 'previas_copia_detalle':
      include_module($MODULES_DIR . '/previas/previas_copia_detalle.php');
      break;

    case 'previas_copias_limpiar':
      include_module($MODULES_DIR . '/previas/previas_copias_limpiar.php');
      break;

    // -------- 🔬 Previas LAB --------
    case 'previas_lab_ensure':
    case 'previas_lab_import':
    case 'previas_lab_truncate':
      include_module($MODULES_DIR . '/previas/previas_lab_endpoints.php');
      break;

    /* =========================
       Profesores
    ========================= */
    case 'profesores':
      include_module($MODULES_DIR . '/profesores/obtener_profesores.php');
      break;
    case 'agregar_profesor':
      include_module($MODULES_DIR . '/profesores/agregar_profesor.php');
      break;
    case 'editar_profesor':
      include_module($MODULES_DIR . '/profesores/editar_profesor.php');
      break;
    case 'eliminar_profesor':
      include_module($MODULES_DIR . '/profesores/eliminar_profesor.php');
      break;
    case 'dar_baja_profesor':
      include_module($MODULES_DIR . '/profesores/dar_baja_profesor.php');
      break;
    case 'profesores_baja':
      include_module($MODULES_DIR . '/profesores/profesores_baja.php');
      break;
    case 'dar_alta_profesor':
      include_module($MODULES_DIR . '/profesores/dar_alta_profesor.php');
      break;

    /* =========================
       Cátedras
    ========================= */
    case 'catedras_list':
      include_module($MODULES_DIR . '/catedras/obtener_catedras.php');
      break;
    case 'docentes_list':
      include_module($MODULES_DIR . '/catedras/obtener_docentes.php');
      break;
    case 'catedra_asignar_docente':
      include_module($MODULES_DIR . '/catedras/asignar_docente.php');
      break;

    /* =========================
       Mesas de Examen (RUTAS NUEVAS)
       -> apuntan a las subcarpetas según tu estructura
       -> con fallback a rutas viejas si aún existen
    ========================= */

    // Listado "clásico" si lo seguís usando
    case 'mesas_listar':
      include_module_resolve($MODULES_DIR, [
        'mesas/obtener_mesas/obtener_mesas.php',
        'mesas/obtener_mesas.php',
      ]);
      break;

    // Crear / armar
    case 'mesas_crear':
      include_module_resolve($MODULES_DIR, [
        'mesas/armar_mesas/armar_mesas.php',
        'mesas/armar_mesas.php',
      ]);
      break;

    case 'mesas_crear_todas':
      include_module_resolve($MODULES_DIR, [
        'mesas/armar_mesas/armar_mesas_lote.php',
        'mesas/armar_mesas_lote.php',
      ]);
      break;

    // Eliminar en lote (modal rojo)
    case 'mesas_eliminar_todas':
      include_module_resolve($MODULES_DIR, [
        'mesas/eliminar_mesas/mesas_eliminar_todas.php',
        'mesas/mesas_eliminar_todas.php',
      ]);
      break;

    // Eliminar individual
    case 'mesa_eliminar':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/mesa_eliminar.php',
        'mesas/mesa_eliminar.php',
      ]);
      break;

    // Actualizar mesa (editar)
    case 'mesa_actualizar':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/mesa_actualizar.php',
        'mesas/mesa_actualizar.php',
      ]);
      break;

    // Reoptimizar
    case 'mesas_reoptimizar':
      include_module_resolve($MODULES_DIR, [
        'mesas/armar_mesas/reoptimizar_mesas.php',
        'mesas/reoptimizar_mesas.php',
      ]);
      break;

    case 'mesas_reoptimizar_completar':
      include_module_resolve($MODULES_DIR, [
        'mesas/armar_mesas/reoptimizar_mesas_completar.php',
        'mesas/reoptimizar_mesas_completar.php',
      ]);
      break;

    // Crear grupo único
    case 'mesa_crear_grupo_unico':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/mesa_crear_grupo_unico.php',
        'mesas/mesa_crear_grupo_unico.php',
      ]);
      break;

    // Armado de grupos
    case 'mesas_armar_grupos':
    case 'armar_mesa_grupo': // alias
      include_module_resolve($MODULES_DIR, [
        'mesas/armar_mesas/armar_mesa_grupo.php',
        'mesas/armar_mesa_grupo.php',
      ]);
      break;

    // Listar grupos
    case 'mesas_listar_grupos':
      include_module_resolve($MODULES_DIR, [
        'mesas/obtener_mesas/obtener_mesas_grupos.php',
        'mesas/obtener_mesas_grupos.php',
      ]);
      break;

    // Agregar / quitar números en grupo
    case 'mesa_grupo_agregar_numero':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_agregar_mesa/mesa_grupo_agregar_numero.php',
        'mesas/mesa_grupo_agregar_numero.php',
      ]);
      break;

    case 'mesa_grupo_quitar_numero':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/mesa_grupo_quitar_numero.php',
        'mesas/mesa_grupo_quitar_numero.php',
      ]);
      break;

    // Crear grupo (si existe en tu proyecto)
    case 'mesa_grupo_crear':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/mesa_grupo_crear.php',
        'mesas/mesa_grupo_crear.php',
      ]);
      break;

    // Listar grupos incompletos / mover de grupo
    case 'mesas_listar_grupos_incompletos':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_mover/mesas_listar_grupos_incompletos.php',
        'mesas/mesas_listar_grupos_incompletos.php',
      ]);
      break;

    case 'mesa_mover_de_grupo':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_mover/mesa_mover_de_grupo.php',
        'mesas/mesa_mover_de_grupo.php',
      ]);
      break;

    // Detalle (modal / editar)
    case 'mesas_detalle':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/obtener_mesas_detalle.php',
        'mesas/obtener_mesas_detalle.php',
      ]);
      break;

    // No agrupadas
    case 'mesas_listar_no_agrupadas':
      include_module_resolve($MODULES_DIR, [
        'mesas/obtener_mesas/obtener_mesas_no_agrupadas.php',
        'mesas/obtener_mesas_no_agrupadas.php',
      ]);
      break;

    case 'mesas_no_agrupadas_candidatas':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_agregar_mesa/mesas_no_agrupadas_candidatas.php',
        'mesas/mesas_no_agrupadas_candidatas.php',
      ]);
      break;

    // Detalle PDF
    case 'mesas_detalle_pdf':
      include_module_resolve($MODULES_DIR, [
        'mesas/obtener_mesas/obtener_mesas_pdf.php',
        'mesas/obtener_mesas_pdf.php',
      ]);
      break;

    // Candidatas previas / agregar alumno
    case 'mesa_previas_candidatas':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_mas/mesa_previas_candidatas.php',
        'mesas/mesa_previas_candidatas.php',
      ]);
      break;

    case 'mesa_agregar_alumno':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_mas/mesa_agregar_alumno.php',
        'mesas/mesa_agregar_alumno.php',
      ]);
      break;

    // Previas por mesa / mover previa (editar_persona)
    case 'mesas_previas_por_mesa':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_persona/mesas_previas_por_mesa.php',
        'mesas/mesas_previas_por_mesa.php',
      ]);
      break;

    case 'mesas_opciones_mover_previa':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_persona/mesas_opciones_mover_previa.php',
        'mesas/mesas_opciones_mover_previa.php',
      ]);
      break;

    case 'mesas_mover_previa':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/editar_persona/mesas_mover_previa.php',
        'mesas/mesas_mover_previa.php',
      ]);
      break;
      

    case 'agregar_nota':
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/agregar_nota.php',
      ]);
      break;

    // ✅ Alias retrocompatible: obtener_info_mesa -> mesas_detalle
    case 'obtener_info_mesa':
      if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $nums = [];
        if (isset($_GET['id_mesa'])) {
          $n = (int)$_GET['id_mesa'];
          if ($n > 0) $nums[] = $n;
        }
        if (isset($_GET['numero_mesa'])) {
          $n = (int)$_GET['numero_mesa'];
          if ($n > 0) $nums[] = $n;
        }
        if ($nums) {
          $GLOBALS['__FORCED_JSON_BODY__'] = ['numeros_mesa' => $nums];
        }
      }
      include_module_resolve($MODULES_DIR, [
        'mesas/editar_mesas/obtener_mesas_detalle.php',
        'mesas/obtener_mesas_detalle.php',
      ]);
      break;

    /* =========================
       Default
    ========================= */
    default:
      http_response_code(400);
      echo json_encode(['exito' => false, 'mensaje' => 'Acción no válida.'], JSON_UNESCAPED_UNICODE);
      break;
  }
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['exito' => false, 'mensaje' => 'Error interno: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
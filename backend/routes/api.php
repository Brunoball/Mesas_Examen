<?php
// backend/routes/api.php
// =====================================
//  C O R S  (siempre, incluso en errores)
// =====================================

// Lista blanca local común (podés agregar más)
$allowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true"); // por si luego usás cookies
} else {
    // En desarrollo, si no querés lista blanca, dejá wildcard:
    header("Access-Control-Allow-Origin: *");
}
header("Vary: Origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    echo json_encode(['ok' => true]);
    exit;
}

// =====================================
//  Config regional
// =====================================
date_default_timezone_set('America/Argentina/Cordoba');
mb_internal_encoding('UTF-8');

// =====================================
//  Resolución de acción
// =====================================
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// =====================================
//  Include helper con manejo de errores
// =====================================
$MODULES_DIR = realpath(__DIR__ . '/../modules');
if ($MODULES_DIR === false) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'No se encontró la carpeta de módulos.']);
    exit;
}

/**
 * Incluye un módulo y retorna true/false según exista.
 */
function include_module(string $path): bool {
    if (!is_file($path)) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'Ruta no encontrada: ' . $path]);
        return false;
    }
    require_once $path;
    return true;
}

// =====================================
//  Router
// =====================================
try {
    switch ($action) {

        // -------- Login / Registro --------
        case 'inicio':
            include_module($MODULES_DIR . '/login/inicio.php');
            break;

        case 'registro':
            include_module($MODULES_DIR . '/login/registro.php');
            break;

        // -------- Listas globales (combos) --------
        // Alias aceptados: obtener_listas / listas_basicas
        case 'obtener_listas':
        case 'listas_basicas':
            include_module($MODULES_DIR . '/global/obtener_listas.php');
            break;

        // -------- Formulario público --------
        case 'form_buscar_previas':
            include_module($MODULES_DIR . '/formulario/buscar_previas.php');
            break;

        case 'form_registrar_inscripcion':
            include_module($MODULES_DIR . '/formulario/registrar_inscripcion.php');
            break;

        // -------- Previas (Backoffice) --------
        case 'previas':
        case 'obtener_previas':
            include_module($MODULES_DIR . '/previas/obtener_previas.php');
            break;

        

        // *** NUEVOS ENDPOINTS (Previas) ***
        case 'previa_eliminar':
            include_module($MODULES_DIR . '/previas/eliminar_registro.php');
            break;

        case 'previa_desinscribir':
            include_module($MODULES_DIR . '/previas/desinscribir.php');
            break;

        case 'previa_inscribir': // NUEVO
            include_module($MODULES_DIR . '/previas/inscribir.php');
            break;

        case 'previa_agregar':   // NUEVO
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


        // -------- Profesores --------
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

        // -------- Cátedras --------
        case 'catedras_list':
            include_module($MODULES_DIR . '/catedras/obtener_catedras.php');
            break;

        // -------- Docentes (listado para modal/asignación) --------
        case 'docentes_list':
            include_module($MODULES_DIR . '/catedras/obtener_docentes.php');
            break;

        // -------- Cátedras: asignar/cambiar docente --------
        case 'catedra_asignar_docente':
            include_module($MODULES_DIR . '/catedras/asignar_docente.php');
            break;

        // -------- Default --------
        default:
            http_response_code(400);
            echo json_encode(['exito' => false, 'mensaje' => 'Acción no válida.']);
            break;
    }

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error interno: ' . $e->getMessage()]);
}

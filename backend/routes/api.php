<?php
// backend/routes/api.php

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
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    echo json_encode(['ok' => true]);
    exit;
}

date_default_timezone_set('America/Argentina/Cordoba');
mb_internal_encoding('UTF-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Ruta base de módulos
$MODULES_DIR = realpath(__DIR__ . '/../modules');
if ($MODULES_DIR === false) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'No se encontró la carpeta de módulos.']);
    exit;
}

function include_module(string $path): bool {
    if (!is_file($path)) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'Ruta no encontrada: ' . $path]);
        return false;
    }
    require_once $path;
    return true;
}

try {
    switch ($action) {
        // -------- Login / Registro --------
        case 'inicio':
            include_module($MODULES_DIR . '/login/inicio.php'); break;
        case 'registro':
            include_module($MODULES_DIR . '/login/registro.php'); break;

        // -------- Listas --------
        case 'obtener_listas':
        case 'listas_basicas':
            include_module($MODULES_DIR . '/global/obtener_listas.php'); break;

        // -------- Formulario público --------
        case 'form_obtener_config_inscripcion':
            include_module($MODULES_DIR . '/formulario/obtener_config_inscripcion.php'); break;
        case 'form_buscar_previas':
            include_module($MODULES_DIR . '/formulario/buscar_previas.php'); break;
        case 'form_registrar_inscripcion':
            include_module($MODULES_DIR . '/formulario/registrar_inscripcion.php'); break;
        case 'admin_guardar_config_inscripcion':
            include_module($MODULES_DIR . '/formulario/guardar_config_inscripcion.php'); break;

        // -------- Previas (Backoffice) --------
        case 'previas':
        case 'obtener_previas':
            include_module($MODULES_DIR . '/previas/obtener_previas.php'); break;
        case 'previa_eliminar':
            include_module($MODULES_DIR . '/previas/eliminar_registro.php'); break;
        case 'previa_desinscribir':
            include_module($MODULES_DIR . '/previas/desinscribir.php'); break;
        case 'previa_inscribir':
            include_module($MODULES_DIR . '/previas/inscribir.php'); break;
        case 'previa_agregar':
            include_module($MODULES_DIR . '/previas/agregar_previa.php'); break;
        case 'materias_por_curso_division':
            include_module($MODULES_DIR . '/previas/materias_por_curso_division.php'); break;
        case 'previa_actualizar':
            include_module($MODULES_DIR . '/previas/actualizar_previa.php'); break;
        case 'previa_get':
            include_module($MODULES_DIR . '/previas/obtener_previa.php'); break;

        // -------- 🔬 Previas LAB (tabla de PRUEBAS) --------
        case 'previas_lab_ensure':
        case 'previas_lab_import':
        case 'previas_lab_truncate':
            include_module($MODULES_DIR . '/previas/previas_lab_endpoints.php'); break;

        // -------- Profesores --------
        case 'profesores':
            include_module($MODULES_DIR . '/profesores/obtener_profesores.php'); break;
        case 'agregar_profesor':
            include_module($MODULES_DIR . '/profesores/agregar_profesor.php'); break;
        case 'editar_profesor':
            include_module($MODULES_DIR . '/profesores/editar_profesor.php'); break;
        case 'eliminar_profesor':
            include_module($MODULES_DIR . '/profesores/eliminar_profesor.php'); break;
        case 'dar_baja_profesor':
            include_module($MODULES_DIR . '/profesores/dar_baja_profesor.php'); break;
        case 'profesores_baja':
            include_module($MODULES_DIR . '/profesores/profesores_baja.php'); break;
        case 'dar_alta_profesor':
            include_module($MODULES_DIR . '/profesores/dar_alta_profesor.php'); break;

        // -------- Cátedras --------
        case 'catedras_list':
            include_module($MODULES_DIR . '/catedras/obtener_catedras.php'); break;
        case 'docentes_list':
            include_module($MODULES_DIR . '/catedras/obtener_docentes.php'); break;
        case 'catedra_asignar_docente':
            include_module($MODULES_DIR . '/catedras/asignar_docente.php'); break;

        // -------- Mesas de Examen --------
        case 'mesas_listar':
            include_module($MODULES_DIR . '/mesas/obtener_mesas.php'); break;
        case 'mesas_crear':
            include_module($MODULES_DIR . '/mesas/armar_mesas.php'); break;
        case 'mesas_crear_todas':
            include_module($MODULES_DIR . '/mesas/armar_mesas_lote.php'); break;
        case 'mesas_eliminar_todas':
            include_module($MODULES_DIR . '/mesas/mesas_eliminar_todas.php'); break;
        case 'mesa_eliminar':
            include_module($MODULES_DIR . '/mesas/mesa_eliminar.php'); break;
        case 'mesa_actualizar':
            include_module($MODULES_DIR . '/mesas/mesa_actualizar.php'); break;

        // ✅ Grupos de mesas (armado y listado)
        case 'mesas_armar_grupos':
        case 'armar_mesa_grupo': // alias
            include_module($MODULES_DIR . '/mesas/armar_mesa_grupo.php'); break;
        case 'mesas_listar_grupos':
            include_module($MODULES_DIR . '/mesas/obtener_mesas_grupos.php'); break;

        // ✅ Operaciones sobre grupos (agregar / quitar / crear)
        case 'mesa_grupo_agregar_numero':
            include_module($MODULES_DIR . '/mesas/mesa_grupo_agregar_numero.php'); break;
        case 'mesa_grupo_quitar_numero':
            include_module($MODULES_DIR . '/mesas/mesa_grupo_quitar_numero.php'); break;
        case 'mesa_grupo_crear':
            include_module($MODULES_DIR . '/mesas/mesa_grupo_crear.php'); break;

        // ✅ NUEVAS RUTAS — mover a grupo y listar grupos incompletos
        case 'mesas_listar_grupos_incompletos':
            include_module($MODULES_DIR . '/mesas/mesas_listar_grupos_incompletos.php'); break;
        case 'mesa_mover_de_grupo':
            include_module($MODULES_DIR . '/mesas/mesa_mover_de_grupo.php'); break;

        // ✅ Detalle para exportar PDF / modal
        case 'mesas_detalle':
            include_module($MODULES_DIR . '/mesas/obtener_mesas_detalle.php'); break;

        // ✅ No agrupadas (listado general + candidatas con validación)
        case 'mesas_listar_no_agrupadas':
            include_module($MODULES_DIR . '/mesas/obtener_mesas_no_agrupadas.php'); break;
        case 'mesas_no_agrupadas_candidatas':
            include_module($MODULES_DIR . '/mesas/mesas_no_agrupadas_candidatas.php'); break;

        case 'mesas_detalle_pdf':
            include_module($MODULES_DIR . '/mesas/obtener_mesas_pdf.php'); break;

        case 'mesas_reoptimizar':
            include_module($MODULES_DIR . '/mesas/reoptimizar_mesas.php'); break;

        // ✅ Alias retrocompatible: obtener_info_mesa -> mesas_detalle
        case 'obtener_info_mesa':
            // Adaptador: soporta GET ?id_mesa=1 o ?numero_mesa=1
            if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                $nums = [];
                if (isset($_GET['id_mesa'])) {
                    $n = (int)$_GET['id_mesa'];
                    if ($n > 0) $nums[] = $n;
                }
                if (isset($_GET['numero_mesa'])) {
                    $n = (int)$_GET['numero_mesa'];
                    if ($n > 0) $nums[] = $n;
                }
                // ⚠️ obtener_mesas_detalle.php espera 'numeros_mesa'
                if ($nums) {
                    $GLOBALS['__FORCED_JSON_BODY__'] = ['numeros_mesa' => $nums];
                }
            }
            include_module($MODULES_DIR . '/mesas/obtener_mesas_detalle.php');
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

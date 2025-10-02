<?php
// backend/modules/profesores/dar_alta_profesor.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

// Fuerza zona horaria local (evita sorpresas si en algún lado se usa "hoy")
date_default_timezone_set('America/Argentina/Cordoba');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Solo POST
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
        exit;
    }

    // Cuerpo (form-urlencoded o JSON)
    $raw = file_get_contents('php://input');
    $body = [];
    if (isset($_SERVER['CONTENT_TYPE']) && stripos($_SERVER['CONTENT_TYPE'], 'application/json') !== false) {
        $body = json_decode($raw, true);
    } else {
        parse_str($raw, $body);
    }

    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Payload inválido']);
        exit;
    }

    $id_profesor   = isset($body['id_profesor']) ? (int)$body['id_profesor'] : 0;
    $fecha_ingreso = isset($body['fecha_ingreso']) ? trim((string)$body['fecha_ingreso']) : '';

    if ($id_profesor <= 0 || $fecha_ingreso === '') {
        http_response_code(400);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Faltan campos obligatorios (id_profesor, fecha_ingreso).'
        ]);
        exit;
    }

    // Atajo opcional: permitir "hoy"
    if (mb_strtolower($fecha_ingreso) === 'hoy') {
        $fecha_ingreso = date('Y-m-d'); // local, no UTC
    }

    // Validar formato AAAA-MM-DD (ej: 2025-09-30)
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_ingreso)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Formato de fecha inválido (usar AAAA-MM-DD).']);
        exit;
    }

    // Verificar existencia
    $sel = $pdo->prepare("
        SELECT id_docente, activo
        FROM docentes
        WHERE id_docente = :id
        LIMIT 1
    ");
    $sel->execute([':id' => $id_profesor]);
    $doc = $sel->fetch(PDO::FETCH_ASSOC);

    if (!$doc) {
        echo json_encode(['exito' => false, 'mensaje' => 'No se encontró el profesor.']);
        exit;
    }

    // Actualizar estado: activo = 1, limpiar motivo y setear fecha_carga EXACTA
    // Usamos STR_TO_DATE para garantizar que MySQL lo guarde como DATE
    $upd = $pdo->prepare("
        UPDATE docentes
        SET activo = 1,
            motivo = '',
            fecha_carga = STR_TO_DATE(:fecha, '%Y-%m-%d')
        WHERE id_docente = :id
        LIMIT 1
    ");
    $upd->execute([
        ':id'    => $id_profesor,
        ':fecha' => $fecha_ingreso
    ]);

    echo json_encode([
        'exito'       => true,
        'mensaje'     => 'Profesor dado de alta correctamente.',
        'id_docente'  => $id_profesor,
        'fecha_alta'  => $fecha_ingreso
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al dar de alta: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

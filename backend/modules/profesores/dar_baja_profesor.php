<?php
// backend/modules/profesores/dar_baja_profesor.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

// Aseguramos fecha local (evita desfases si el server está en UTC)
date_default_timezone_set('America/Argentina/Cordoba');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Solo JSON
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Payload inválido']);
        exit;
    }

    // Campos requeridos
    $id_profesor = isset($body['id_profesor']) ? (int)$body['id_profesor'] : 0; // = id_docente
    $motivo      = isset($body['motivo']) ? trim($body['motivo']) : '';

    if ($id_profesor <= 0 || $motivo === '') {
        http_response_code(400);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Faltan campos obligatorios (id_profesor, motivo).'
        ]);
        exit;
    }

    // Normalizar motivo
    $motivo = preg_replace('/\s+/', ' ', $motivo);
    $motivo = mb_strtoupper($motivo);
    if (mb_strlen($motivo) > 250) {
        $motivo = mb_substr($motivo, 0, 250);
    }

    // Verificar existencia
    $sel = $pdo->prepare("
        SELECT id_docente, activo
        FROM mesas_examen.docentes
        WHERE id_docente = :id
        LIMIT 1
    ");
    $sel->execute([':id' => $id_profesor]);
    $doc = $sel->fetch(PDO::FETCH_ASSOC);

    if (!$doc) {
        echo json_encode(['exito' => false, 'mensaje' => 'No se encontró el profesor.']);
        exit;
    }

    // Fecha local actual (YYYY-MM-DD)
    $hoy = date('Y-m-d');

    // Dar de baja: activo = 0, guardar motivo y fecha_carga = HOY
    // Usamos STR_TO_DATE para asegurar que MySQL lo guarde como DATE sin interpretar TZ
    $upd = $pdo->prepare("
        UPDATE mesas_examen.docentes
        SET activo = 0,
            motivo = :motivo,
            fecha_carga = STR_TO_DATE(:hoy, '%Y-%m-%d')
        WHERE id_docente = :id
        LIMIT 1
    ");
    $upd->execute([
        ':id'     => $id_profesor,
        ':motivo' => $motivo,
        ':hoy'    => $hoy,
    ]);

    echo json_encode([
        'exito'       => true,
        'mensaje'     => 'Profesor dado de baja, motivo y fecha registrados.',
        'id_docente'  => $id_profesor,
        'fecha_baja'  => $hoy,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al dar de baja: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

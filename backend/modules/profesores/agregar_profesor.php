<?php
// backend/modules/profesores/agregar_profesor.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    // Solo JSON
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Payload inválido']);
        exit;
    }

    $docente  = isset($body['docente'])  ? trim($body['docente']) : '';
    $id_cargo = isset($body['id_cargo']) ? (int)$body['id_cargo'] : 0;

    // 🔹 Nuevos campos (opcionales)
    $id_turno_si = array_key_exists('id_turno_si', $body) ? $body['id_turno_si'] : null;
    $id_turno_no = array_key_exists('id_turno_no', $body) ? $body['id_turno_no'] : null;
    $fecha_si    = array_key_exists('fecha_si', $body)    ? $body['fecha_si']    : null;
    $fecha_no    = array_key_exists('fecha_no', $body)    ? $body['fecha_no']    : null;

    if ($docente === '' || $id_cargo <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan campos obligatorios (docente, id_cargo).']);
        exit;
    }

    // Normalizamos espacios y a mayúsculas (coincidir con tu DB)
    $docente = mb_strtoupper(preg_replace('/\s+/', ' ', $docente));

    // Normalizar opcionales: '' => NULL ; números válidos => int
    $id_turno_si = ($id_turno_si === '' || is_null($id_turno_si)) ? null : (int)$id_turno_si;
    $id_turno_no = ($id_turno_no === '' || is_null($id_turno_no)) ? null : (int)$id_turno_no;
    $fecha_si    = ($fecha_si === '' || is_null($fecha_si)) ? null : $fecha_si;
    $fecha_no    = ($fecha_no === '' || is_null($fecha_no)) ? null : $fecha_no;

    // Validación básica de fecha (YYYY-MM-DD)
    $isDate = function($d) {
        if ($d === null) return true;
        return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d);
    };
    if (!$isDate($fecha_si) || !$isDate($fecha_no)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Formato de fecha inválido (use YYYY-MM-DD).']);
        exit;
    }

    // (Opcional) validar que los turnos existan si vienen informados
    if ($id_turno_si !== null) {
        $chk = $pdo->prepare("SELECT 1 FROM mesas_examen.turnos WHERE id_turno = ?");
        $chk->execute([$id_turno_si]);
        if (!$chk->fetchColumn()) $id_turno_si = null;
    }
    if ($id_turno_no !== null) {
        $chk = $pdo->prepare("SELECT 1 FROM mesas_examen.turnos WHERE id_turno = ?");
        $chk->execute([$id_turno_no]);
        if (!$chk->fetchColumn()) $id_turno_no = null;
    }

    // Insert (fecha_carga se completa sola por default; activo default 1)
    $sql = "
        INSERT INTO mesas_examen.docentes
            (docente, id_cargo, id_turno_si, id_turno_no, fecha_si, fecha_no)
        VALUES
            (:docente, :id_cargo, :id_turno_si, :id_turno_no, :fecha_si, :fecha_no)
    ";
    $st = $pdo->prepare($sql);
    $st->execute([
        ':docente'     => $docente,
        ':id_cargo'    => $id_cargo,
        ':id_turno_si' => $id_turno_si,
        ':id_turno_no' => $id_turno_no,
        ':fecha_si'    => $fecha_si,
        ':fecha_no'    => $fecha_no,
    ]);

    $id = (int)$pdo->lastInsertId();

    echo json_encode([
        'exito'       => true,
        'mensaje'     => 'Docente creado',
        'id_docente'  => $id,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al agregar docente: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

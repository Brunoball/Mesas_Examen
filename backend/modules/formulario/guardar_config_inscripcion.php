<?php
// backend/modules/formulario/guardar_config_inscripcion.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    date_default_timezone_set('America/Argentina/Cordoba');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);

    $id_config       = isset($in['id_config']) ? (int)$in['id_config'] : 0;
    $nombre          = trim($in['nombre'] ?? '');
    $insc_inicio     = trim($in['insc_inicio'] ?? '');
    $insc_fin        = trim($in['insc_fin'] ?? '');
    $mensaje_cerrado = trim($in['mensaje_cerrado'] ?? 'La inscripción está cerrada. Consultá Secretaría.');
    $activo          = isset($in['activo']) ? (int)$in['activo'] : 1;

    if ($nombre === '' || $insc_inicio === '' || $insc_fin === '') {
        echo json_encode(['exito' => false, 'mensaje' => 'Campos obligatorios faltantes.']);
        exit;
    }

    // Validación formato y rango
    if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $insc_inicio)) {
        echo json_encode(['exito' => false, 'mensaje' => 'Formato inválido en insc_inicio.']);
        exit;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $insc_fin)) {
        echo json_encode(['exito' => false, 'mensaje' => 'Formato inválido en insc_fin.']);
        exit;
    }
    if (strtotime($insc_inicio) >= strtotime($insc_fin)) {
        echo json_encode(['exito' => false, 'mensaje' => 'La fecha de inicio debe ser anterior a la de fin.']);
        exit;
    }

    $pdo->beginTransaction();

    // Si la nueva configuración queda activa, desactivo todas las demás
    if ($activo === 1) {
        $pdo->exec("UPDATE mesas_config SET activo = 0");
    }

    if ($id_config > 0) {
        // Update de una existente (manteniendo historial)
        $sql = "UPDATE mesas_config
                SET nombre = :nombre,
                    insc_inicio = :ini,
                    insc_fin = :fin,
                    mensaje_cerrado = :msg,
                    activo = :activo,
                    actualizado_en = NOW()
                WHERE id_config = :id";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':nombre' => $nombre,
            ':ini'    => $insc_inicio,
            ':fin'    => $insc_fin,
            ':msg'    => $mensaje_cerrado,
            ':activo' => $activo,
            ':id'     => $id_config
        ]);
    } else {
        // Inserto una nueva (historial)
        $sql = "INSERT INTO mesas_config (nombre, insc_inicio, insc_fin, mensaje_cerrado, activo, creado_en, actualizado_en)
                VALUES (:nombre, :ini, :fin, :msg, :activo, NOW(), NOW())";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':nombre' => $nombre,
            ':ini'    => $insc_inicio,
            ':fin'    => $insc_fin,
            ':msg'    => $mensaje_cerrado,
            ':activo' => $activo
        ]);
        $id_config = (int)$pdo->lastInsertId();
    }

    $pdo->commit();

    echo json_encode(['exito' => true, 'id_config' => $id_config, 'mensaje' => 'Guardado correctamente']);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(200);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error guardando configuración.',
        'detalle' => $e->getMessage()
    ]);
}

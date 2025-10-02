<?php
// backend/modules/previas/desinscribir.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);
    $id  = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'ID inválido']);
        exit;
    }

    // asegurar existencia
    $stmt = $pdo->prepare("SELECT id_previa, inscripcion FROM previas WHERE id_previa = :id");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'Registro no encontrado']);
        exit;
    }

    // set inscripcion = 0
    $upd = $pdo->prepare("UPDATE previas SET inscripcion = 0 WHERE id_previa = :id");
    $upd->execute([':id' => $id]);

    echo json_encode(['exito' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => $e->getMessage()]);
}

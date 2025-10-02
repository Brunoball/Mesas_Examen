<?php
// backend/modules/previas/inscribir.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']); exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true);
    $id  = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;
    if ($id <= 0) throw new InvalidArgumentException('id_previa inválido');

    $st = $pdo->prepare("UPDATE previas SET inscripcion = 1 WHERE id_previa = :id");
    $st->execute([':id' => $id]);

    echo json_encode(['exito' => true]);
} catch (Throwable $e) {
    http_response_code(200);
    echo json_encode(['exito' => false, 'mensaje' => $e->getMessage()]);
}

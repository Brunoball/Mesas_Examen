<?php
// backend/modules/profesores/eliminar_profesor.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Payload inválido']);
        exit;
    }

    $id = isset($body['id_profesor']) ? (int)$body['id_profesor'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'ID de profesor inválido']);
        exit;
    }

    // Verificamos existencia
    $st = $pdo->prepare("SELECT 1 FROM mesas_examen.docentes WHERE id_docente = :id");
    $st->execute([':id' => $id]);
    if (!$st->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'Profesor no encontrado']);
        exit;
    }

    // Borrado definitivo
    $del = $pdo->prepare("DELETE FROM mesas_examen.docentes WHERE id_docente = :id");
    $del->execute([':id' => $id]);

    echo json_encode(['exito' => true, 'mensaje' => 'Profesor eliminado']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error al eliminar: ' . $e->getMessage()]);
}

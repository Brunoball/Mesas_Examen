<?php
// backend/modules/previas/eliminar_registro.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $raw = file_get_contents('php://input');
    $in = json_decode($raw ?: '[]', true);
    if (!is_array($in)) $in = [];

    $id = (int)($in['id_previa'] ?? $_POST['id_previa'] ?? $_GET['id_previa'] ?? 0);

    if ($id <= 0) {
        http_response_code(400);
        echo json_encode([
            'exito' => false,
            'mensaje' => 'ID inválido'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pdo->beginTransaction();

    // 1) Intentar eliminar de previas activas
    $stmt = $pdo->prepare("SELECT id_previa FROM previas WHERE id_previa = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $existeEnPrevias = (bool)$stmt->fetchColumn();

    if ($existeEnPrevias) {
        $del = $pdo->prepare("DELETE FROM previas WHERE id_previa = :id LIMIT 1");
        $del->execute([':id' => $id]);

        $pdo->commit();

        echo json_encode([
            'exito' => true,
            'mensaje' => 'Registro eliminado correctamente.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 2) Si no está en previas, intentar eliminar del historial
    $stmt = $pdo->prepare("SELECT id_previa FROM previas_historial WHERE id_previa = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $existeEnHistorial = (bool)$stmt->fetchColumn();

    if (!$existeEnHistorial) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode([
            'exito' => false,
            'mensaje' => 'Registro no encontrado'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $delHist = $pdo->prepare("DELETE FROM previas_historial WHERE id_previa = :id LIMIT 1");
    $delHist->execute([':id' => $id]);

    $pdo->commit();

    echo json_encode([
        'exito' => true,
        'mensaje' => 'Registro eliminado correctamente.'
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $sqlState = $e->getCode();
    $errorInfo = $e->errorInfo ?? [];
    $driverCode = (int)($errorInfo[1] ?? 0);

    if ($sqlState === '23000' && $driverCode === 1451) {
        http_response_code(409);
        echo json_encode([
            'exito' => false,
            'mensaje' => 'No se puede eliminar el alumno porque está registrado en una mesa de examen.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error al eliminar la previa. Intentalo de nuevo más tarde.'
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Ocurrió un error inesperado al eliminar la previa.'
    ], JSON_UNESCAPED_UNICODE);
}
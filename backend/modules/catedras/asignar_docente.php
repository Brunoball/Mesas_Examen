<?php
// backend/modules/catedras/asignar_docente.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Solo POST con JSON
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $raw  = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'JSON inválido'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $idCatedra = isset($data['id_catedra']) ? (int)$data['id_catedra'] : 0;
    $idDocente = array_key_exists('id_docente', $data) ? $data['id_docente'] : null;
    $idDocente = ($idDocente === null || $idDocente === '') ? null : (int)$idDocente;

    if ($idCatedra <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'id_catedra requerido'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Validar existencia de la cátedra (sin prefijo de base)
    $st = $pdo->prepare("SELECT id_catedra FROM catedras WHERE id_catedra = :id");
    $st->execute([':id' => $idCatedra]);
    if (!$st->fetch(PDO::FETCH_ASSOC)) {
        http_response_code(404);
        echo json_encode(['exito' => false, 'mensaje' => 'La cátedra no existe'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Si se envía id_docente, validar existencia (sin prefijo de base)
    if ($idDocente !== null) {
        $sd = $pdo->prepare("SELECT id_docente FROM docentes WHERE id_docente = :id");
        $sd->execute([':id' => $idDocente]);
        if (!$sd->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(404);
            echo json_encode(['exito' => false, 'mensaje' => 'El docente no existe'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Actualizar asignación (permite null para quitar docente si quisieras)
    $sql = "UPDATE catedras SET id_docente = :id_docente WHERE id_catedra = :id_catedra";
    $up  = $pdo->prepare($sql);

    if ($idDocente === null) {
        $up->bindValue(':id_docente', null, PDO::PARAM_NULL);
    } else {
        $up->bindValue(':id_docente', $idDocente, PDO::PARAM_INT);
    }
    $up->bindValue(':id_catedra', $idCatedra, PDO::PARAM_INT);
    $up->execute();

    echo json_encode(['exito' => true, 'mensaje' => 'Docente asignado'], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error al asignar docente: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

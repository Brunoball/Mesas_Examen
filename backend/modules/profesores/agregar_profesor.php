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

    $docente = isset($body['docente']) ? trim($body['docente']) : '';
    $id_cargo = isset($body['id_cargo']) ? (int)$body['id_cargo'] : 0;

    if ($docente === '' || $id_cargo <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan campos obligatorios (docente, id_cargo).']);
        exit;
    }

    // Normalizamos espacios y a mayúsculas (coincidir con tu DB)
    $docente = mb_strtoupper(preg_replace('/\s+/', ' ', $docente));

    // Insert
    $sql = "INSERT INTO mesas_examen.docentes (docente, id_cargo) VALUES (:docente, :id_cargo)";
    $st = $pdo->prepare($sql);
    $st->execute([
        ':docente'  => $docente,
        ':id_cargo' => $id_cargo,
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

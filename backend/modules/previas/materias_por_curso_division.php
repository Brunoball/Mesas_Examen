<?php
// backend/modules/previas/materias_por_curso_division.php
require_once __DIR__ . '/../../config/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Acepta GET o POST (querystring o JSON)
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);

    $id_curso    = isset($_GET['id_curso'])    ? (int)$_GET['id_curso']    : (isset($body['id_curso'])    ? (int)$body['id_curso']    : 0);
    $id_division = isset($_GET['id_division']) ? (int)$_GET['id_division'] : (isset($body['id_division']) ? (int)$body['id_division'] : 0);

    if ($id_curso <= 0 || $id_division <= 0) {
        http_response_code(400);
        echo json_encode(['exito' => false, 'mensaje' => 'Parámetros inválidos (id_curso, id_division)']);
        exit;
    }

    // Busca materias que estén en cátedras para ese curso y división
    $sql = "
        SELECT DISTINCT m.id_materia AS id, m.materia AS nombre
        FROM catedras c
        INNER JOIN materias m ON m.id_materia = c.id_materia
        WHERE c.id_curso = :curso AND c.id_division = :division
        ORDER BY m.materia ASC
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':curso' => $id_curso, ':division' => $id_division]);

    $materias = [];
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $materias[] = [
            'id'     => (int)$row['id'],
            'nombre' => (string)$row['nombre'],
        ];
    }

    echo json_encode(['exito' => true, 'materias' => $materias], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

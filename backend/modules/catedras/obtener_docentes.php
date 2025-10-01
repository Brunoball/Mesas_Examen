<?php
// backend/modules/obtener_docentes.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Filtro opcional: ?solo_activos=1
    $soloActivos = isset($_GET['solo_activos']) ? (int)$_GET['solo_activos'] : 0;

    $sql = "
        SELECT
            d.id_docente,
            d.docente,
            d.id_cargo,
            d.activo,
            DATE_FORMAT(d.fecha_carga, '%Y-%m-%d') AS fecha_carga
        FROM mesas_examen.docentes AS d
        " . ($soloActivos === 1 ? "WHERE d.activo = 1" : "") . "
        ORDER BY d.docente ASC
    ";

    $st = $pdo->query($sql);
    $docentes = $st->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['exito' => true, 'docentes' => $docentes], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error al obtener docentes: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

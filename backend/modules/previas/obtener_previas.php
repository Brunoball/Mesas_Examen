<?php
// backend/modules/previas/obtener_previas.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
    if ($pdo instanceof PDO) {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec("SET NAMES utf8mb4");
    } else {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    // Filtros opcionales
    $q   = isset($_GET['q'])   ? trim((string)$_GET['q'])   : '';
    $dni = isset($_GET['dni']) ? trim((string)$_GET['dni']) : '';
    $id  = isset($_GET['id'])  ? (int)$_GET['id'] : 0;

    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.anio,
            p.fecha_carga,
            p.id_materia,
            p.id_condicion,

            -- Nombres mostrables con alias que espera el frontend
            m.materia                                 AS materia_nombre,
            c.condicion                               AS condicion_nombre,
            cur_materia.nombre_curso                  AS materia_curso_nombre,
            div_materia.nombre_division               AS materia_division_nombre,
            CONCAT(cur_materia.nombre_curso, '° ', div_materia.nombre_division) AS materia_curso_division
        FROM previas p
        LEFT JOIN materias   m            ON m.id_materia            = p.id_materia
        LEFT JOIN condicion  c            ON c.id_condicion          = p.id_condicion
        LEFT JOIN curso      cur_materia  ON cur_materia.id_curso    = p.materia_id_curso
        LEFT JOIN division   div_materia  ON div_materia.id_division = p.materia_id_division
        /**WHERE**/
        ORDER BY p.fecha_carga DESC, p.alumno ASC
    ";

    $where  = [];
    $params = [];

    if ($id > 0) {
        $where[] = "p.id_previa = :id";
        $params[':id'] = $id;
    } elseif ($dni !== '') {
        $where[] = "p.dni LIKE :dni";
        $params[':dni'] = "%{$dni}%";
    } elseif ($q !== '') {
        $where[] = "p.alumno LIKE :q";
        $params[':q'] = "%{$q}%";
    }

    $sql = str_replace('/**WHERE**/', empty($where) ? '' : 'WHERE ' . implode(' AND ', $where), $sql);

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $previas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['exito' => true, 'previas' => $previas], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error al obtener las previas: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

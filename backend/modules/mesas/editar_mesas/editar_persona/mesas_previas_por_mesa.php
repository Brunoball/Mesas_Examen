<?php
// backend/modules/mesas/mesas_previas_por_mesa.php
//
// Devuelve todas las previas (alumnos) de una mesa dada,
// uniendo mesas.id_previa con previas.id_previa y trayendo
// los nombres reales de curso y división de la materia.
//
// Entrada (POST JSON o GET):
//   { "numero_mesa": 23 }
//
// Salida:
//   {
//     "exito": true,
//     "numero_mesa": 23,
//     "total": 3,
//     "data": [
//       {
//         "id_mesa": 101,
//         "numero_mesa": 23,
//         "id_previa": 287,
//         "dni": "40123456",
//         "alumno": "PEREZ, JUAN",
//         "materia_id_curso": 5,
//         "nombre_curso": "5º A",
//         "materia_id_division": 1,
//         "nombre_division": "1"
//       },
//       ...
//     ]
//   }

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../../../config/db.php';

    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $numeroMesa = null;

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input');
        $in  = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($in) && isset($in['numero_mesa'])) {
            $numeroMesa = (int) $in['numero_mesa'];
        }
    }

    if (!$numeroMesa && isset($_GET['numero_mesa'])) {
        $numeroMesa = (int) $_GET['numero_mesa'];
    }

    if (!$numeroMesa) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Número de mesa inválido.',
        ]);
        exit;
    }

    $sql = "
        SELECT
            m.id_mesa,
            m.numero_mesa,
            p.id_previa,
            p.dni,
            p.alumno,

            p.materia_id_curso,
            c.nombre_curso    AS nombre_curso,

            p.materia_id_division,
            d.nombre_division AS nombre_division

        FROM mesas AS m
        INNER JOIN previas AS p
            ON p.id_previa = m.id_previa
        LEFT JOIN curso AS c
            ON c.id_curso = p.materia_id_curso
        LEFT JOIN division AS d
            ON d.id_division = p.materia_id_division
        WHERE m.numero_mesa = :numero_mesa
        ORDER BY p.alumno, p.dni
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':numero_mesa' => $numeroMesa]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'exito'       => true,
        'numero_mesa' => $numeroMesa,
        'total'       => count($rows),
        'data'        => $rows,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error en el servidor al obtener previas de la mesa.',
        'detalle' => $e->getMessage(),
    ]);
}

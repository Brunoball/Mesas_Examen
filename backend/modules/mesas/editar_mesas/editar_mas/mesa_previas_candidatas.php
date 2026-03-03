<?php
// backend/modules/mesas/mesa_previas_candidatas.php
//
// Devuelve PREVIAS inscriptas (inscripcion=1) que coinciden en MATERIA
// con la mesa destino y que NO están asignadas a ningún numero_mesa.
// Incluye tanto:
// - previas que NO existen en `mesas`
// - previas que existen en `mesas` pero con numero_mesa IS NULL (sin número)
//
// Entrada JSON:
// { "numero_mesa_destino": 5, "fecha_objetivo": "...", "id_turno_objetivo": 2 }
//
// Respuesta:
// { exito:true, data:[ ... ] }

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../../../config/db.php';

    $raw = file_get_contents('php://input');
    $input = json_decode($raw ?: '[]', true);
    if (!is_array($input)) $input = [];

    $numeroMesaDestino = isset($input['numero_mesa_destino']) ? (int)$input['numero_mesa_destino'] : 0;
    if ($numeroMesaDestino <= 0) {
        echo json_encode(['exito' => true, 'data' => []], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ------------------------------------------------------------
    // 0) Materia de la mesa destino (caja desde la que abrís modal)
    // ------------------------------------------------------------
    $sqlMesaBase = "
        SELECT c.id_materia
        FROM mesas me
        INNER JOIN catedras c ON c.id_catedra = me.id_catedra
        WHERE me.numero_mesa = :numero_mesa
        ORDER BY me.id_mesa ASC
        LIMIT 1
    ";
    $st = $pdo->prepare($sqlMesaBase);
    $st->execute([':numero_mesa' => $numeroMesaDestino]);
    $base = $st->fetch(PDO::FETCH_ASSOC);

    if (!$base) {
        echo json_encode(['exito' => true, 'data' => []], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $idMateriaMesa = (int)$base['id_materia'];

    // ------------------------------------------------------------
    // 1) Candidatas:
    // - inscripcion = 1
    // - misma materia
    // - NO tienen asignado numero_mesa en `mesas`
    //   (pueden no existir o existir con numero_mesa NULL)
    //
    // Además traemos (si existe) el id_mesa "sin número" para info/debug.
    // ------------------------------------------------------------
    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            m.materia,
            cu.nombre_curso,
            di.nombre_division,
            CONCAT(
                COALESCE(cu.nombre_curso, ''),
                CASE WHEN cu.nombre_curso IS NOT NULL AND di.nombre_division IS NOT NULL THEN ' ' ELSE '' END,
                COALESCE(di.nombre_division, '')
            ) AS curso_div,

            -- Si ya existe una fila en mesas con numero_mesa NULL (sin número), la mostramos
            (
                SELECT me0.id_mesa
                FROM mesas me0
                WHERE me0.id_previa = p.id_previa
                  AND me0.numero_mesa IS NULL
                ORDER BY me0.id_mesa ASC
                LIMIT 1
            ) AS id_mesa_sin_numero

        FROM previas p
        INNER JOIN materias m ON m.id_materia = p.id_materia
        LEFT JOIN curso cu ON cu.id_curso = p.materia_id_curso
        LEFT JOIN division di ON di.id_division = p.materia_id_division
        WHERE
            p.inscripcion = 1
            AND p.activo = 1
            AND p.id_materia = :id_materia_mesa

            -- CLAVE: excluir solo las que ya están asignadas a un numero_mesa
            AND NOT EXISTS (
                SELECT 1
                FROM mesas me2
                WHERE me2.id_previa = p.id_previa
                  AND me2.numero_mesa IS NOT NULL
            )
        ORDER BY
            p.alumno ASC,
            m.materia ASC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([':id_materia_mesa' => $idMateriaMesa]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
        $idMesaSinNumero = $r['id_mesa_sin_numero'] !== null ? (int)$r['id_mesa_sin_numero'] : null;

        $out[] = [
            'id_previa'           => (int)$r['id_previa'],
            'dni'                 => (string)$r['dni'],
            'alumno'              => (string)$r['alumno'],
            'id_materia'          => (int)$r['id_materia'],
            'materia'             => (string)$r['materia'],
            'materia_id_curso'    => isset($r['materia_id_curso']) ? (int)$r['materia_id_curso'] : null,
            'materia_id_division' => isset($r['materia_id_division']) ? (int)$r['materia_id_division'] : null,
            'nombre_curso'        => $r['nombre_curso'] ?? null,
            'nombre_division'     => $r['nombre_division'] ?? null,
            'curso_div'           => trim((string)($r['curso_div'] ?? '')),
            'elegible'            => true,
            'motivo'              => null,

            // info extra (no rompe tu frontend)
            'id_mesa_sin_numero'  => $idMesaSinNumero,
        ];
    }

    echo json_encode(['exito' => true, 'data' => $out], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error obteniendo previas candidatas: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

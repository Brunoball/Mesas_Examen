<?php
// backend/modules/mesas/editar_mesas/editar_persona/mesas_opciones_mover_previa.php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../../../config/db.php';

    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Método no permitido'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true) ?? [];

    $idPrevia = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;

    if ($idPrevia <= 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'id_previa inválido'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * 1) Obtener info de la previa actual:
     *    - dni
     *    - materia
     *    - área
     *    - número de mesa actual
     */
    $sqlInfo = "
        SELECT 
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            mat.materia,
            mat.id_area,
            m.numero_mesa AS numero_mesa_actual
        FROM previas p
        INNER JOIN materias mat 
            ON mat.id_materia = p.id_materia
        INNER JOIN mesas m 
            ON m.id_previa = p.id_previa
        WHERE p.id_previa = :id_previa
        LIMIT 1
    ";

    $st = $pdo->prepare($sqlInfo);
    $st->execute([
        ':id_previa' => $idPrevia
    ]);

    $info = $st->fetch(PDO::FETCH_ASSOC);

    if (!$info) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'No se encontró la previa o no está asignada a ninguna mesa.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $dni          = trim((string)($info['dni'] ?? ''));
    $idMateria    = (int)$info['id_materia'];
    $idArea       = isset($info['id_area']) ? (int)$info['id_area'] : 0;
    $numeroActual = (int)$info['numero_mesa_actual'];

    if ($dni === '') {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La previa no tiene DNI válido.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($idArea <= 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La materia de la previa no tiene un área válida asignada.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /**
     * 2) Obtener mesas posibles:
     *    - del MISMO ÁREA
     *    - excluyendo la mesa actual
     *    - excluyendo cualquier mesa cuyo fecha+turno choque
     *      con OTRA previa del mismo DNI ya asignada
     *
     * Regla:
     *    un alumno NO puede rendir 2 materias el mismo día y turno
     */
    $sqlMesas = "
        SELECT 
            m.numero_mesa,
            MIN(m.fecha_mesa) AS fecha_mesa,
            MIN(m.id_turno) AS id_turno,
            MIN(t.turno) AS nombre_turno,
            MIN(m.id_docente) AS id_docente,
            MIN(d.docente) AS docente,
            MIN(mat2.id_materia) AS id_materia,
            MIN(mat2.materia) AS materia,
            MIN(mat2.id_area) AS id_area
        FROM mesas m
        INNER JOIN catedras c
            ON c.id_catedra = m.id_catedra
        INNER JOIN materias mat2
            ON mat2.id_materia = c.id_materia
        LEFT JOIN docentes d
            ON d.id_docente = m.id_docente
        LEFT JOIN turnos t
            ON t.id_turno = m.id_turno
        WHERE mat2.id_area = :id_area
          AND m.numero_mesa <> :numero_actual
          AND NOT EXISTS (
              SELECT 1
              FROM mesas mx
              INNER JOIN previas px 
                  ON px.id_previa = mx.id_previa
              WHERE px.dni = :dni
                AND px.activo = 1
                AND px.id_previa <> :id_previa
                AND (mx.fecha_mesa <=> m.fecha_mesa)
                AND (mx.id_turno <=> m.id_turno)
          )
        GROUP BY m.numero_mesa
        ORDER BY 
            MIN(m.fecha_mesa) ASC,
            MIN(m.id_turno) ASC,
            m.numero_mesa ASC
    ";

    $st2 = $pdo->prepare($sqlMesas);
    $st2->execute([
        ':id_area'       => $idArea,
        ':numero_actual' => $numeroActual,
        ':dni'           => $dni,
        ':id_previa'     => $idPrevia,
    ]);

    $mesasRaw = $st2->fetchAll(PDO::FETCH_ASSOC);

    $mesas = array_map(static function(array $m): array {
        return [
            'numero_mesa'  => isset($m['numero_mesa']) ? (int)$m['numero_mesa'] : 0,
            'fecha_mesa'   => $m['fecha_mesa'] ?? null,
            'id_turno'     => isset($m['id_turno']) ? (int)$m['id_turno'] : null,
            'nombre_turno' => $m['nombre_turno'] ?? null,
            'id_docente'   => isset($m['id_docente']) ? (int)$m['id_docente'] : null,
            'docente'      => $m['docente'] ?? '',
            'id_materia'   => isset($m['id_materia']) ? (int)$m['id_materia'] : null,
            'materia'      => $m['materia'] ?? '',
            'id_area'      => isset($m['id_area']) ? (int)$m['id_area'] : null,
        ];
    }, $mesasRaw);

    echo json_encode([
        'exito' => true,
        'previa' => [
            'id_previa'          => (int)$info['id_previa'],
            'dni'                => $dni,
            'alumno'             => $info['alumno'],
            'id_materia'         => $idMateria,
            'materia'            => $info['materia'],
            'id_area'            => $idArea,
            'numero_mesa_actual' => $numeroActual,
        ],
        'mesas' => $mesas,
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error en el servidor: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
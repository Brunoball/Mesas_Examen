<?php
// backend/modules/mesas/mesas_opciones_mover_previa.php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../../../config/db.php';

    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Método no permitido'
        ]);
        exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true) ?? [];

    $idPrevia = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;
    if ($idPrevia <= 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'id_previa inválido'
        ]);
        exit;
    }

    // 1) Info de la previa + materia + mesa actual
    $sqlInfo = "
        SELECT 
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            mat.materia,
            m.numero_mesa AS numero_mesa_actual
        FROM previas p
        INNER JOIN materias mat ON mat.id_materia = p.id_materia
        INNER JOIN mesas m      ON m.id_previa   = p.id_previa
        WHERE p.id_previa = :id_previa
        LIMIT 1
    ";
    $st = $pdo->prepare($sqlInfo);
    $st->execute([':id_previa' => $idPrevia]);
    $info = $st->fetch(PDO::FETCH_ASSOC);

    if (!$info) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'No se encontró la previa o no está asignada a ninguna mesa.'
        ]);
        exit;
    }

    $idMateria    = (int)$info['id_materia'];
    $numeroActual = (int)$info['numero_mesa_actual'];

    // 2) Mesas de la MISMA materia (una fila por numero_mesa)
    $sqlMesas = "
        SELECT 
            m.numero_mesa,
            MIN(m.fecha_mesa)   AS fecha_mesa,
            MIN(m.id_turno)     AS id_turno,
            MIN(t.turno)        AS nombre_turno,
            MIN(m.id_docente)   AS id_docente,
            MIN(d.docente)      AS docente,
            MIN(mat2.materia)   AS materia
        FROM mesas m
        INNER JOIN catedras  c    ON c.id_catedra   = m.id_catedra
        INNER JOIN materias  mat2 ON mat2.id_materia = c.id_materia
        LEFT  JOIN docentes  d    ON d.id_docente   = m.id_docente
        LEFT  JOIN turnos    t    ON t.id_turno     = m.id_turno
        WHERE mat2.id_materia = :id_materia
          AND m.numero_mesa <> :numero_actual
        GROUP BY m.numero_mesa
        ORDER BY fecha_mesa, id_turno, numero_mesa
    ";

    $st2 = $pdo->prepare($sqlMesas);
    $st2->execute([
        ':id_materia'    => $idMateria,
        ':numero_actual' => $numeroActual,
    ]);
    $mesas = $st2->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'exito' => true,
        'previa' => [
            'id_previa'          => (int)$info['id_previa'],
            'dni'                => $info['dni'],
            'alumno'             => $info['alumno'],
            'id_materia'         => $idMateria,
            'materia'            => $info['materia'],
            'numero_mesa_actual' => $numeroActual,
        ],
        'mesas' => $mesas,
    ]);

} catch (Throwable $e) {
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error en el servidor: ' . $e->getMessage(),
    ]);
}

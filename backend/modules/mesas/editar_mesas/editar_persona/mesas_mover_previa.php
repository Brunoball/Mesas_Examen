<?php
// backend/modules/mesas/editar_mesas/editar_persona/mesas_mover_previa.php

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
        http_response_code(405);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Método no permitido (use POST).',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $raw = file_get_contents('php://input');
    $in  = json_decode($raw, true) ?? [];

    $idPrevia          = isset($in['id_previa']) ? (int)$in['id_previa'] : 0;
    $numeroMesaDestino = isset($in['numero_mesa_destino']) ? (int)$in['numero_mesa_destino'] : 0;

    if ($idPrevia <= 0 || $numeroMesaDestino <= 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Parámetros inválidos (id_previa o numero_mesa_destino).',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =========================================================
    // 1) ORIGEN: mesa actual de la previa + materia + área + dni
    // =========================================================
    $sqlOrigen = "
        SELECT 
            m.id_mesa,
            m.numero_mesa      AS numero_mesa_origen,
            m.id_catedra       AS id_catedra_origen,
            m.id_docente       AS id_docente_origen,
            m.fecha_mesa       AS fecha_mesa_origen,
            m.id_turno         AS id_turno_origen,
            p.id_previa,
            p.id_materia       AS id_materia_previa,
            p.dni,
            p.alumno,
            mat.materia        AS materia_previa,
            mat.id_area        AS id_area_previa
        FROM mesas m
        INNER JOIN previas p 
            ON p.id_previa = m.id_previa
        INNER JOIN materias mat
            ON mat.id_materia = p.id_materia
        WHERE m.id_previa = :id_previa
        LIMIT 1
    ";
    $stOrigen = $pdo->prepare($sqlOrigen);
    $stOrigen->execute([
        ':id_previa' => $idPrevia
    ]);
    $origen = $stOrigen->fetch(PDO::FETCH_ASSOC);

    if (!$origen) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La previa no está asignada a ninguna mesa.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $numeroMesaOrigen = (int)$origen['numero_mesa_origen'];
    $idMateriaPrevia  = (int)$origen['id_materia_previa'];
    $materiaPrevia    = (string)($origen['materia_previa'] ?? '');
    $idAreaPrevia     = isset($origen['id_area_previa']) ? (int)$origen['id_area_previa'] : 0;
    $dniPrevia        = trim((string)($origen['dni'] ?? ''));

    if ($idAreaPrevia <= 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La materia de la previa no tiene un área válida asignada.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($dniPrevia === '') {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La previa no tiene DNI válido.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =========================================================
    // 2) DESTINO: plantilla de la mesa elegida + materia + área
    // =========================================================
    $sqlDestino = "
        SELECT 
            m.numero_mesa      AS numero_mesa_destino,
            m.id_catedra       AS id_catedra_destino,
            m.id_docente       AS id_docente_destino,
            m.fecha_mesa       AS fecha_mesa_destino,
            m.id_turno         AS id_turno_destino,
            c.id_materia       AS id_materia_destino,
            mat.materia        AS materia_destino,
            mat.id_area        AS id_area_destino
        FROM mesas m
        INNER JOIN catedras c 
            ON c.id_catedra = m.id_catedra
        INNER JOIN materias mat
            ON mat.id_materia = c.id_materia
        WHERE m.numero_mesa = :numero_destino
        LIMIT 1
    ";
    $stDestino = $pdo->prepare($sqlDestino);
    $stDestino->execute([
        ':numero_destino' => $numeroMesaDestino
    ]);
    $dest = $stDestino->fetch(PDO::FETCH_ASSOC);

    if (!$dest) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La mesa destino no existe.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $idMateriaDestino = (int)$dest['id_materia_destino'];
    $materiaDestino   = (string)($dest['materia_destino'] ?? '');
    $idAreaDestino    = isset($dest['id_area_destino']) ? (int)$dest['id_area_destino'] : 0;
    $fechaDestino     = $dest['fecha_mesa_destino'] ?? null;
    $idTurnoDestino   = isset($dest['id_turno_destino']) ? (int)$dest['id_turno_destino'] : null;

    if ($idAreaDestino <= 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La mesa destino no tiene un área válida asignada.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =========================================================
    // 3) Validación: misma ÁREA
    // =========================================================
    if ($idAreaPrevia !== $idAreaDestino) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La mesa destino no corresponde a la misma área de la previa.',
            'debug'   => [
                'id_previa'           => $idPrevia,
                'numero_mesa_origen'  => $numeroMesaOrigen,
                'numero_mesa_destino' => $numeroMesaDestino,
                'id_materia_previa'   => $idMateriaPrevia,
                'materia_previa'      => $materiaPrevia,
                'id_area_previa'      => $idAreaPrevia,
                'id_materia_destino'  => $idMateriaDestino,
                'materia_destino'     => $materiaDestino,
                'id_area_destino'     => $idAreaDestino,
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =========================================================
    // 4) Validación: el mismo alumno no puede rendir
    //    otra materia el mismo día y turno
    // =========================================================
    $sqlConflicto = "
        SELECT 
            px.id_previa,
            px.alumno,
            mx.numero_mesa,
            mx.fecha_mesa,
            mx.id_turno
        FROM mesas mx
        INNER JOIN previas px
            ON px.id_previa = mx.id_previa
        WHERE px.dni = :dni
          AND px.activo = 1
          AND px.id_previa <> :id_previa
          AND (mx.fecha_mesa <=> :fecha_destino)
          AND (mx.id_turno <=> :id_turno_destino)
        LIMIT 1
    ";
    $stConf = $pdo->prepare($sqlConflicto);
    $stConf->execute([
        ':dni'              => $dniPrevia,
        ':id_previa'        => $idPrevia,
        ':fecha_destino'    => $fechaDestino,
        ':id_turno_destino' => $idTurnoDestino,
    ]);
    $conflicto = $stConf->fetch(PDO::FETCH_ASSOC);

    if ($conflicto) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'El alumno ya tiene otra mesa asignada en ese mismo día y turno.',
            'debug'   => [
                'dni'                  => $dniPrevia,
                'id_previa_actual'     => $idPrevia,
                'numero_mesa_destino'  => $numeroMesaDestino,
                'fecha_destino'        => $fechaDestino,
                'id_turno_destino'     => $idTurnoDestino,
                'conflicto_id_previa'  => (int)$conflicto['id_previa'],
                'conflicto_numero_mesa'=> (int)$conflicto['numero_mesa'],
                'conflicto_fecha'      => $conflicto['fecha_mesa'],
                'conflicto_id_turno'   => isset($conflicto['id_turno']) ? (int)$conflicto['id_turno'] : null,
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =========================================================
    // 5) Actualizar la mesa de esta previa con los datos destino
    // =========================================================
    $sqlUpdate = "
        UPDATE mesas
        SET 
            numero_mesa = :numero_mesa_nuevo,
            id_catedra  = :id_catedra_nuevo,
            id_docente  = :id_docente_nuevo,
            fecha_mesa  = :fecha_mesa_nueva,
            id_turno    = :id_turno_nuevo
        WHERE id_previa = :id_previa
        LIMIT 1
    ";
    $stUpd = $pdo->prepare($sqlUpdate);
    $stUpd->execute([
        ':numero_mesa_nuevo' => (int)$dest['numero_mesa_destino'],
        ':id_catedra_nuevo'  => (int)$dest['id_catedra_destino'],
        ':id_docente_nuevo'  => (int)$dest['id_docente_destino'],
        ':fecha_mesa_nueva'  => $dest['fecha_mesa_destino'],
        ':id_turno_nuevo'    => (int)$dest['id_turno_destino'],
        ':id_previa'         => $idPrevia,
    ]);

    if ($stUpd->rowCount() === 0) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'No se pudo actualizar la mesa de la previa.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'exito'   => true,
        'mensaje' => 'Previa movida correctamente a la nueva mesa.',
        'data'    => [
            'id_previa'            => $idPrevia,
            'alumno'               => $origen['alumno'],
            'dni'                  => $dniPrevia,
            'numero_mesa_origen'   => $numeroMesaOrigen,
            'numero_mesa_destino'  => (int)$dest['numero_mesa_destino'],
            'id_catedra_destino'   => (int)$dest['id_catedra_destino'],
            'id_docente_destino'   => (int)$dest['id_docente_destino'],
            'fecha_mesa_destino'   => $dest['fecha_mesa_destino'],
            'id_turno_destino'     => (int)$dest['id_turno_destino'],
            'id_materia_previa'    => $idMateriaPrevia,
            'materia_previa'       => $materiaPrevia,
            'id_area_previa'       => $idAreaPrevia,
            'id_materia_destino'   => $idMateriaDestino,
            'materia_destino'      => $materiaDestino,
            'id_area_destino'      => $idAreaDestino,
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error en el servidor: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
} 
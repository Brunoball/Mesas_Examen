<?php
// backend/modules/mesas/mesas_mover_previa.php
//
// Mueve una PREVIA (id_previa) desde su mesa actual
// a otra mesa indicada por numero_mesa_destino.
//
// Pasos:
//  1) Valida método y payload (id_previa, numero_mesa_destino).
//  2) Busca la mesa ORIGEN de esa previa (m.id_previa).
//  3) Busca una mesa DESTINO por numero_mesa_destino.
//  4) Verifica que la materia de la previa coincida con la materia de la mesa destino.
//  5) Actualiza la fila de mesas de esa previa copiando:
//       - numero_mesa (nuevo)
//       - id_catedra
//       - id_docente
//       - fecha_mesa
//       - id_turno
//  6) Devuelve JSON con info de origen/destino.
//

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
        http_response_code(405);
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Método no permitido (use POST).',
        ]);
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
        ]);
        exit;
    }

    // --- 1) ORIGEN: mesa actual de la previa + materia de la previa ---
    $sqlOrigen = "
        SELECT 
            m.id_mesa,
            m.numero_mesa      AS numero_mesa_origen,
            m.id_catedra       AS id_catedra_origen,
            m.id_docente       AS id_docente_origen,
            m.fecha_mesa       AS fecha_mesa_origen,
            m.id_turno         AS id_turno_origen,
            p.id_materia       AS id_materia_previa,
            p.alumno,
            p.dni
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        WHERE m.id_previa = :id_previa
        LIMIT 1
    ";
    $stOrigen = $pdo->prepare($sqlOrigen);
    $stOrigen->execute([':id_previa' => $idPrevia]);
    $origen = $stOrigen->fetch(PDO::FETCH_ASSOC);

    if (!$origen) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La previa no está asignada a ninguna mesa.',
        ]);
        exit;
    }

    $numeroMesaOrigen = (int)$origen['numero_mesa_origen'];
    $idMateriaPrevia  = (int)$origen['id_materia_previa'];

    // --- 2) DESTINO: cualquier fila de esa mesa (se toma como plantilla) ---
    $sqlDestino = "
        SELECT 
            m.numero_mesa      AS numero_mesa_destino,
            m.id_catedra       AS id_catedra_destino,
            m.id_docente       AS id_docente_destino,
            m.fecha_mesa       AS fecha_mesa_destino,
            m.id_turno         AS id_turno_destino,
            c.id_materia       AS id_materia_destino
        FROM mesas m
        INNER JOIN catedras c ON c.id_catedra = m.id_catedra
        WHERE m.numero_mesa = :numero_destino
        LIMIT 1
    ";
    $stDestino = $pdo->prepare($sqlDestino);
    $stDestino->execute([':numero_destino' => $numeroMesaDestino]);
    $dest = $stDestino->fetch(PDO::FETCH_ASSOC);

    if (!$dest) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La mesa destino no existe.',
        ]);
        exit;
    }

    $idMateriaDestino = (int)$dest['id_materia_destino'];

    // --- 3) Validación extra: misma materia ---
    if ($idMateriaPrevia !== $idMateriaDestino) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'La mesa destino no corresponde a la misma materia de la previa.',
        ]);
        exit;
    }

    // --- 4) Actualizar mesa de esa previa con los datos de la mesa destino ---
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
        ]);
        exit;
    }

    echo json_encode([
        'exito'   => true,
        'mensaje' => 'Previa movida correctamente a la nueva mesa.',
        'data'    => [
            'id_previa'            => $idPrevia,
            'alumno'               => $origen['alumno'],
            'dni'                  => $origen['dni'],
            'numero_mesa_origen'   => $numeroMesaOrigen,
            'numero_mesa_destino'  => (int)$dest['numero_mesa_destino'],
            'id_catedra_destino'   => (int)$dest['id_catedra_destino'],
            'id_docente_destino'   => (int)$dest['id_docente_destino'],
            'fecha_mesa_destino'   => $dest['fecha_mesa_destino'],
            'id_turno_destino'     => (int)$dest['id_turno_destino'],
        ],
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error en el servidor: ' . $e->getMessage(),
    ]);
}

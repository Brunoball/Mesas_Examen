<?php
// backend/modules/mesas/mesa_agregar_alumno.php
//
// Agrega una PREVIA a la tabla `mesas` para un número de mesa
// dado, copiando prioridad / fecha / turno / docente de una mesa existente
// con ese numero_mesa y reemplazando solo id_previa e id_catedra.
//
// Entrada (JSON):
//   {
//     "numero_mesa": 35,
//     "id_previa": 276
//   }
//
// Respuesta:
//   { "exito": true, "mensaje": "...", "id_mesa": 123 }

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/../../../../config/db.php';

    $raw = file_get_contents('php://input');
    $input = json_decode($raw ?: '[]', true);
    if (!is_array($input)) {
        throw new RuntimeException('Body JSON inválido.');
    }

    $numeroMesa = isset($input['numero_mesa']) ? (int)$input['numero_mesa'] : 0;
    $idPrevia   = isset($input['id_previa']) ? (int)$input['id_previa'] : 0;

    if ($numeroMesa <= 0 || $idPrevia <= 0) {
        throw new RuntimeException('Parámetros incompletos: numero_mesa o id_previa inválidos.');
    }

    // ===========================
    // 1) Verificar que la previa exista
    // ===========================
    $sqlPrev = "
        SELECT
            id_previa,
            id_materia,
            materia_id_curso,
            materia_id_division
        FROM previas
        WHERE id_previa = :id_previa
        LIMIT 1
    ";
    $stPrev = $pdo->prepare($sqlPrev);
    $stPrev->execute([':id_previa' => $idPrevia]);
    $previa = $stPrev->fetch(PDO::FETCH_ASSOC);

    if (!$previa) {
        throw new RuntimeException('La previa indicada no existe.');
    }

    $idMateria         = (int)$previa['id_materia'];
    $materiaIdCurso    = (int)$previa['materia_id_curso'];
    $materiaIdDivision = (int)$previa['materia_id_division'];

    // ===========================
    // 2) Verificar que NO exista ya una mesa con esa previa
    // ===========================
    $sqlExists = "
        SELECT id_mesa
        FROM mesas
        WHERE id_previa = :id_previa
        LIMIT 1
    ";
    $stExists = $pdo->prepare($sqlExists);
    $stExists->execute([':id_previa' => $idPrevia]);
    $yaTieneMesa = $stExists->fetchColumn();

    if ($yaTieneMesa) {
        throw new RuntimeException('Esta previa ya tiene una mesa asignada.');
    }

    // ===========================
    // 3) Buscar cátedra por materia/curso/división
    // ===========================
    $sqlCat = "
        SELECT id_catedra
        FROM catedras
        WHERE id_materia = :id_materia
          AND id_curso   = :id_curso
          AND id_division = :id_division
        LIMIT 1
    ";
    $stCat = $pdo->prepare($sqlCat);
    $stCat->execute([
        ':id_materia'  => $idMateria,
        ':id_curso'    => $materiaIdCurso,
        ':id_division' => $materiaIdDivision,
    ]);
    $cat = $stCat->fetch(PDO::FETCH_ASSOC);

    if (!$cat) {
        throw new RuntimeException('No se encontró cátedra para esa materia/curso/división.');
    }

    $idCatedra = (int)$cat['id_catedra'];

    // ===========================
    // 4) Tomar la "mesa base" de ese número de mesa
    //    (misma prioridad, docente, fecha y turno)
    // ===========================
    $sqlBase = "
        SELECT
            prioridad,
            id_docente,
            fecha_mesa,
            id_turno
        FROM mesas
        WHERE numero_mesa = :numero_mesa
        ORDER BY id_mesa ASC
        LIMIT 1
    ";
    $stBase = $pdo->prepare($sqlBase);
    $stBase->execute([':numero_mesa' => $numeroMesa]);
    $base = $stBase->fetch(PDO::FETCH_ASSOC);

    if (!$base) {
        throw new RuntimeException('No existe ninguna mesa con ese número de mesa.');
    }

    $prioridadBase = isset($base['prioridad']) ? (int)$base['prioridad'] : 0;
    $idDocenteBase = isset($base['id_docente']) ? (int)$base['id_docente'] : null;
    $fechaMesaBase = $base['fecha_mesa'] ?? null;
    $idTurnoBase   = isset($base['id_turno']) ? (int)$base['id_turno'] : null;

    // ===========================
    // 5) Insertar en `mesas`
    //    - mismo numero_mesa, prioridad, docente, fecha y turno
    //    - solo cambian id_previa e id_catedra
    // ===========================
    $sqlIns = "
        INSERT INTO mesas
            (numero_mesa, prioridad, id_catedra, id_previa, id_docente, fecha_mesa, id_turno)
        VALUES
            (:numero_mesa, :prioridad, :id_catedra, :id_previa, :id_docente, :fecha_mesa, :id_turno)
    ";
    $stIns = $pdo->prepare($sqlIns);
    $stIns->execute([
        ':numero_mesa' => $numeroMesa,
        ':prioridad'   => $prioridadBase, // se mantiene igual
        ':id_catedra'  => $idCatedra,     // nueva cátedra según la previa
        ':id_previa'   => $idPrevia,
        ':id_docente'  => $idDocenteBase, // mismo docente que la mesa base
        ':fecha_mesa'  => $fechaMesaBase,
        ':id_turno'    => $idTurnoBase,
    ]);

    $idMesaNueva = (int)$pdo->lastInsertId();

    echo json_encode([
        'exito'   => true,
        'mensaje' => 'Alumno agregado a la mesa correctamente.',
        'id_mesa' => $idMesaNueva,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al agregar alumno a la mesa: ' . $e->getMessage(),
    ]);
}

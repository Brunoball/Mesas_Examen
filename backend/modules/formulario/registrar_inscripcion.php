<?php
// backend/modules/formulario/registrar_inscripcion.php
// Inserta filas en mesas_examen.inscripcion para las materias seleccionadas

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
    exit;
}

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);

$dni      = isset($in['dni']) ? preg_replace('/\D+/', '', $in['dni']) : '';
$materias = isset($in['materias']) && is_array($in['materias']) ? $in['materias'] : [];

if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
    http_response_code(422);
    echo json_encode(['exito' => false, 'mensaje' => 'DNI inválido']);
    exit;
}
if (!$materias) {
    http_response_code(422);
    echo json_encode(['exito' => false, 'mensaje' => 'No se enviaron materias a inscribir']);
    exit;
}

// Conexión PDO
require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

try {
    // Normalizamos IDs de materias a enteros únicos
    $materias = array_values(array_unique(array_map('intval', $materias)));
    $placeholders = implode(',', array_fill(0, count($materias), '?'));

    // Traemos desde PREVIAS los datos necesarios de cada materia seleccionada
    // (así no dependemos de que el front mande toda la info)
    $sqlPrevias = "
        SELECT 
            p.dni,
            p.alumno,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion
        FROM mesas_examen.previas p
        WHERE p.dni = ?
          AND p.id_materia IN ($placeholders)
        ORDER BY p.id_materia
    ";

    $st = $pdo->prepare($sqlPrevias);
    $st->execute(array_merge([$dni], $materias));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    if (!$rows) {
        echo json_encode(['exito' => false, 'mensaje' => 'No se encontraron esas materias para el DNI en previas.']);
        exit;
    }

    // Preparamos INSERT a la tabla inscripcion (igual que previas)
    $anioActual = (int)date('Y');

    $sqlInsert = "
        INSERT INTO mesas_examen.inscripcion
            (dni, alumno, cursando_id_curso, cursando_id_division,
             id_materia, materia_id_curso, materia_id_division,
             id_condicion, anio)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ";
    $ins = $pdo->prepare($sqlInsert);

    // (Opcional) si agregaste UNIQUE(dni,id_materia,anio), podés usar try/catch y contar “ignorados”.
    $pdo->beginTransaction();
    $insertados = 0;

    foreach ($rows as $r) {
        $ok = $ins->execute([
            $r['dni'],
            $r['alumno'],
            (int)$r['cursando_id_curso'],
            (int)$r['cursando_id_division'],
            (int)$r['id_materia'],
            (int)$r['materia_id_curso'],
            (int)$r['materia_id_division'],
            (int)$r['id_condicion'],
            $anioActual,
        ]);
        if ($ok) $insertados++;
    }

    $pdo->commit();

    echo json_encode([
        'exito' => true,
        'mensaje' => 'Inscripción registrada',
        'insertados' => $insertados,
        'anio' => $anioActual,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error al registrar inscripción',
        'detalle' => $e->getMessage(),
    ]);
}

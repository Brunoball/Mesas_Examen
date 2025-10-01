<?php
// backend/modules/formulario/registrar_inscripcion.php
// Marca en previas la columna inscripcion=1 para las materias seleccionadas (por DNI)

header('Content-Type: application/json; charset=utf-8');

// Siempre 200 (sin 4xx), devolvemos { exito:false, mensaje, detalle? } cuando haya problemas
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
    exit;
}

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true);

$dni      = isset($in['dni']) ? preg_replace('/\D+/', '', $in['dni']) : '';
$materias = isset($in['materias']) && is_array($in['materias']) ? $in['materias'] : [];

if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
    echo json_encode(['exito' => false, 'mensaje' => 'DNI inválido']);
    exit;
}

$materias = array_values(array_unique(array_filter(array_map('intval', $materias), fn($x) => $x > 0)));
if (!count($materias)) {
    echo json_encode(['exito' => false, 'mensaje' => 'No se enviaron materias a inscribir']);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

try {
    if (!($pdo instanceof PDO)) {
        echo json_encode(['exito' => false, 'mensaje' => 'Conexión PDO no inicializada']);
        exit;
    }

    // Config PDO
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, true);

    $anioActual = (int)date('Y');
    $inPlace    = implode(',', array_fill(0, count($materias), '?'));

    // Transacción
    $pdo->beginTransaction();

    // 1) Verificar que EXISTEN esas previas para el DNI (id_condicion=3) y traer su estado actual
    $sqlCheck = "
        SELECT 
            p.id_materia,
            COALESCE(p.inscripcion,0) AS inscripcion
        FROM previas AS p
        WHERE p.dni = ?
          AND p.id_condicion = 3
          AND p.id_materia IN ($inPlace)
        ORDER BY p.id_materia
        FOR UPDATE
    ";
    $stChk = $pdo->prepare($sqlCheck);
    $stChk->execute(array_merge([$dni], $materias));
    $rows = $stChk->fetchAll();

    if (!$rows || count($rows) !== count($materias)) {
        // Alguna de las materias no existe como previa condición 3 para ese DNI
        $pdo->rollBack();
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'Alguna materia no corresponde a previas (condición 3) para ese DNI.'
        ]);
        exit;
    }

    // ¿Cuántas ya estaban inscriptas (=1)?
    $yaMarcadas = array_sum(array_map(fn($r) => (int)$r['inscripcion'] === 1 ? 1 : 0, $rows));

    if ($yaMarcadas === count($materias)) {
        // Todas ya estaban marcadas como inscriptas
        $pdo->rollBack();
        echo json_encode([
            'exito'            => false,
            'mensaje'          => 'Este alumno ya fue inscripto en las materias seleccionadas.',
            'ya_inscripto'     => true,
            'anio_inscripcion' => $anioActual
        ]);
        exit;
    }

    // 2) Marcar PREVIAS: inscripcion = 1 para esas materias del DNI si estaban 0/NULL
    $sqlUpdate = "
        UPDATE previas
        SET inscripcion = 1
        WHERE dni = ?
          AND id_condicion = 3
          AND id_materia IN ($inPlace)
          AND COALESCE(inscripcion,0) = 0
    ";
    $stUpd = $pdo->prepare($sqlUpdate);
    $stUpd->execute(array_merge([$dni], $materias));
    $marcadas = $stUpd->rowCount(); // cantidad de filas que pasaron de 0/NULL -> 1

    $pdo->commit();

    // Para no romper tu front: 'insertados' = materias marcadas
    echo json_encode([
        'exito'      => true,
        'mensaje'    => 'Inscripción registrada correctamente.',
        'insertados' => $marcadas,
        'marcadas'   => $marcadas,
        'anio'       => $anioActual
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al registrar la inscripción.',
        'detalle' => $e->getMessage()
    ]);
}

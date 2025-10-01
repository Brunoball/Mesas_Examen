<?php
// backend/modules/formulario/buscar_previas.php
// Responde siempre 200. En validaciones/errores: { exito:false, mensaje, detalle?, ya_inscripto? }

header('Content-Type: application/json; charset=utf-8');

// Solo POST (sin 4xx para no ensuciar consola)
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido']);
    exit;
}

$raw = file_get_contents('php://input');
$in  = json_decode($raw, true);

$dni   = isset($in['dni'])   ? preg_replace('/\D+/', '', $in['dni']) : '';
$gmail = isset($in['gmail']) ? trim($in['gmail']) : '';

if ($dni === '' || !preg_match('/^\d{7,9}$/', $dni)) {
    echo json_encode(['exito' => false, 'mensaje' => 'DNI inválido']);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

try {
    if ($pdo instanceof PDO) {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    }

    $anioActual = (int)date('Y');

    // ===== 1) Traer previas PENDIENTES (id_condicion=3 y inscripcion=0) =====
    $sqlPend = "
        SELECT 
            p.dni,
            p.alumno,
            p.anio,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            COALESCE(p.inscripcion,0) AS inscripcion,
            m.id_materia,
            m.materia
        FROM mesas_examen.previas AS p
        INNER JOIN mesas_examen.materias AS m
            ON m.id_materia = p.id_materia
        WHERE p.dni = :dni
          AND p.id_condicion = 3
          AND COALESCE(p.inscripcion,0) = 0
        ORDER BY m.materia ASC
    ";
    $stPend = $pdo->prepare($sqlPend);
    $stPend->execute([':dni' => $dni]);
    $pendientes = $stPend->fetchAll();

    if ($pendientes && count($pendientes) > 0) {
        // Armamos respuesta con materias pendientes
        $alumnoNombre = $pendientes[0]['alumno'];
        $cursando = [
            'curso'    => isset($pendientes[0]['cursando_id_curso'])    ? (int)$pendientes[0]['cursando_id_curso']    : null,
            'division' => isset($pendientes[0]['cursando_id_division'])  ? (int)$pendientes[0]['cursando_id_division'] : null,
        ];
        $materias = array_map(function ($r) {
            return [
                'id_materia'   => (int)$r['id_materia'],
                'materia'      => (string)$r['materia'],
                'curso'        => isset($r['materia_id_curso'])    ? (int)$r['materia_id_curso']    : null,
                'division'     => isset($r['materia_id_division']) ? (int)$r['materia_id_division'] : null,
                'id_condicion' => (int)$r['id_condicion'],
                'anio'         => isset($r['anio']) ? (int)$r['anio'] : null,
            ];
        }, $pendientes);

        echo json_encode([
            'exito'            => true,
            'alumno'           => [
                'dni'         => $dni,
                'nombre'      => $alumnoNombre,
                'anio_actual' => $anioActual,
                'cursando'    => $cursando,
                'materias'    => $materias,
            ],
            'gmail'            => $gmail,
            'ya_inscripto'     => false,
            'anio_inscripcion' => $anioActual
        ]);
        exit;
    }

    // ===== 2) Si no hay pendientes, verificar si TODAS están inscriptas (inscripcion=1) =====
    $sqlMarcadas = "
        SELECT COUNT(*) AS c
        FROM mesas_examen.previas AS p
        WHERE p.dni = :dni
          AND p.id_condicion = 3
          AND COALESCE(p.inscripcion,0) = 1
    ";
    $stMarc = $pdo->prepare($sqlMarcadas);
    $stMarc->execute([':dni' => $dni]);
    $cantMarcadas = (int)$stMarc->fetchColumn();

    $sqlTotalCond3 = "
        SELECT COUNT(*) AS c
        FROM mesas_examen.previas AS p
        WHERE p.dni = :dni
          AND p.id_condicion = 3
    ";
    $stTot = $pdo->prepare($sqlTotalCond3);
    $stTot->execute([':dni' => $dni]);
    $cantCond3 = (int)$stTot->fetchColumn();

    if ($cantCond3 > 0 && $cantMarcadas === $cantCond3) {
        // Todas las previas condición 3 ya fueron marcadas como inscriptas
        echo json_encode([
            'exito'            => false,
            'mensaje'          => 'Este alumno ya fue inscripto en las mesas de examen.',
            'ya_inscripto'     => true,
            'anio_inscripcion' => $anioActual,
        ]);
        exit;
    }

    // ===== 3) Si no hay pendientes y tampoco marcadas, entonces NO hay previas condición 3 =====
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'No se encontraron materias previas para ese DNI.',
        'ya_inscripto' => false
    ]);
} catch (Throwable $e) {
    // 200 con exito:false (no 5xx)
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al consultar previas.',
        'detalle' => $e->getMessage(), // útil durante pruebas
    ]);
}

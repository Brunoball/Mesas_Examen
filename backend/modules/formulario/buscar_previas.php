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

    // ===== 1) Previas PENDIENTES (id_condicion=3 e inscripcion=0) con nombres de curso/división =====
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
            m.materia,

            -- Nombres del curso/división que está cursando actualmente
            c_cur.nombre_curso      AS cursando_curso_nombre,
            d_cur.nombre_division   AS cursando_division_nombre,

            -- Nombres del curso/división asociados a la materia
            c_mat.nombre_curso      AS materia_curso_nombre,
            d_mat.nombre_division   AS materia_division_nombre

        FROM previas AS p
        INNER JOIN materias  AS m     ON m.id_materia    = p.id_materia
        LEFT  JOIN curso     AS c_cur ON c_cur.id_curso  = p.cursando_id_curso
        LEFT  JOIN division  AS d_cur ON d_cur.id_division = p.cursando_id_division
        LEFT  JOIN curso     AS c_mat ON c_mat.id_curso  = p.materia_id_curso
        LEFT  JOIN division  AS d_mat ON d_mat.id_division = p.materia_id_division
        WHERE p.dni = :dni
          AND p.id_condicion = 3
          AND COALESCE(p.inscripcion,0) = 0
        ORDER BY m.materia ASC
    ";
    $stPend = $pdo->prepare($sqlPend);
    $stPend->execute([':dni' => $dni]);
    $pendientes = $stPend->fetchAll();

    if ($pendientes && count($pendientes) > 0) {
        // Armamos respuesta con materias pendientes + nombres reales de curso/división
        $alumnoNombre = $pendientes[0]['alumno'];

        // Cursando actual (incluye IDs y nombres)
        $cursando = [
            'curso_id'     => isset($pendientes[0]['cursando_id_curso'])    ? (int)$pendientes[0]['cursando_id_curso']    : null,
            'division_id'  => isset($pendientes[0]['cursando_id_division']) ? (int)$pendientes[0]['cursando_id_division'] : null,
            'curso'        => $pendientes[0]['cursando_curso_nombre']    ?? (isset($pendientes[0]['cursando_id_curso'])    ? (string)$pendientes[0]['cursando_id_curso']    : null),
            'division'     => $pendientes[0]['cursando_division_nombre'] ?? (isset($pendientes[0]['cursando_id_division']) ? (string)$pendientes[0]['cursando_id_division'] : null),
        ];

        // Materias (incluye IDs y nombres de curso/división de cada materia)
        $materias = array_map(function ($r) {
            return [
                'id_materia'   => (int)$r['id_materia'],
                'materia'      => (string)$r['materia'],

                'curso_id'     => isset($r['materia_id_curso'])    ? (int)$r['materia_id_curso']    : null,
                'division_id'  => isset($r['materia_id_division']) ? (int)$r['materia_id_division'] : null,

                // Para mostrar: (Curso X • Div. Y)
                'curso'        => $r['materia_curso_nombre']    ?? (isset($r['materia_id_curso'])    ? (string)$r['materia_id_curso']    : null),
                'division'     => $r['materia_division_nombre'] ?? (isset($r['materia_id_division']) ? (string)$r['materia_id_division'] : null),

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
        FROM previas AS p
        WHERE p.dni = :dni
          AND p.id_condicion = 3
          AND COALESCE(p.inscripcion,0) = 1
    ";
    $stMarc = $pdo->prepare($sqlMarcadas);
    $stMarc->execute([':dni' => $dni]);
    $cantMarcadas = (int)$stMarc->fetchColumn();

    $sqlTotalCond3 = "
        SELECT COUNT(*) AS c
        FROM previas AS p
        WHERE p.dni = :dni
          AND p.id_condicion = 3
    ";
    $stTot = $pdo->prepare($sqlTotalCond3);
    $stTot->execute([':dni' => $dni]);
    $cantCond3 = (int)$stTot->fetchColumn();

    if ($cantCond3 > 0 && $cantMarcadas === $cantCond3) {
        echo json_encode([
            'exito'            => false,
            'mensaje'          => 'Este alumno ya fue inscripto en las mesas de examen.',
            'ya_inscripto'     => true,
            'anio_inscripcion' => $anioActual,
        ]);
        exit;
    }

    // ===== 3) Si no hay pendientes ni marcadas, entonces NO hay previas condición 3 =====
    echo json_encode([
        'exito'        => false,
        'mensaje'      => 'No se encontraron materias previas para ese DNI.',
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

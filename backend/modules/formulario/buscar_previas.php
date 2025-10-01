<?php
// backend/modules/formulario/buscar_previas.php
// Versión que NUNCA usa 4xx: responde 200 y exito:false en validaciones
header('Content-Type: application/json; charset=utf-8');

// Solo POST JSON (pero respondemos 200 igualmente para no loguear 4xx)
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

// Conexión PDO
require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO)

try {
    // Traer previas del DNI con id_condicion = 3 (OBLIGATORIO)
    $sql = "
        SELECT 
            p.dni,
            p.alumno,
            p.anio,
            p.cursando_id_curso,
            p.cursando_id_division,
            p.materia_id_curso,
            p.materia_id_division,
            p.id_condicion,
            m.id_materia,
            m.materia
        FROM mesas_examen.previas p
        INNER JOIN mesas_examen.materias m
            ON m.id_materia = p.id_materia
        WHERE p.dni = :dni
          AND p.id_condicion = 3
        ORDER BY m.materia ASC
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':dni' => $dni]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    if (!$rows) {
        echo json_encode([
            'exito'   => false,
            'mensaje' => 'No se encontraron previas para ese DNI.'
        ]);
        exit;
    }

    // ¿Ya está inscripto este año?
    $anioActual = (int)date('Y');
    $st2 = $pdo->prepare("
        SELECT COUNT(*) 
        FROM mesas_examen.inscripcion
        WHERE dni = :dni AND anio = :anio
    ");
    $st2->execute([':dni' => $dni, ':anio' => $anioActual]);
    $yaInscripto = ((int)$st2->fetchColumn() > 0);

    // Armar respuesta
    $alumnoNombre = $rows[0]['alumno'];
    $cursando = [
        'curso'    => isset($rows[0]['cursando_id_curso']) ? (int)$rows[0]['cursando_id_curso'] : null,
        'division' => isset($rows[0]['cursando_id_division']) ? (int)$rows[0]['cursando_id_division'] : null,
    ];

    $materias = array_map(function ($r) {
        return [
            'id_materia'   => (int)$r['id_materia'],
            'materia'      => $r['materia'],
            'curso'        => isset($r['materia_id_curso']) ? (int)$r['materia_id_curso'] : null,
            'division'     => isset($r['materia_id_division']) ? (int)$r['materia_id_division'] : null,
            'id_condicion' => (int)$r['id_condicion'],
            'anio'         => isset($r['anio']) ? (int)$r['anio'] : null,
        ];
    }, $rows);

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
        'ya_inscripto'     => $yaInscripto,
        'anio_inscripcion' => $anioActual
    ]);
} catch (Throwable $e) {
    // También 200 con exito:false para no mostrar 5xx en consola
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al consultar previas.',
        'detalle' => $e->getMessage(),
    ]);
}

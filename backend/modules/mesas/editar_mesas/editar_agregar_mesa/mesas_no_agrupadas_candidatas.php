<?php
// backend/modules/mesas/mesas_no_agrupadas_candidatas.php
// -----------------------------------------------------------------------------
// Devuelve las mesas "no agrupadas" como candidatas para agregar a un grupo,
// incluyendo metadata (materia, docentes, alumnos) **y además** las PREVIAS
// inscriptas (inscripcion = 1) que todavía no tienen ninguna mesa asociada.
//
// Entrada (POST JSON):
//   {
//     "fecha_objetivo": "YYYY-MM-DD" | null,
//     "id_turno_objetivo": 1 | null,
//     "numero_mesa_actual": 123
//   }
//
// Salida:
//   {
//     "exito": true,
//     "data": {
//        "mesas":   [ { numero_mesa, materia, docentes[], alumnos[], elegible, motivo? }, ... ],
//        "previas": [ { id_previa, dni, alumno, materia, curso_div }, ... ]
//     }
//   }
// -----------------------------------------------------------------------------

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../../../config/db.php';

function respond_json(bool $ok, $payload = null, int $status = 200): void {
    http_response_code($status);
    echo json_encode(
        $ok
            ? ['exito' => true, 'data' => $payload]
            : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond_json(false, 'Método no permitido.', 405);
    }
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        respond_json(false, 'Conexión PDO no disponible.', 500);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input') ?: '';
    $in  = json_decode($raw, true);
    if (!is_array($in)) {
        respond_json(false, 'Body JSON inválido.', 400);
    }

    $fecha_objetivo = isset($in['fecha_objetivo']) ? trim((string)$in['fecha_objetivo']) : '';
    $id_turno_obj   = isset($in['id_turno_objetivo']) ? (int)$in['id_turno_objetivo'] : null;
    $numero_actual  = isset($in['numero_mesa_actual']) ? (int)$in['numero_mesa_actual'] : 0;

    // ============================================================
    // A) MESAS NO AGRUPADAS
    // ============================================================

    // Traer todas las no-agrupadas actuales
    $sqlNoAgr = "
        SELECT na.numero_mesa, na.fecha_mesa, na.id_turno
        FROM mesas_no_agrupadas na
        ORDER BY na.fecha_mesa ASC, na.id_turno ASC, na.numero_mesa ASC
    ";
    $st   = $pdo->query($sqlNoAgr);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $det = []; // numero_mesa => info base
    if ($rows) {
        foreach ($rows as $r) {
            $nm = (int)$r['numero_mesa'];
            if ($nm === 0) {
                continue;
            }
            if ($numero_actual > 0 && $nm === $numero_actual) {
                // evitar el actual si está en no_agrupadas
                continue;
            }

            $det[$nm] = [
                'numero_mesa' => $nm,
                'fecha'       => (string)$r['fecha_mesa'],
                'id_turno'    => (int)$r['id_turno'],
                'materia'     => '',
                'docentes'    => [],
                'alumnos'     => [],
                'elegible'    => true,   // siempre elegible
                'motivo'      => null,
            ];
        }
    }

    $outMesas = [];
    if ($det) {
        $nums = array_keys($det);
        $ph   = implode(',', array_fill(0, count($nums), '?'));

        // Materia y docentes
        $sqlCab = "
            SELECT m.numero_mesa,
                   MIN(mat.materia) AS materia,
                   GROUP_CONCAT(DISTINCT d.docente SEPARATOR '||') AS docentes_concat
            FROM mesas m
              LEFT JOIN catedras  c   ON c.id_catedra   = m.id_catedra
              LEFT JOIN materias  mat ON mat.id_materia = c.id_materia
              LEFT JOIN docentes  d   ON d.id_docente   = m.id_docente
            WHERE m.numero_mesa IN ($ph)
            GROUP BY m.numero_mesa
        ";
        $stCab = $pdo->prepare($sqlCab);
        $stCab->execute($nums);
        while ($r = $stCab->fetch(PDO::FETCH_ASSOC)) {
            $nm = (int)$r['numero_mesa'];
            if (!isset($det[$nm])) {
                continue;
            }
            $det[$nm]['materia'] = (string)($r['materia'] ?? '');

            $docs = [];
            if (!empty($r['docentes_concat'])) {
                $seen = [];
                foreach (explode('||', (string)$r['docentes_concat']) as $dname) {
                    $k = mb_strtolower(trim((string)$dname));
                    if ($k === '' || isset($seen[$k])) {
                        continue;
                    }
                    $seen[$k] = true;
                    $docs[]   = $dname;
                }
            }
            $det[$nm]['docentes'] = $docs;
        }

        // Alumnos
        $sqlAlu = "
            SELECT m.numero_mesa, p.alumno, p.dni
            FROM mesas m
              INNER JOIN previas p ON p.id_previa = m.id_previa
            WHERE m.numero_mesa IN ($ph)
            ORDER BY m.numero_mesa ASC, p.alumno ASC
        ";
        $stAlu = $pdo->prepare($sqlAlu);
        $stAlu->execute($nums);
        while ($r = $stAlu->fetch(PDO::FETCH_ASSOC)) {
            $nm  = (int)$r['numero_mesa'];
            $al  = (string)($r['alumno'] ?? '');
            if (!isset($det[$nm])) {
                continue;
            }
            $det[$nm]['alumnos'][] = $al;
        }

        // salida ordenada por elegible y número
        $outMesas = array_values($det);
        usort($outMesas, function ($a, $b) {
            if ($a['elegible'] === $b['elegible']) {
                return $a['numero_mesa'] <=> $b['numero_mesa'];
            }
            return $a['elegible'] ? -1 : 1;
        });
    }

    // ============================================================
    // B) PREVIAS INSCRIPTAS SIN NINGUNA MESA ASOCIADA
    // ============================================================
    //
    // REGLA: solo queremos previas con inscripcion = 1
    //        (0 = no inscripta; 2 no se usa más),
    //        y que NO tengan ninguna fila en `mesas` (me.id_mesa IS NULL).
    //        No filtramos por año, así siempre ves TODAS las inscriptas.

    $sqlPrev = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.id_materia,
            p.materia_id_curso,
            p.materia_id_division,
            mat.materia,
            c.nombre_curso,
            d.nombre_division,
            CONCAT(
                COALESCE(c.nombre_curso, ''),
                CASE
                    WHEN c.nombre_curso IS NOT NULL
                         AND d.nombre_division IS NOT NULL
                    THEN ' '
                    ELSE ''
                END,
                COALESCE(d.nombre_division, '')
            ) AS curso_div
        FROM previas AS p
        INNER JOIN materias AS mat
            ON mat.id_materia = p.id_materia
        LEFT JOIN curso AS c
            ON c.id_curso = p.materia_id_curso
        LEFT JOIN division AS d
            ON d.id_division = p.materia_id_division
        LEFT JOIN mesas AS me
            ON me.id_previa = p.id_previa
        WHERE
            p.inscripcion = 1          -- SOLO inscriptas
            AND me.id_mesa IS NULL     -- SIN ninguna mesa asociada
        ORDER BY
            p.alumno ASC,
            mat.materia ASC
    ";

    $stPrev = $pdo->prepare($sqlPrev);
    $stPrev->execute();
    $rowsPrev = $stPrev->fetchAll(PDO::FETCH_ASSOC);

    $outPrevias = [];
    if ($rowsPrev) {
        foreach ($rowsPrev as $r) {
            $outPrevias[] = [
                'id_previa'           => (int)$r['id_previa'],
                'dni'                 => $r['dni'],
                'alumno'              => $r['alumno'],
                'id_materia'          => (int)$r['id_materia'],
                'materia'             => $r['materia'],
                'materia_id_curso'    => isset($r['materia_id_curso']) ? (int)$r['materia_id_curso'] : null,
                'materia_id_division' => isset($r['materia_id_division']) ? (int)$r['materia_id_division'] : null,
                'nombre_curso'        => $r['nombre_curso'] ?? null,
                'nombre_division'     => $r['nombre_division'] ?? null,
                'curso_div'           => trim($r['curso_div'] ?? ''),
            ];
        }
    }

    // ============================================================
    // RESPUESTA
    // ============================================================
    respond_json(true, [
        'mesas'   => $outMesas,
        'previas' => $outPrevias,
    ]);

} catch (Throwable $e) {
    error_log('[mesas_no_agrupadas_candidatas] ' . $e->getMessage());
    respond_json(false, 'Error: ' . $e->getMessage(), 500);
}

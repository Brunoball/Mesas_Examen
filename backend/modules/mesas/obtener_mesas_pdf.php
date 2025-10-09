<?php
// backend/modules/mesas/obtener_mesas_pdf.php
// Devuelve el detalle DE TODA LA MESA (alumnos + docentes) a partir de:
//   - { "id_grupo": number }  ó
//   - { "numeros_mesa": number[] }
//
// Estructura de salida:
// [
//   {
//     "numero_mesa": 1,
//     "fecha": "2025-10-08",
//     "id_turno": 2,
//     "turno": "MAÑANA",
//     "id_materia": 93,
//     "materia": "MATEMÁTICA",
//     "docentes": ["BODINI, CARLOS ORFILIO","MANSILLA, MARÍA EUGENIA"],
//     "alumnos": [
//       {"alumno":"APELLIDO, NOMBRE","dni":"48188483","curso":"5° 4"},
//       ...
//     ]
//   },
//   ...
// ]

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../config/db.php';

function respond_json(bool $ok, $payload = null, int $status = 200): void {
  http_response_code($status);
  echo json_encode(
    $ok ? ['exito' => true, 'data' => $payload]
       : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
  );
  exit;
}

set_error_handler(function($severity, $message, $file, $line) {
  throw new ErrorException($message, 0, $severity, $file, $line);
});

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

  // ------------------------------------------------------------------
  // 1) Resolver la lista de numero_mesa
  // ------------------------------------------------------------------
  $numeros = [];

  if (array_key_exists('id_grupo', $in)) {
    $idg = (int)$in['id_grupo'];
    if ($idg <= 0) respond_json(false, 'id_grupo inválido.', 400);

    $qg = $pdo->prepare("
      SELECT numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4
      FROM mesas_grupos
      WHERE id_mesa_grupos = ?
    ");
    $qg->execute([$idg]);
    $g = $qg->fetch(PDO::FETCH_ASSOC);
    if (!$g) respond_json(false, 'Grupo no encontrado.', 404);

    foreach (['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'] as $k) {
      $nm = (int)($g[$k] ?? 0);
      if ($nm > 0) $numeros[] = $nm;
    }
  } elseif (!empty($in['numeros_mesa']) && is_array($in['numeros_mesa'])) {
    $numeros = array_values(array_unique(array_map('intval', $in['numeros_mesa'])));
  }

  if (!$numeros) {
    respond_json(false, 'Debe indicar id_grupo o una lista de numeros_mesa.', 400);
  }

  // ------------------------------------------------------------------
  // 2) Cabecera por numero_mesa (materia, fecha, turno, docentes)
  // ------------------------------------------------------------------
  $placeholders = implode(',', array_fill(0, count($numeros), '?'));

  // NOTA: catedras -> materias para obtener el nombre del espacio curricular
  //       turnos para el literal del turno
  $sqlCab = "
    SELECT
      m.numero_mesa,
      MIN(m.fecha_mesa)                           AS fecha_mesa,
      MIN(m.id_turno)                             AS id_turno,
      MIN(t.turno)                                AS turno,
      MIN(mat.id_materia)                         AS id_materia,
      MIN(mat.materia)                            AS materia,
      GROUP_CONCAT(DISTINCT d.docente SEPARATOR '||') AS docentes_concat
    FROM mesas m
      LEFT JOIN turnos    t   ON t.id_turno     = m.id_turno
      LEFT JOIN catedras  c   ON c.id_catedra   = m.id_catedra
      LEFT JOIN materias  mat ON mat.id_materia = c.id_materia
      LEFT JOIN docentes  d   ON d.id_docente   = m.id_docente
    WHERE m.numero_mesa IN ($placeholders)
    GROUP BY m.numero_mesa
    ORDER BY m.numero_mesa ASC
  ";
  $stCab = $pdo->prepare($sqlCab);
  $stCab->execute($numeros);

  $cab = [];
  while ($r = $stCab->fetch(PDO::FETCH_ASSOC)) {
    // docentes únicos preservando orden aproximado del GROUP_CONCAT
    $docs = [];
    if (!empty($r['docentes_concat'])) {
      $seen = [];
      foreach (explode('||', (string)$r['docentes_concat']) as $dname) {
        $k = mb_strtolower(trim((string)$dname));
        if ($k === '' || isset($seen[$k])) continue;
        $seen[$k] = true;
        $docs[] = $dname;
      }
    }
    $cab[(int)$r['numero_mesa']] = [
      'numero_mesa' => (int)$r['numero_mesa'],
      'fecha'       => (string)($r['fecha_mesa'] ?? ''),
      'id_turno'    => isset($r['id_turno']) ? (int)$r['id_turno'] : null,
      'turno'       => (string)($r['turno'] ?? ''),
      'id_materia'  => isset($r['id_materia']) ? (int)$r['id_materia'] : null,
      'materia'     => (string)($r['materia'] ?? ''),
      'docentes'    => $docs,
      'alumnos'     => [],
    ];
  }
  if (!$cab) {
    respond_json(true, []); // no hay datos
  }

  // ------------------------------------------------------------------
  // 3) Alumnos por numero_mesa (desde previas)
  //     - Tomamos alumno, dni
  //     - Curso/División: desde materias_id_curso/division (NOMBRE mediante tablas curso/division)
  // ------------------------------------------------------------------
  $sqlAlu = "
    SELECT
      m.numero_mesa,
      p.alumno,
      p.dni,
      p.materia_id_curso    AS id_curso,
      p.materia_id_division AS id_division,
      cu.nombre_curso       AS nombre_curso,
      dv.nombre_division    AS nombre_division
    FROM mesas m
      INNER JOIN previas p       ON p.id_previa = m.id_previa
      LEFT  JOIN curso   cu      ON cu.id_curso = p.materia_id_curso
      LEFT  JOIN division dv     ON dv.id_division = p.materia_id_division
    WHERE m.numero_mesa IN ($placeholders)
    ORDER BY m.numero_mesa ASC, p.alumno ASC
  ";
  $stAlu = $pdo->prepare($sqlAlu);
  $stAlu->execute($numeros);

  while ($r = $stAlu->fetch(PDO::FETCH_ASSOC)) {
    $nm = (int)$r['numero_mesa'];
    if (!isset($cab[$nm])) continue;

    // Construimos "5° 4" con los nombres de tablas curso/division si existen;
    // sino, usamos id_curso/id_division.
    $cursoNom = (string)($r['nombre_curso'] ?? '');
    $divNom   = (string)($r['nombre_division'] ?? '');
    $cursoStr = '';
    if ($cursoNom !== '' && $divNom !== '')        $cursoStr = $cursoNom . "° " . $divNom;
    elseif ($cursoNom !== '' && $divNom === '')     $cursoStr = $cursoNom . "°";
    elseif ($cursoNom === '' && $divNom !== '')     $cursoStr = $divNom;
    else {
      $idc = isset($r['id_curso']) ? (string)$r['id_curso'] : '';
      $idd = isset($r['id_division']) ? (string)$r['id_division'] : '';
      if ($idc !== '' && $idd !== '')  $cursoStr = $idc . "° " . $idd;
      elseif ($idc !== '')             $cursoStr = $idc . "°";
      elseif ($idd !== '')             $cursoStr = $idd;
    }

    $cab[$nm]['alumnos'][] = [
      'alumno' => (string)($r['alumno'] ?? ''),
      'dni'    => (string)($r['dni'] ?? ''),
      'curso'  => $cursoStr,
    ];
  }

  // ------------------------------------------------------------------
  // 4) Salida
  // ------------------------------------------------------------------
  // Ordenamos alumnos por nombre en cada mesa
  foreach ($cab as &$m) {
    if (!empty($m['alumnos']) && is_array($m['alumnos'])) {
      usort($m['alumnos'], function($a, $b) {
        return strcmp(
          mb_strtolower((string)($a['alumno'] ?? ''), 'UTF-8'),
          mb_strtolower((string)($b['alumno'] ?? ''), 'UTF-8')
        );
      });
    }
  }
  unset($m);

  respond_json(true, array_values($cab));

} catch (Throwable $e) {
  error_log('[obtener_mesas_detalle] ' . $e->getMessage());
  respond_json(false, 'Error: ' . $e->getMessage(), 500);
}

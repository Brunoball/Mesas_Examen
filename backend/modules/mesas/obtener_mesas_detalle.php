<?php
// backend/modules/mesas/obtener_mesas_detalle.php
// Devuelve detalle de mesas (alumnos + docentes) para una lista de numero_mesa
// o para un id_grupo (resuelve numero_mesa_1..4).
// Entrada (POST JSON):
//   { "numeros_mesa": [47, 83, 185] }
//   ó
//   { "id_grupo": 12 }

declare(strict_types=1);

// ⚠️ no emitir warnings/notices al JSON
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

// Convertir PHP warnings/notices en excepción controlada
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

  // ---------- Leer JSON ----------
  $raw = file_get_contents('php://input') ?: '';
  $in  = json_decode($raw, true);
  if (!is_array($in)) {
    respond_json(false, 'Body JSON inválido.', 400);
  }

  $nums = [];
  if (!empty($in['numeros_mesa']) && is_array($in['numeros_mesa'])) {
    $nums = array_values(array_unique(array_map('intval', $in['numeros_mesa'])));
  } elseif (isset($in['id_grupo'])) {
    $idg = (int)$in['id_grupo'];
    if ($idg <= 0) respond_json(false, 'id_grupo inválido.', 400);

    // Resolver hasta 4 números de mesa del grupo (ignorando 0)
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
      if ($nm > 0) $nums[] = $nm;
    }
    $nums = array_values(array_unique($nums));
  }

  if (!$nums) {
    respond_json(false, 'numeros_mesa vacío o inválido.', 400);
  }

  // Placeholders ?,?,?
  $ph = implode(',', array_fill(0, count($nums), '?'));

  // ---------- Cabecera por mesa ----------
  // - materia/área vía catedras -> materias
  // - docente desde mesas.id_docente (único por mesa; por seguridad, se agrupan distintos)
  // - turno descriptivo desde turnos
  $sqlCab = "
    SELECT
      m.numero_mesa,
      MIN(m.fecha_mesa)                          AS fecha_mesa,
      MIN(m.id_turno)                            AS id_turno,
      MIN(t.turno)                               AS turno,
      MIN(mat.id_materia)                        AS id_materia,
      MIN(mat.materia)                           AS materia,
      GROUP_CONCAT(DISTINCT d.docente SEPARATOR '||') AS docentes_concat
    FROM mesas m
      LEFT JOIN turnos    t   ON t.id_turno    = m.id_turno
      LEFT JOIN catedras  c   ON c.id_catedra  = m.id_catedra
      LEFT JOIN materias  mat ON mat.id_materia = c.id_materia
      LEFT JOIN docentes  d   ON d.id_docente  = m.id_docente
    WHERE m.numero_mesa IN ($ph)
    GROUP BY m.numero_mesa
  ";
  $stCab = $pdo->prepare($sqlCab);
  $stCab->execute($nums);

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
      'docentes'    => $docs,  // arreglo de nombres
      'alumnos'     => [],
    ];
  }

  if (!$cab) {
    respond_json(true, []); // no hay datos para esos números
  }

  // ---------- Alumnos por mesa ----------
  // alumno + dni desde previas; curso/división desde previas.materia_id_curso / materia_id_division
  $sqlAlu = "
    SELECT
      m.numero_mesa,
      p.alumno,
      p.dni,
      p.materia_id_curso    AS id_curso,
      p.materia_id_division AS id_division
    FROM mesas m
      INNER JOIN previas p ON p.id_previa = m.id_previa
    WHERE m.numero_mesa IN ($ph)
    ORDER BY m.numero_mesa ASC, p.alumno ASC
  ";
  $stAlu = $pdo->prepare($sqlAlu);
  $stAlu->execute($nums);

  while ($r = $stAlu->fetch(PDO::FETCH_ASSOC)) {
    $nm = (int)$r['numero_mesa'];
    if (!isset($cab[$nm])) continue;

    $curso = isset($r['id_curso']) ? (string)$r['id_curso'] : '';
    $div   = isset($r['id_division']) ? (string)$r['id_division'] : '';
    // Formato: "3° A" si ambos existen; si falta alguno, mostrar el que haya
    $cursoDiv = '';
    if ($curso !== '' && $div !== '')       $cursoDiv = $curso . "° " . $div;
    elseif ($curso !== '' && $div === '')   $cursoDiv = $curso . "°";
    elseif ($curso === '' && $div !== '')   $cursoDiv = $div;

    $cab[$nm]['alumnos'][] = [
      'alumno' => (string)($r['alumno'] ?? ''),
      'dni'    => (string)($r['dni'] ?? ''),
      'curso'  => $cursoDiv,
    ];
  }

  // ---------- Salida ----------
  respond_json(true, array_values($cab));

} catch (Throwable $e) {
  error_log('[obtener_mesas_detalle] ' . $e->getMessage());
  respond_json(false, 'Error: ' . $e->getMessage(), 500);
}

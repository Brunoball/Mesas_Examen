<?php
// backend/modules/catedras/obtener_catedras.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Filtros opcionales por GET
    $idCurso    = isset($_GET['id_curso'])    ? (int)$_GET['id_curso']    : 0;
    $idDivision = isset($_GET['id_division']) ? (int)$_GET['id_division'] : 0;
    $q          = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

    $where  = [];
    $params = [];

    if ($idCurso > 0) {
        $where[] = 'c.id_curso = :idCurso';
        $params[':idCurso'] = $idCurso;
    }
    if ($idDivision > 0) {
        $where[] = 'c.id_division = :idDivision';
        $params[':idDivision'] = $idDivision;
    }
    if ($q !== '') {
        // Búsqueda simple por LIKE
        $where[] = '(m.materia LIKE :busq
                 OR dct.docente LIKE :busq
                 OR cu.nombre_curso LIKE :busq
                 OR dv.nombre_division LIKE :busq)';
        $params[':busq'] = '%' . $q . '%';
    }

    // IMPORTANTE:
    // En tu tabla catedras NO existe "carga_horaria" (ver DESCRIBE que pasaste).
    // Para no romper, devolvemos NULL como "carga".
    $sql = "
        SELECT
            c.id_catedra,
            c.id_curso,
            cu.nombre_curso,
            c.id_division,
            dv.nombre_division,
            c.id_materia,
            m.materia,
            c.id_docente,
            dct.docente,
            NULL AS carga
        FROM mesas_examen.catedras AS c
        INNER JOIN mesas_examen.curso     AS cu  ON cu.id_curso     = c.id_curso
        INNER JOIN mesas_examen.division  AS dv  ON dv.id_division  = c.id_division
        INNER JOIN mesas_examen.materias  AS m   ON m.id_materia    = c.id_materia
        LEFT  JOIN mesas_examen.docentes  AS dct ON dct.id_docente  = c.id_docente
        " . (count($where) ? "WHERE " . implode(' AND ', $where) : "") . "
        ORDER BY cu.nombre_curso, dv.nombre_division, m.materia
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $catedras = array_map(static function ($r) {
        return [
            'id_catedra'      => (int)$r['id_catedra'],
            'id_curso'        => (int)$r['id_curso'],
            'nombre_curso'    => (string)$r['nombre_curso'],
            'id_division'     => (int)$r['id_division'],
            'nombre_division' => (string)$r['nombre_division'],
            'id_materia'      => (int)$r['id_materia'],
            'materia'         => (string)$r['materia'],
            'id_docente'      => isset($r['id_docente']) ? (int)$r['id_docente'] : null,
            'docente'         => $r['docente'] !== null ? (string)$r['docente'] : null,
            // Como no existe en la tabla, de momento devolvemos null
            'carga'           => null,
        ];
    }, $rows);

    echo json_encode(['exito' => true, 'catedras' => $catedras], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

<?php
// backend/modules/previas/obtener_previas_baja.php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php';

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $sql = "
        SELECT
            p.id_previa,
            p.dni,
            p.alumno,
            p.motivo_baja,
            p.fecha_baja,
            p.nota,
            p.fecha_nota,
            COALESCE(p.fecha_baja, p.fecha_nota) AS fecha_orden,

            m.materia         AS materia_nombre,
            c.nombre_curso    AS materia_curso,
            d.nombre_division AS materia_division
        FROM previas_historial p
        LEFT JOIN materias m  ON m.id_materia  = p.id_materia
        LEFT JOIN curso c     ON c.id_curso     = p.materia_id_curso
        LEFT JOIN division d  ON d.id_division  = p.materia_id_division
        ORDER BY fecha_orden DESC, p.id_previa DESC
    ";

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $previas = array_map(function ($p) {
        $tieneNota = isset($p['nota']) && $p['nota'] !== null && $p['nota'] !== '';
        $tieneFechaNota = isset($p['fecha_nota']) && $p['fecha_nota'] !== null && $p['fecha_nota'] !== '';

        $tieneBajaNormal =
            (isset($p['motivo_baja']) && trim((string)$p['motivo_baja']) !== '') ||
            (isset($p['fecha_baja']) && $p['fecha_baja'] !== null && $p['fecha_baja'] !== '');

        if (!$tieneBajaNormal && ($tieneNota || $tieneFechaNota)) {
            $materia = $p['materia_nombre'] ?? 'Materia desconocida';
            $curso = $p['materia_curso'] ?? '';
            $division = $p['materia_division'] ?? '';
            $nota = $tieneNota ? $p['nota'] : '—';

            $sufijo = trim("$curso $division");
            $sufijo = $sufijo !== '' ? " DE $sufijo" : '';

            $p['motivo_baja_display'] = "APROBÓ {$materia}{$sufijo} — NOTA: {$nota}";
            $p['tipo_baja'] = 'aprobado';
        } else {
            $p['motivo_baja_display'] = $p['motivo_baja'] ?? '';
            $p['tipo_baja'] = 'baja';
        }

        return $p;
    }, $rows);

    echo json_encode([
        'exito' => true,
        'previas' => $previas
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'Error al obtener previas dadas de baja: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
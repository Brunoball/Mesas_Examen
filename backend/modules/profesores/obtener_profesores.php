<?php
// backend/modules/profesores/obtener_profesores.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec("SET NAMES utf8mb4");

    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    $params = [];
    $where  = 'WHERE d.activo = 1'; // 🔹 Solo docentes activos

    if ($id > 0) {
        $where .= ' AND d.id_docente = :id';
        $params[':id'] = $id;
    }

    /**
     * Traemos:
     *  - Datos del docente + cargo
     *  - Turnos: id/nombre (Sí y No) + fechas (fecha_si / fecha_no)
     *  - Materias (DISTINCT)
     *  - Cátedras (curso, división, materia)
     *  - Fecha de carga
     */
    $sql = "
        SELECT
            d.id_docente                                                      AS id_profesor,
            d.docente                                                         AS nombre_completo,

            -- Cargo
            d.id_cargo,
            c.cargo                                                           AS cargo_nombre,

            -- Turnos (sí / no) + fechas
            d.id_turno_si,
            ts.turno                                                          AS turno_si_nombre,
            d.fecha_si,

            d.id_turno_no,
            tn.turno                                                          AS turno_no_nombre,
            d.fecha_no,

            -- Fecha de carga
            d.fecha_carga,

            -- Materias (todas las que dicta)
            GROUP_CONCAT(DISTINCT m.materia ORDER BY m.materia SEPARATOR '||') AS materias_concat,

            -- Cátedras: curso|division|materia
            GROUP_CONCAT(
              DISTINCT CONCAT_WS('|', cu.nombre_curso, dv.nombre_division, m.materia)
              ORDER BY cu.nombre_curso, dv.nombre_division, m.materia
              SEPARATOR '§§'
            ) AS catedras_concat,

            -- Estado y motivo
            d.activo,
            d.motivo

        FROM docentes d
        LEFT JOIN cargos    c  ON c.id_cargo    = d.id_cargo
        LEFT JOIN turnos    ts ON ts.id_turno   = d.id_turno_si
        LEFT JOIN turnos    tn ON tn.id_turno   = d.id_turno_no
        LEFT JOIN catedras  ct ON ct.id_docente = d.id_docente
        LEFT JOIN materias  m  ON m.id_materia  = ct.id_materia
        LEFT JOIN curso     cu ON cu.id_curso   = ct.id_curso
        LEFT JOIN division  dv ON dv.id_division= ct.id_division
        $where
        GROUP BY
            d.id_docente, d.docente,
            d.id_cargo, c.cargo,
            d.id_turno_si, ts.turno, d.fecha_si,
            d.id_turno_no, tn.turno, d.fecha_no,
            d.fecha_carga,
            d.activo, d.motivo
        ORDER BY d.docente ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $out = [];
    foreach ($rows as $r) {
        // ----- Materias (array único/ordenado) -----
        $materias = [];
        if (!empty($r['materias_concat'])) {
            $materias = array_values(array_filter(array_map('trim', explode('||', $r['materias_concat'] ?? ''))));
        }
        $materia_principal = $materias[0] ?? null;
        $materias_total    = count($materias);

        // ----- Cátedras (array de objetos: curso, division, materia) -----
        $catedras = [];
        if (!empty($r['catedras_concat'])) {
            $chunks = explode('§§', $r['catedras_concat']);
            foreach ($chunks as $chunk) {
                $parts = explode('|', $chunk);
                $curso    = isset($parts[0]) ? trim($parts[0]) : null;
                $division = isset($parts[1]) ? trim($parts[1]) : null;
                $materia  = isset($parts[2]) ? trim($parts[2]) : null;

                if ($curso !== null || $division !== null || $materia !== null) {
                    $catedras[] = [
                        'curso'    => $curso,
                        'division' => $division,
                        'materia'  => $materia,
                    ];
                }
            }
        }

        $out[] = [
            'id_profesor'           => (int)$r['id_profesor'],
            'nombre_completo'       => $r['nombre_completo'] ?? null,

            // Cargo
            'id_cargo'              => isset($r['id_cargo']) ? (int)$r['id_cargo'] : null,
            'cargo_nombre'          => $r['cargo_nombre'] ?? null,

            // Turnos y fechas
            'id_turno_si'           => isset($r['id_turno_si']) ? (int)$r['id_turno_si'] : null,
            'turno_si_nombre'       => $r['turno_si_nombre'] ?? null,
            'fecha_si'              => $r['fecha_si'] ?? null,  // YYYY-MM-DD

            'id_turno_no'           => isset($r['id_turno_no']) ? (int)$r['id_turno_no'] : null,
            'turno_no_nombre'       => $r['turno_no_nombre'] ?? null,
            'fecha_no'              => $r['fecha_no'] ?? null,  // YYYY-MM-DD

            // Fecha de carga
            'fecha_carga'           => $r['fecha_carga'] ?? null, // YYYY-MM-DD

            // Materias
            'materias'              => $materias,
            'materias_total'        => $materias_total,
            'materia_principal'     => $materia_principal,

            // Compatibilidad histórica
            'materia_nombre'        => $materia_principal,

            // Cátedras (Curso – División — Materia)
            'catedras'              => $catedras,

            // Campos no modelados (placeholder para UI)
            'departamento'          => null,
            'area'                  => null,
            'tipo_documento_nombre' => null,
            'tipo_documento_sigla'  => null,
            'num_documento'         => null,
            'dni'                   => null,
            'sexo_nombre'           => null,
            'telefono'              => null,
            'ingreso'               => null,
            'domicilio'             => null,
            'localidad'             => null,

            // Estado real desde DB
            'activo'                => isset($r['activo']) ? (int)$r['activo'] : 0,
            'motivo'                => $r['motivo'] ?? null,
        ];
    }

    echo json_encode([
        'exito'      => true,
        'profesores' => $out,
        'cantidad'   => count($out),
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error al obtener profesores: ' . $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

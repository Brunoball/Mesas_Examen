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
     *  - Materias (DISTINCT)
     *  - Cátedras (curso, división, materia)
     */
    $sql = "
        SELECT
            d.id_docente                                                      AS id_profesor,
            d.docente                                                         AS nombre_completo,

            -- Cargo
            d.id_cargo,
            c.cargo                                                           AS cargo_nombre,

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

        FROM mesas_examen.docentes d
        LEFT JOIN mesas_examen.cargos    c  ON c.id_cargo    = d.id_cargo
        LEFT JOIN mesas_examen.catedras  ct ON ct.id_docente = d.id_docente
        LEFT JOIN mesas_examen.materias  m  ON m.id_materia  = ct.id_materia
        LEFT JOIN mesas_examen.curso     cu ON cu.id_curso   = ct.id_curso
        LEFT JOIN mesas_examen.division  dv ON dv.id_division= ct.id_division
        $where
        GROUP BY d.id_docente, d.docente, d.id_cargo, c.cargo, d.activo, d.motivo
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

            // Materias
            'materias'              => $materias,
            'materias_total'        => $materias_total,
            'materia_principal'     => $materia_principal,

            // Compatibilidad histórica
            'materia_nombre'        => $materia_principal,

            // Cátedras (Curso – División — Materia)
            'catedras'              => $catedras,

            // Si tu modelo no tiene área/departamento asociados:
            'departamento'          => null,
            'area'                  => null,

            // Otros opcionales esperados por la UI
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
            'activo'                => (int)$r['activo'],
            'motivo'                => $r['motivo'],
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

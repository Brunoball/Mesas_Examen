<?php
// backend/modules/mesas/obtener_mesas.php
require_once __DIR__ . '/../../config/db.php';

header('Content-Type: application/json; charset=utf-8');

try {
    if (!($pdo instanceof PDO)) {
        throw new RuntimeException('Conexión PDO no disponible.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    /**
     * Tablas (según describes):
     * mesas_examen.mesas:     id_mesa, id_catedra, id_previa, id_docente_1..3, fecha_mesa, id_turno
     * mesas_examen.catedras:  id_catedra, id_curso, id_division, id_materia, id_docente
     * mesas_examen.previas:   id_previa, id_materia, cursando_id_curso, cursando_id_division, ...
     * mesas_examen.materias:  id_materia, materia
     * mesas_examen.turnos:    id_turno, turno
     * mesas_examen.docentes:  id_docente, docente
     *
     * Tablas de nombre/etiqueta (ajusta si difieren en tu BD real):
     * curso:    id_curso, nombre_curso
     * division: id_division, nombre_division
     */

    $sql = "
        SELECT
            -- mesas
            m.id_mesa,
            m.id_catedra,
            m.id_previa,
            m.fecha_mesa,
            m.id_turno,

            -- turno
            t.turno,

            -- cátedra (ubicación curso/div)
            c.id_curso,
            c.id_division,

            -- PREVIA -> id_materia (lo que pediste)
            p.id_materia AS id_materia_previa,

            -- materia (desde previas -> materias)
            mat.materia  AS materia,

            -- nombres de curso/división (ajustar nombres de tablas si es necesario)
            cur.nombre_curso   AS curso,
            dv.nombre_division AS division,

            -- tribunal
            m.id_docente_1, d1.docente AS docente_1,
            m.id_docente_2, d2.docente AS docente_2,
            m.id_docente_3, d3.docente AS docente_3

        FROM mesas_examen.mesas       AS m
        INNER JOIN mesas_examen.catedras  AS c   ON c.id_catedra = m.id_catedra
        INNER JOIN mesas_examen.turnos    AS t   ON t.id_turno   = m.id_turno

        -- *** clave del cambio: traer id_materia desde PREVIAS ***
        INNER JOIN mesas_examen.previas   AS p   ON p.id_previa  = m.id_previa
        INNER JOIN mesas_examen.materias  AS mat ON mat.id_materia = p.id_materia

        -- nombres de curso/división (si tus tablas están en otro schema, ajusta)
        LEFT  JOIN curso                  AS cur ON cur.id_curso     = c.id_curso
        LEFT  JOIN division               AS dv  ON dv.id_division   = c.id_division

        -- docentes del tribunal
        LEFT  JOIN mesas_examen.docentes  AS d1  ON d1.id_docente    = m.id_docente_1
        LEFT  JOIN mesas_examen.docentes  AS d2  ON d2.id_docente    = m.id_docente_2
        LEFT  JOIN mesas_examen.docentes  AS d3  ON d3.id_docente    = m.id_docente_3

        ORDER BY m.fecha_mesa ASC, t.turno ASC, cur.nombre_curso ASC, dv.nombre_division ASC, mat.materia ASC, m.id_mesa ASC
    ";

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Normalizo salida a lo que espera el frontend
    $data = array_map(function ($r) {
        // “Profesor” para la grilla: muestro el primero; también devuelvo el tribunal completo
        $prof_principal = $r['docente_1'] ?: ($r['docente_2'] ?: $r['docente_3']);

        // id_materia: lo que viene desde PREVIAS
        $idMateria = isset($r['id_materia_previa']) ? (int)$r['id_materia_previa'] : null;

        return [
            'id'         => (int)$r['id_mesa'],
            'id_mesa'    => (int)$r['id_mesa'],
            'id_catedra' => (int)$r['id_catedra'],
            'id_previa'  => (int)$r['id_previa'],

            'fecha'      => (string)$r['fecha_mesa'],
            'id_turno'   => (int)$r['id_turno'],
            'turno'      => (string)$r['turno'],

            // curso/división legibles
            'curso'      => (string)($r['curso'] ?? ''),
            'division'   => (string)($r['division'] ?? ''),

            // materia por PREVIA -> MATERIAS
            'id_materia' => $idMateria,
            'materia'    => (string)($r['materia'] ?? ''),

            // tribunal
            'id_docente_1' => isset($r['id_docente_1']) ? (int)$r['id_docente_1'] : null,
            'id_docente_2' => isset($r['id_docente_2']) ? (int)$r['id_docente_2'] : null,
            'id_docente_3' => isset($r['id_docente_3']) ? (int)$r['id_docente_3'] : null,

            'docente_1'  => (string)($r['docente_1'] ?? ''),
            'docente_2'  => (string)($r['docente_2'] ?? ''),
            'docente_3'  => (string)($r['docente_3'] ?? ''),

            'profesor'   => (string)($prof_principal ?? ''),
            'tribunal'   => array_values(array_filter([
                                $r['docente_1'] ?? null,
                                $r['docente_2'] ?? null,
                                $r['docente_3'] ?? null,
                            ])),
        ];
    }, $rows ?: []);

    echo json_encode(['exito' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['exito' => false, 'mensaje' => 'Error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}

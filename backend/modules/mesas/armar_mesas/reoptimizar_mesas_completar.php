<?php
// backend/modules/mesas/reoptimizar_mesas_completar.php
// -----------------------------------------------------------------------------
// PASADA EXTRA DE REOPTIMIZACIÓN
//
// Objetivo: una vez que ya existen mesas, grupos y no_agrupadas,
// intentamos que las mesas que quedaron sueltas (singles en mesas_no_agrupadas)
// se sumen como 4° número de mesa a algún grupo compatible.
//
// AHORA:
//  1) Primero intenta sumar singles a grupos del MISMO día/turno (como antes).
//  2) Luego, para las que siguen sueltas, permite CAMBIARLES fecha/turno
//     para meterlas como 2º/3º/4º número en un grupo de la misma área,
//     siempre que:
//
//     - no repita DNIs en el grupo,
//     - respete docentes_bloques_no,
//     - ningún alumno rinda dos mesas en ese mismo slot,
//     - NO ROMPA CORRELATIVIDAD:
//         * Para cada alumno (dni) y cada materias.correlativa (>0),
//           la mesa base (menor materia_id_curso) debe quedar en un
//           slot ANTERIOR a las avanzadas.
//         * Se impide mover una mesa a un slot que violaría eso.
//
//  3) NUEVO: si aún quedan singles sin lugar, intenta usar grupos de 4 mesas
//     como "donantes": saca una mesa de ese grupo de 4 y la combina con la
//     mesa single para formar un grupo nuevo (2 mesas), dejando el original
//     con 3, siempre respetando TODAS las restricciones.
//
//  4) PROHIBIDO: las mesas especiales (7º y 3º técnico) NO se tocan:
//     - no se suman a grupos,
//     - no se mueven a otros slots,
//     - no se usan como donantes.
//
// NO se crean mesas nuevas, solo se reubican mesas y se crean nuevos grupos.
// -----------------------------------------------------------------------------


declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/../../../config/db.php';

// ---------------- Helper para obtener hora según turno ----------------
function horaSegunTurno(int $turno): string {
    return $turno === 1 ? '08:00:00' : '13:30:00';
}

// ---------------- Utils ----------------
function respondJSON(bool $ok, $payload = null, int $status = 200): void {
    if (ob_get_length()) { @ob_clean(); }
    http_response_code($status);
    echo json_encode(
        $ok ? ['exito' => true,  'data' => $payload]
           : ['exito' => false, 'mensaje' => (is_string($payload) ? $payload : 'Error desconocido')],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function bad_request(string $m): void {
    respondJSON(false, $m, 400);
}

function validarFecha(?string $s): bool {
    if (!$s) return false;
    $d = DateTime::createFromFormat('Y-m-d', $s);
    return $d && $d->format('Y-m-d') === $s;
}

/**
 * ✅ FIX CLAVE:
 * Garantiza que un numero_mesa NO quede en más de un grupo.
 * Elimina $nm de cualquier columna numero_mesa_1..4 en TODOS los grupos,
 * excepto opcionalmente un id_mesa_grupos (para no borrarlo del grupo destino/origen).
 */
function removerMesaDeTodosLosGrupos(PDO $pdo, int $nm, ?int $exceptId = null): void {
    $sql = "
        UPDATE mesas_grupos
        SET
          numero_mesa_1 = IF(numero_mesa_1 = :nm, 0, numero_mesa_1),
          numero_mesa_2 = IF(numero_mesa_2 = :nm, 0, numero_mesa_2),
          numero_mesa_3 = IF(numero_mesa_3 = :nm, 0, numero_mesa_3),
          numero_mesa_4 = IF(numero_mesa_4 = :nm, 0, numero_mesa_4)
        WHERE :nm IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4)
          AND (:exceptId IS NULL OR id_mesa_grupos <> :exceptId)
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':nm' => $nm, ':exceptId' => $exceptId]);
}

/**
 * ✅ "Guardrail" de seguridad: si quedan duplicados en mesas_grupos, abortamos.
 * Devuelve array de duplicados: [ ['nm'=>123,'cant'=>2], ... ]
 */
function detectarDuplicadosEnGrupos(PDO $pdo): array {
    $sql = "
        SELECT nm, COUNT(*) cant FROM (
            SELECT numero_mesa_1 nm FROM mesas_grupos WHERE numero_mesa_1 > 0
            UNION ALL
            SELECT numero_mesa_2 nm FROM mesas_grupos WHERE numero_mesa_2 > 0
            UNION ALL
            SELECT numero_mesa_3 nm FROM mesas_grupos WHERE numero_mesa_3 > 0
            UNION ALL
            SELECT numero_mesa_4 nm FROM mesas_grupos WHERE numero_mesa_4 > 0
        ) x
        GROUP BY nm
        HAVING COUNT(*) > 1
        ORDER BY cant DESC, nm
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $out[] = ['nm' => (int)$r['nm'], 'cant' => (int)$r['cant']];
    }
    return $out;
}

/**
 * Carga docentes_bloques_no:
 *   - docNoTurn[id_docente][id_turno] = true
 *   - docNoDay[id_docente][fecha][id_turno] = true  (si turno NULL => bloquea ambos turnos ese día)
 */
function cargarBloquesDocentes(PDO $pdo): array {
    $docNoTurn = [];
    $docNoDay  = [];

    $rs = $pdo->query("SELECT id_docente, id_turno, fecha FROM docentes_bloques_no");
    if ($rs) {
        foreach ($rs->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $idd = (int)$r['id_docente'];
            $t   = isset($r['id_turno']) && $r['id_turno'] !== null ? (int)$r['id_turno'] : null;
            $f   = $r['fecha'] ?? null;

            if ($t !== null && ($f === null || $f === '')) {
                $docNoTurn[$idd][$t] = true;
                continue;
            }

            if ($t === null && $f !== null && $f !== '') {
                $docNoDay[$idd][$f][1] = true;
                $docNoDay[$idd][$f][2] = true;
                continue;
            }

            if ($t !== null && $f !== null && $f !== '') {
                $docNoDay[$idd][$f][$t] = true;
            }
        }
    }

    return [$docNoTurn, $docNoDay];
}

/**
 * slotProhibido(id_docente, fecha, turno)
 */
function buildSlotProhibido(array $docNoTurn, array $docNoDay): callable {
    return function (int $id_docente, string $fecha, int $turno) use ($docNoTurn, $docNoDay): bool {
        if (isset($docNoTurn[$id_docente][$turno])) return true;
        if (isset($docNoDay[$id_docente][$fecha][$turno])) return true;
        return false;
    };
}

/**
 * Devuelve:
 *   - dnisPorMesa[numero_mesa] = array de DNIs (string)
 *   - areaPorMesa[numero_mesa] = id_area (int)
 *   - docsPorMesa[numero_mesa] = array de id_docente (int)
 */
function cargarInfoMesas(PDO $pdo): array {
    $sql = "
        SELECT
            m.numero_mesa,
            p.dni,
            mat.id_area,
            m.id_docente
        FROM mesas m
        INNER JOIN previas  p  ON p.id_previa   = m.id_previa
        INNER JOIN catedras c  ON c.id_catedra  = m.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c.id_materia
        GROUP BY m.numero_mesa, p.dni, mat.id_area, m.id_docente
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $dnisPorMesa = [];
    $areaPorMesa = [];
    $docsPorMesa = [];

    foreach ($rows as $r) {
        $nm   = (int)$r['numero_mesa'];
        $dni  = (string)$r['dni'];
        $area = (int)$r['id_area'];
        $doc  = (int)$r['id_docente'];

        if (!isset($dnisPorMesa[$nm])) $dnisPorMesa[$nm] = [];
        if (!in_array($dni, $dnisPorMesa[$nm], true)) {
            $dnisPorMesa[$nm][] = $dni;
        }

        $areaPorMesa[$nm] = $area;

        if (!isset($docsPorMesa[$nm])) $docsPorMesa[$nm] = [];
        if ($doc > 0 && !in_array($doc, $docsPorMesa[$nm], true)) {
            $docsPorMesa[$nm][] = $doc;
        }
    }

    return [$dnisPorMesa, $areaPorMesa, $docsPorMesa];
}

/**
 * Carga mesas especiales (7º y 3º técnico)
 *   7º: mesa cuyos cursos son todos 7
 *   3º técnico: mesas con materias 18,32,132 exclusivas por alumno
 */
function cargarMesasEspeciales(PDO $pdo): array {
    $out = [];

    // 7º: mesa cuyos cursos son todos 7
    $rows7 = $pdo->query("
        SELECT m.numero_mesa
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        GROUP BY m.numero_mesa
        HAVING MIN(p.materia_id_curso) = 7
           AND MAX(p.materia_id_curso) = 7
    ")->fetchAll(PDO::FETCH_COLUMN);

    foreach ($rows7 as $nm) {
        $out[(int)$nm] = true;
    }

    // 3º técnico especial: misma definición que ya usás en armar_mesa_grupo.php
    $rowsTec = $pdo->query("
        SELECT m.numero_mesa
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        WHERE p.materia_id_curso = 3
        GROUP BY m.numero_mesa
        HAVING
          SUM(CASE WHEN p.id_materia IN (18,32,132) THEN 1 ELSE 0 END) >= 1
          AND COUNT(DISTINCT p.dni) = 1
          AND SUM(CASE WHEN p.id_materia NOT IN (18,32,132) THEN 1 ELSE 0 END) = 0
    ")->fetchAll(PDO::FETCH_COLUMN);

    foreach ($rowsTec as $nm) {
        $out[(int)$nm] = true;
    }

    return $out;
}

/**
 * Devuelve:
 *   - grupos[idx] = [
 *       'id'      => id_mesa_grupos,
 *       'fecha'   => fecha_mesa,
 *       'turno'   => id_turno,
 *       'hora'    => hora,
 *       'area'    => id_area,
 *       'mesas'   => [n1, n2, ...],
 *     ]
 */
function cargarGrupos(PDO $pdo): array {
    $sql = "
        SELECT
            g.id_mesa_grupos,
            g.fecha_mesa,
            g.id_turno,
            g.hora,
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
            mat.id_area
        FROM mesas_grupos g
        INNER JOIN mesas     m  ON m.numero_mesa = 
            CASE
                WHEN g.numero_mesa_1 > 0 THEN g.numero_mesa_1
                WHEN g.numero_mesa_2 > 0 THEN g.numero_mesa_2
                WHEN g.numero_mesa_3 > 0 THEN g.numero_mesa_3
                ELSE g.numero_mesa_4
            END
        INNER JOIN catedras  c  ON c.id_catedra  = m.id_catedra
        INNER JOIN materias  mat ON mat.id_materia = c.id_materia
        GROUP BY
            g.id_mesa_grupos,
            g.fecha_mesa,
            g.id_turno,
            g.hora,
            g.numero_mesa_1,
            g.numero_mesa_2,
            g.numero_mesa_3,
            g.numero_mesa_4,
            mat.id_area
        ORDER BY g.fecha_mesa, g.id_turno, mat.id_area, g.id_mesa_grupos
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $grupos = [];
    foreach ($rows as $r) {
        $mesas = [];
        foreach (['numero_mesa_1','numero_mesa_2','numero_mesa_3','numero_mesa_4'] as $col) {
            $v = (int)$r[$col];
            if ($v > 0) $mesas[] = $v;
        }
        if (!$mesas) continue;

        $grupos[] = [
            'id'    => (int)$r['id_mesa_grupos'],
            'fecha' => $r['fecha_mesa'],
            'turno' => (int)$r['id_turno'],
            'hora'  => $r['hora'] ?? horaSegunTurno((int)$r['id_turno']),
            'area'  => (int)$r['id_area'],
            'mesas' => $mesas,
        ];
    }
    return $grupos;
}

/**
 * Devuelve:
 *   - singles = [
 *       [
 *         'numero_mesa' => n,
 *         'fecha'       => f,
 *         'turno'       => t,
 *         'area'        => a
 *       ],
 *       ...
 *     ]
 */
function cargarSingles(PDO $pdo): array {
    $sql = "
        SELECT
            l.numero_mesa,
            l.fecha_mesa,
            l.id_turno,
            mat.id_area
        FROM mesas_no_agrupadas l
        INNER JOIN mesas m      ON m.numero_mesa = l.numero_mesa
        INNER JOIN catedras c   ON c.id_catedra  = m.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c.id_materia
        ORDER BY l.fecha_mesa, l.id_turno, mat.id_area, l.numero_mesa
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'numero_mesa' => (int)$r['numero_mesa'],
            'fecha'       => $r['fecha_mesa'],
            'turno'       => (int)$r['id_turno'],
            'area'        => (int)$r['id_area'],
        ];
    }
    return $out;
}

/**
 * Saca la unión de DNIs de una lista de numero_mesa usando dnisPorMesa.
 */
function unionDNIsMesas(array $dnisPorMesa, array $mesas): array {
    $u = [];
    foreach ($mesas as $nm) {
        foreach ($dnisPorMesa[$nm] ?? [] as $dni) {
            $u[$dni] = true;
        }
    }
    return array_keys($u);
}

/**
 * Construye:
 *  - slotIndex["YYYY-MM-DD|turno"] = idx (0..N-1) ordenado cronológicamente
 *  - horarioAlumno[dni]["YYYY-MM-DD|turno"] = true
 */
function buildSlotsYHorario(PDO $pdo): array {
    $rowsSlots = $pdo->query("
        SELECT DISTINCT fecha_mesa, id_turno
        FROM mesas
        WHERE fecha_mesa IS NOT NULL AND id_turno IS NOT NULL
        ORDER BY fecha_mesa, id_turno
    ")->fetchAll(PDO::FETCH_ASSOC);

    $slotIndex = [];
    $idx = 0;
    foreach ($rowsSlots as $r) {
        $key = $r['fecha_mesa'] . '|' . (int)$r['id_turno'];
        if (!isset($slotIndex[$key])) {
            $slotIndex[$key] = $idx++;
        }
    }

    $horarioAlumno = [];
    $rowsHA = $pdo->query("
        SELECT p.dni, m.fecha_mesa, m.id_turno
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rowsHA as $r) {
        $dni = (string)$r['dni'];
        $key = $r['fecha_mesa'] . '|' . (int)$r['id_turno'];
        $horarioAlumno[$dni][$key] = true;
    }

    return [$slotIndex, $horarioAlumno];
}

/**
 * Construye restricciones de correlatividad por numero_mesa.
 */
function buildCorrelRestricciones(PDO $pdo, array $slotIndex): array {
    $sql = "
        SELECT
            m.numero_mesa,
            p.dni,
            p.materia_id_curso,
            mat.correlativa,
            m.fecha_mesa,
            m.id_turno
        FROM mesas m
        INNER JOIN previas p    ON p.id_previa   = m.id_previa
        INNER JOIN materias mat ON mat.id_materia = p.id_materia
        WHERE p.inscripcion = 1
          AND mat.correlativa IS NOT NULL
          AND mat.correlativa <> 0
          AND m.fecha_mesa IS NOT NULL
          AND m.id_turno   IS NOT NULL
    ";
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $porClave = [];
    foreach ($rows as $r) {
        $keySlot = $r['fecha_mesa'] . '|' . (int)$r['id_turno'];
        $idxSlot = $slotIndex[$keySlot] ?? -1;

        $clave = $r['dni'] . '|' . $r['correlativa'];
        $porClave[$clave][] = [
            'numero_mesa' => (int)$r['numero_mesa'],
            'curso'       => (int)$r['materia_id_curso'],
            'idx_slot'    => $idxSlot,
        ];
    }

    $restricciones = [];

    foreach ($porClave as $lst) {
        if (count($lst) < 2) continue;

        usort($lst, fn($a,$b) => $a['curso'] <=> $b['curso']);

        $minCurso = $lst[0]['curso'];

        $bases = array_filter($lst, fn($x) => $x['curso'] === $minCurso);
        $avanz = array_filter($lst, fn($x) => $x['curso'] >  $minCurso);

        if (!$avanz) continue;

        foreach ($bases as $b) {
            foreach ($avanz as $a) {
                if ($b['idx_slot'] < 0 || $a['idx_slot'] < 0) continue;

                $nmBase = $b['numero_mesa'];
                $nmAdv  = $a['numero_mesa'];

                $restricciones[$nmBase][] = [
                    'tipo'     => 'base',
                    'idx_otro' => $a['idx_slot'],
                ];
                $restricciones[$nmAdv][] = [
                    'tipo'     => 'adv',
                    'idx_otro' => $b['idx_slot'],
                ];
            }
        }
    }

    return $restricciones;
}

function respetaCorrelMovimiento(
    int $nm,
    string $fecha,
    int $turno,
    array $slotIndex,
    array $restricciones
): bool {
    if (!isset($restricciones[$nm])) return true;

    $key = $fecha . '|' . $turno;
    if (!isset($slotIndex[$key])) {
        return true;
    }
    $idxNuevo = $slotIndex[$key];

    foreach ($restricciones[$nm] as $r) {
        $idxOtro = $r['idx_otro'];
        if ($idxOtro < 0) continue;

        if ($r['tipo'] === 'base') {
            if ($idxNuevo >= $idxOtro) return false;
        } else {
            if ($idxNuevo <= $idxOtro) return false;
        }
    }

    return true;
}

// ====================== MAIN ======================
if (!isset($pdo) || !$pdo instanceof PDO) {
    bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respondJSON(false, 'Método no permitido', 405);
    }

    $input = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($input)) $input = [];

    $dryRun      = !empty($input['dry_run']);
    $filtroFecha = $input['fecha_mesa'] ?? null;
    $filtroTurno = $input['id_turno']   ?? null;

    if ($filtroFecha !== null && !validarFecha((string)$filtroFecha)) {
        bad_request("Parámetro 'fecha_mesa' inválido (YYYY-MM-DD).");
    }
    if ($filtroTurno !== null && !in_array((int)$filtroTurno, [1,2], true)) {
        bad_request("Parámetro 'id_turno' inválido (1|2). Debe ser 1 (mañana) o 2 (tarde).");
    }

    [$docNoTurn, $docNoDay] = cargarBloquesDocentes($pdo);
    $slotProhibido = buildSlotProhibido($docNoTurn, $docNoDay);

    [$dnisPorMesa, $areaPorMesa, $docsPorMesa] = cargarInfoMesas($pdo);

    // Cargar mesas especiales
    $mesasEspeciales = cargarMesasEspeciales($pdo);

    // Helper para detectar si un grupo contiene alguna mesa especial
    $grupoTieneEspecial = function(array $mesas) use ($mesasEspeciales): bool {
        foreach ($mesas as $nm) {
            if (!empty($mesasEspeciales[(int)$nm])) return true;
        }
        return false;
    };

    [$slotIndex, $horarioAlumno] = buildSlotsYHorario($pdo);

    $correlRestricciones = buildCorrelRestricciones($pdo, $slotIndex);

    $grupos = cargarGrupos($pdo);

    $singles = cargarSingles($pdo);

    if ($filtroFecha !== null || $filtroTurno !== null) {
        $gruposFil = [];
        foreach ($grupos as $g) {
            if ($filtroFecha !== null && $g['fecha'] !== $filtroFecha) continue;
            if ($filtroTurno !== null && $g['turno'] !== (int)$filtroTurno) continue;
            $gruposFil[] = $g;
        }
        $grupos = $gruposFil;

        $singlesFil = [];
        foreach ($singles as $s) {
            if ($filtroFecha !== null && $s['fecha'] !== $filtroFecha) continue;
            if ($filtroTurno !== null && $s['turno'] !== (int)$filtroTurno) continue;
            $singlesFil[] = $s;
        }
        $singles = $singlesFil;
    }

    $gruposPorSlot = [];
    $gruposPorArea = [];

    foreach ($grupos as $idx => $g) {
        $key = $g['fecha'] . '|' . $g['turno'] . '|' . $g['area'];
        if (!isset($gruposPorSlot[$key])) $gruposPorSlot[$key] = [];
        $gruposPorSlot[$key][] = $idx;

        if (!isset($gruposPorArea[$g['area']])) $gruposPorArea[$g['area']] = [];
        $gruposPorArea[$g['area']][] = $idx;
    }

    $singlesPorSlot = [];
    foreach ($singles as $i => $s) {
        $key = $s['fecha'] . '|' . $s['turno'] . '|' . $s['area'];
        if (!isset($singlesPorSlot[$key])) $singlesPorSlot[$key] = [];
        $singlesPorSlot[$key][] = $i;
    }

    $stGetGrupo = $pdo->prepare("
        SELECT numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4, hora
        FROM mesas_grupos
        WHERE id_mesa_grupos = :id
        LIMIT 1
    ");

    $stUpdGrupo = $pdo->prepare("
        UPDATE mesas_grupos
        SET numero_mesa_1 = :n1,
            numero_mesa_2 = :n2,
            numero_mesa_3 = :n3,
            numero_mesa_4 = :n4
        WHERE id_mesa_grupos = :id
    ");

    $stDelNoAgr = $pdo->prepare("
        DELETE FROM mesas_no_agrupadas
        WHERE numero_mesa = :n AND fecha_mesa = :f AND id_turno = :t
    ");

    $stUpdMesaSlot = $pdo->prepare("
        UPDATE mesas
        SET fecha_mesa = :f, id_turno = :t
        WHERE numero_mesa = :n
    ");

    // ✅ FIX: Incluir columna hora
    $stInsGrupo = $pdo->prepare("
        INSERT INTO mesas_grupos
            (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4, fecha_mesa, id_turno, hora)
        VALUES
            (:n1, :n2, :n3, :n4, :f, :t, :h)
    ");

    if (!$dryRun) {
        $pdo->beginTransaction();
    }

    $movimientos = [];
    $pendientes  = [];

    // -----------------------------------------------------------------
    // PASADA 1: mismo slot
    // -----------------------------------------------------------------
    foreach ($singlesPorSlot as $slotKey => $idxSingles) {
        if (empty($gruposPorSlot[$slotKey])) {
            [$fecha, $turno, $area] = explode('|', $slotKey);
            $turno = (int)$turno;
            $area  = (int)$area;

            foreach ($idxSingles as $iSingle) {
                $s = $singles[$iSingle];
                $nmSingle = $s['numero_mesa'];
                
                // No tocar mesas especiales
                if (!empty($mesasEspeciales[$nmSingle])) {
                    $pendientes[$nmSingle] = [
                        'numero_mesa' => $nmSingle,
                        'fecha'       => $fecha,
                        'turno'       => $turno,
                        'area'        => $area,
                        'motivo'      => 'mesa_especial_no_tocar',
                    ];
                    continue;
                }
                
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'sin_grupos_en_slot',
                ];
            }
            continue;
        }

        [$fecha, $turno, $area] = explode('|', $slotKey);
        $turno = (int)$turno;
        $area  = (int)$area;

        $idxGruposSlot = $gruposPorSlot[$slotKey];

        $procesadosSingles = [];

        foreach ($idxSingles as $iSingle) {
            if (isset($procesadosSingles[$iSingle])) continue;
            $procesadosSingles[$iSingle] = true;

            $s = $singles[$iSingle];
            $nmSingle = $s['numero_mesa'];

            // No tocar mesas especiales
            if (!empty($mesasEspeciales[$nmSingle])) {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $s['fecha'],
                    'turno'       => (int)$s['turno'],
                    'area'        => (int)$s['area'],
                    'motivo'      => 'mesa_especial_no_tocar',
                ];
                continue;
            }

            $areaMesa = $areaPorMesa[$nmSingle] ?? null;
            if ($areaMesa === null || $areaMesa !== $area) {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $areaMesa ?? -1,
                    'motivo'      => 'area_inconsistente',
                ];
                continue;
            }

            $dnisSingle = $dnisPorMesa[$nmSingle] ?? [];
            $docsSingle = $docsPorMesa[$nmSingle] ?? [];

            $grupoElegidoIdx = null;

            foreach ($idxGruposSlot as $idxG) {
                $g = $grupos[$idxG];

                $mesasG = $g['mesas'];
                
                // Si el grupo tiene mesas especiales, no lo usamos
                if ($grupoTieneEspecial($mesasG)) {
                    continue;
                }
                
                $sizeG  = count($mesasG);
                if ($sizeG >= 4) continue;

                if ((int)$g['area'] !== $area) continue;

                $dnisGrupo = unionDNIsMesas($dnisPorMesa, $mesasG);
                if (!empty(array_intersect($dnisGrupo, $dnisSingle))) continue;

                $bloqueado = false;
                foreach ($docsSingle as $idDoc) {
                    if ($slotProhibido((int)$idDoc, $fecha, $turno)) {
                        $bloqueado = true;
                        break;
                    }
                }
                if ($bloqueado) continue;

                $grupoElegidoIdx = $idxG;
                break;
            }

            if ($grupoElegidoIdx === null) {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'sin_grupo_compatible_en_slot',
                ];
                continue;
            }

            $g = $grupos[$grupoElegidoIdx];

            $stGetGrupo->execute([':id' => $g['id']]);
            $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
            if (!$actual) {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'grupo_desaparecido',
                ];
                continue;
            }

            $n1 = (int)$actual['numero_mesa_1'];
            $n2 = (int)$actual['numero_mesa_2'];
            $n3 = (int)$actual['numero_mesa_3'];
            $n4 = (int)$actual['numero_mesa_4'];

            if (in_array($nmSingle, [$n1,$n2,$n3,$n4], true)) {
                if (!$dryRun) {
                    $stDelNoAgr->execute([
                        ':n' => $nmSingle,
                        ':f' => $fecha,
                        ':t' => $turno,
                    ]);
                }

                $movimientos[] = [
                    'numero_mesa'   => $nmSingle,
                    'fecha'         => $fecha,
                    'turno'         => $turno,
                    'area'          => $area,
                    'grupo_id'      => $g['id'],
                    'accion'        => 'ya_estaba_en_grupo_borrar_single',
                ];
                continue;
            }

            $nNuevo1 = $n1;
            $nNuevo2 = $n2;
            $nNuevo3 = $n3;
            $nNuevo4 = $n4;

            if     ($nNuevo1 === 0) $nNuevo1 = $nmSingle;
            elseif ($nNuevo2 === 0) $nNuevo2 = $nmSingle;
            elseif ($nNuevo3 === 0) $nNuevo3 = $nmSingle;
            elseif ($nNuevo4 === 0) $nNuevo4 = $nmSingle;
            else {
                $pendientes[$nmSingle] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'motivo'      => 'grupo_sin_posiciones_libres_en_slot',
                ];
                continue;
            }

            if ($dryRun) {
                $movimientos[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'grupo_id'    => $g['id'],
                    'antes'       => [$n1,$n2,$n3,$n4],
                    'despues'     => [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4],
                    'accion'      => 'simular_agregar_a_grupo_mismo_slot',
                ];
            } else {
                // ✅ FIX: garantizar que la mesa no esté en ningún otro grupo
                // (por datos basura previos). No tocamos el grupo destino.
                removerMesaDeTodosLosGrupos($pdo, $nmSingle, (int)$g['id']);

                $stUpdGrupo->execute([
                    ':n1' => $nNuevo1,
                    ':n2' => $nNuevo2,
                    ':n3' => $nNuevo3,
                    ':n4' => $nNuevo4,
                    ':id' => $g['id'],
                ]);

                $stDelNoAgr->execute([
                    ':n' => $nmSingle,
                    ':f' => $fecha,
                    ':t' => $turno,
                ]);

                $movimientos[] = [
                    'numero_mesa' => $nmSingle,
                    'fecha'       => $fecha,
                    'turno'       => $turno,
                    'area'        => $area,
                    'grupo_id'    => $g['id'],
                    'antes'       => [$n1,$n2,$n3,$n4],
                    'despues'     => [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4],
                    'accion'      => 'agregado_a_grupo_mismo_slot',
                ];

                $grupos[$grupoElegidoIdx]['mesas'][] = $nmSingle;
            }
        }
    }

    // -----------------------------------------------------------------
    // PASADA 2: reubicar a otros slots
    // -----------------------------------------------------------------
    if (!empty($pendientes)) {
        foreach ($pendientes as $nmSingle => $info) {
            // No tocar mesas especiales
            if (!empty($mesasEspeciales[$nmSingle])) {
                continue;
            }
            
            $fechaOriginal = $info['fecha'];
            $turnoOriginal = (int)$info['turno'];
            $areaMesa      = $areaPorMesa[$nmSingle] ?? null;

            if ($areaMesa === null || $areaMesa <= 0) {
                continue;
            }

            $dnisSingle = $dnisPorMesa[$nmSingle] ?? [];
            $docsSingle = $docsPorMesa[$nmSingle] ?? [];

            $idxGruposArea = $gruposPorArea[$areaMesa] ?? [];
            if (!$idxGruposArea) {
                continue;
            }

            $grupoElegidoIdx = null;
            $fechaDestino = null;
            $turnoDestino = null;
            $antes = null;
            $despues = null;

            $mejorScore = null;

            foreach ($idxGruposArea as $idxG) {
                $g = $grupos[$idxG];

                $mesasG = $g['mesas'];
                
                // Si el grupo tiene mesas especiales, no lo usamos
                if ($grupoTieneEspecial($mesasG)) {
                    continue;
                }
                
                $sizeG  = count($mesasG);
                if ($sizeG >= 4) continue;

                $f = $g['fecha'];
                $t = (int)$g['turno'];

                $dnisGrupo = unionDNIsMesas($dnisPorMesa, $mesasG);
                if (!empty(array_intersect($dnisGrupo, $dnisSingle))) continue;

                $bloqueado = false;
                foreach ($docsSingle as $idDoc) {
                    if ($slotProhibido((int)$idDoc, $f, $t)) {
                        $bloqueado = true;
                        break;
                    }
                }
                if ($bloqueado) continue;

                $keySlot = $f . '|' . $t;
                $choqueHorario = false;
                foreach ($dnisSingle as $dni) {
                    if (isset($horarioAlumno[$dni][$keySlot])) {
                        $choqueHorario = true;
                        break;
                    }
                }
                if ($choqueHorario) continue;

                if (!respetaCorrelMovimiento($nmSingle, $f, $t, $slotIndex, $correlRestricciones)) {
                    continue;
                }

                $stGetGrupo->execute([':id' => $g['id']]);
                $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
                if (!$actual) continue;

                $n1 = (int)$actual['numero_mesa_1'];
                $n2 = (int)$actual['numero_mesa_2'];
                $n3 = (int)$actual['numero_mesa_3'];
                $n4 = (int)$actual['numero_mesa_4'];

                if (in_array($nmSingle, [$n1,$n2,$n3,$n4], true)) {
                    // ya está dentro (basura previa). Lo permitimos como candidato,
                    // pero el FIX va a limpiar duplicados igual.
                } else {
                    if ($n1 !== 0 && $n2 !== 0 && $n3 !== 0 && $n4 !== 0) {
                        continue;
                    }
                }

                $slotKey   = $f . '|' . $t;
                $idxSlot   = $slotIndex[$slotKey] ?? 9999;
                $score     = $sizeG * 100 + $idxSlot;

                if ($mejorScore === null || $score < $mejorScore) {
                    $mejorScore   = $score;
                    $grupoElegidoIdx = $idxG;
                    $fechaDestino = $f;
                    $turnoDestino = $t;
                    $antes = [$n1,$n2,$n3,$n4];

                    $nNuevo1 = $n1;
                    $nNuevo2 = $n2;
                    $nNuevo3 = $n3;
                    $nNuevo4 = $n4;

                    if     ($nNuevo1 === 0) $nNuevo1 = $nmSingle;
                    elseif ($nNuevo2 === 0) $nNuevo2 = $nmSingle;
                    elseif ($nNuevo3 === 0) $nNuevo3 = $nmSingle;
                    elseif ($nNuevo4 === 0) $nNuevo4 = $nmSingle;

                    $despues = [$nNuevo1,$nNuevo2,$nNuevo3,$nNuevo4];
                }
            }

            if ($grupoElegidoIdx === null || $fechaDestino === null) {
                continue;
            }

            $g = $grupos[$grupoElegidoIdx];

            if ($dryRun) {
                $movimientos[] = [
                    'numero_mesa'    => $nmSingle,
                    'fecha_origen'   => $fechaOriginal,
                    'turno_origen'   => $turnoOriginal,
                    'fecha_destino'  => $fechaDestino,
                    'turno_destino'  => $turnoDestino,
                    'area'           => $areaMesa,
                    'grupo_id'       => $g['id'],
                    'antes'          => $antes,
                    'despues'        => $despues,
                    'accion'         => 'simular_reubicar_y_agregar_a_grupo_otro_slot',
                ];
            } else {
                // ✅ FIX: antes de meterla al grupo destino, sacar nmSingle de cualquier otro grupo
                // (si ya estaba en alguno, esto elimina duplicados).
                removerMesaDeTodosLosGrupos($pdo, $nmSingle, (int)$g['id']);

                $stUpdMesaSlot->execute([
                    ':f' => $fechaDestino,
                    ':t' => $turnoDestino,
                    ':n' => $nmSingle,
                ]);

                $stUpdGrupo->execute([
                    ':n1' => $despues[0],
                    ':n2' => $despues[1],
                    ':n3' => $despues[2],
                    ':n4' => $despues[3],
                    ':id' => $g['id'],
                ]);

                $stDelNoAgr->execute([
                    ':n' => $nmSingle,
                    ':f' => $fechaOriginal,
                    ':t' => $turnoOriginal,
                ]);

                $movimientos[] = [
                    'numero_mesa'    => $nmSingle,
                    'fecha_origen'   => $fechaOriginal,
                    'turno_origen'   => $turnoOriginal,
                    'fecha_destino'  => $fechaDestino,
                    'turno_destino'  => $turnoDestino,
                    'area'           => $areaMesa,
                    'grupo_id'       => $g['id'],
                    'antes'          => $antes,
                    'despues'        => $despues,
                    'accion'         => 'reubicado_y_agregado_a_grupo_otro_slot',
                ];

                $grupos[$grupoElegidoIdx]['mesas'][] = $nmSingle;

                $keyOrig  = $fechaOriginal . '|' . $turnoOriginal;
                $keyDest  = $fechaDestino  . '|' . $turnoDestino;
                foreach ($dnisSingle as $dni) {
                    unset($horarioAlumno[$dni][$keyOrig]);
                    $horarioAlumno[$dni][$keyDest] = true;
                }
            }

            unset($pendientes[$nmSingle]);
        }
    }

    // -----------------------------------------------------------------
    // PASADA 3: donantes
    // -----------------------------------------------------------------
    if (!empty($pendientes)) {
        foreach ($pendientes as $nmSingle => $info) {
            // No tocar mesas especiales
            if (!empty($mesasEspeciales[$nmSingle])) {
                continue;
            }
            
            $fechaSingle = $info['fecha'];
            $turnoSingle = (int)$info['turno'];
            $areaMesa    = $areaPorMesa[$nmSingle] ?? null;

            if ($areaMesa === null || $areaMesa <= 0) {
                continue;
            }

            $dnisSingle = $dnisPorMesa[$nmSingle] ?? [];
            $slotKeySingle = $fechaSingle . '|' . $turnoSingle;

            $idxGruposArea = $gruposPorArea[$areaMesa] ?? [];
            if (!$idxGruposArea) {
                continue;
            }

            $grupoDonIdx    = null;
            $nmDonor        = null;
            $dnisDonorSel   = [];
            $antesGrupo     = null;
            $despuesGrupo   = null;

            foreach ($idxGruposArea as $idxG) {
                $g = $grupos[$idxG];
                $mesasG = $g['mesas'];
                
                // Si el grupo tiene mesas especiales, no lo usamos
                if ($grupoTieneEspecial($mesasG)) {
                    continue;
                }
                
                $sizeG  = count($mesasG);

                if ($sizeG !== 4) continue;

                foreach ($mesasG as $candMesa) {
                    // La mesa donante no puede ser especial
                    if (!empty($mesasEspeciales[$candMesa])) {
                        continue;
                    }
                    
                    $dnisDonor = $dnisPorMesa[$candMesa] ?? [];

                    if (!empty(array_intersect($dnisDonor, $dnisSingle))) {
                        continue;
                    }

                    $docsDonor = $docsPorMesa[$candMesa] ?? [];

                    $bloqueado = false;
                    foreach ($docsDonor as $idDoc) {
                        if ($slotProhibido((int)$idDoc, $fechaSingle, $turnoSingle)) {
                            $bloqueado = true;
                            break;
                        }
                    }
                    if ($bloqueado) continue;

                    $choque = false;
                    foreach ($dnisDonor as $dni) {
                        if (isset($horarioAlumno[$dni][$slotKeySingle])) {
                            $choque = true;
                            break;
                        }
                    }
                    if ($choque) continue;

                    if (!respetaCorrelMovimiento($candMesa, $fechaSingle, $turnoSingle, $slotIndex, $correlRestricciones)) {
                        continue;
                    }

                    $grupoDonIdx  = $idxG;
                    $nmDonor      = $candMesa;
                    $dnisDonorSel = $dnisDonor;
                    break 2;
                }
            }

            if ($grupoDonIdx === null || $nmDonor === null) {
                continue;
            }

            $g = $grupos[$grupoDonIdx];

            $stGetGrupo->execute([':id' => $g['id']]);
            $actual = $stGetGrupo->fetch(PDO::FETCH_ASSOC);
            if (!$actual) {
                continue;
            }

            $n1 = (int)$actual['numero_mesa_1'];
            $n2 = (int)$actual['numero_mesa_2'];
            $n3 = (int)$actual['numero_mesa_3'];
            $n4 = (int)$actual['numero_mesa_4'];

            $antesGrupo = [$n1,$n2,$n3,$n4];

            if ($n1 === $nmDonor)      { $n1 = 0; }
            elseif ($n2 === $nmDonor)  { $n2 = 0; }
            elseif ($n3 === $nmDonor)  { $n3 = 0; }
            elseif ($n4 === $nmDonor)  { $n4 = 0; }
            else {
                continue;
            }

            $despuesGrupo = [$n1,$n2,$n3,$n4];

            if ($dryRun) {
                $movimientos[] = [
                    'numero_mesa_single'  => $nmSingle,
                    'numero_mesa_donante' => $nmDonor,
                    'fecha_single'        => $fechaSingle,
                    'turno_single'        => $turnoSingle,
                    'grupo_origen_id'     => $g['id'],
                    'antes_grupo'         => $antesGrupo,
                    'despues_grupo'       => $despuesGrupo,
                    'accion'              => 'simular_rearmar_grupo_lleno_con_single',
                ];
            } else {
                // ✅ FIX: garantizar unicidad global antes de tocar grupos
                // - single: no puede estar en ningún otro grupo
                removerMesaDeTodosLosGrupos($pdo, $nmSingle, null);
                // - donor: puede estar en este grupo origen, pero no en otros
                removerMesaDeTodosLosGrupos($pdo, $nmDonor, (int)$g['id']);

                $stUpdGrupo->execute([
                    ':n1' => $n1,
                    ':n2' => $n2,
                    ':n3' => $n3,
                    ':n4' => $n4,
                    ':id' => $g['id'],
                ]);

                $stUpdMesaSlot->execute([
                    ':f' => $fechaSingle,
                    ':t' => $turnoSingle,
                    ':n' => $nmDonor,
                ]);

                // ✅ FIX: Incluir hora en el nuevo grupo
                $stInsGrupo->execute([
                    ':n1' => $nmSingle,
                    ':n2' => $nmDonor,
                    ':n3' => 0,
                    ':n4' => 0,
                    ':f'  => $fechaSingle,
                    ':t'  => $turnoSingle,
                    ':h'  => horaSegunTurno($turnoSingle),
                ]);
                $nuevoGrupoId = (int)$pdo->lastInsertId();

                $stDelNoAgr->execute([
                    ':n' => $nmSingle,
                    ':f' => $fechaSingle,
                    ':t' => $turnoSingle,
                ]);

                $grupos[$grupoDonIdx]['mesas'] = array_values(
                    array_filter($grupos[$grupoDonIdx]['mesas'], fn($x) => $x !== $nmDonor)
                );

                $keyOld = $g['fecha'] . '|' . (int)$g['turno'];
                foreach ($dnisDonorSel as $dni) {
                    unset($horarioAlumno[$dni][$keyOld]);
                    $horarioAlumno[$dni][$slotKeySingle] = true;
                }

                $movimientos[] = [
                    'numero_mesa_single'  => $nmSingle,
                    'numero_mesa_donante' => $nmDonor,
                    'fecha_single'        => $fechaSingle,
                    'turno_single'        => $turnoSingle,
                    'grupo_origen_id'     => $g['id'],
                    'nuevo_grupo_id'      => $nuevoGrupoId,
                    'antes_grupo'         => $antesGrupo,
                    'despues_grupo'       => $despuesGrupo,
                    'accion'              => 'rearmar_grupo_lleno_con_single',
                ];
            }

            unset($pendientes[$nmSingle]);
        }
    }

    $sinLugar = array_values($pendientes);

    // ✅ Guardrail final: si quedaron duplicados en mesas_grupos, abortamos (rollback).
    $dups = detectarDuplicadosEnGrupos($pdo);
    if (!empty($dups)) {
        if ($dryRun) {
            $movimientos[] = [
                'accion' => 'WARNING_DUPLICADOS_DETECTADOS_DRYRUN',
                'duplicados' => $dups,
            ];
        } else {
            throw new RuntimeException("Se detectaron numero_mesa duplicados en mesas_grupos. Abortando para no guardar corrupción. Ej: nm={$dups[0]['nm']} cant={$dups[0]['cant']}");
        }
    }

    if (!$dryRun && $pdo->inTransaction()) {
        $pdo->commit();
    }

    respondJSON(true, [
        'resumen' => [
            'dry_run'           => $dryRun ? 1 : 0,
            'movimientos'       => count($movimientos),
            'singles_sin_lugar' => count($sinLugar),
        ],
        'detalle' => [
            'movimientos'       => $movimientos,
            'singles_sin_lugar' => $sinLugar,
        ],
        'nota' => 'Reoptimización avanzada: primero agrupa singles en el mismo día/turno, ' .
                  'luego los reubica en otros slots, y finalmente usa grupos de 4 como donantes ' .
                  'para formar grupos nuevos 2+3, respetando DNIs, bloques docentes, horarios y ' .
                  'correlatividad (base antes que avanzadas). Las mesas especiales (7º y 3º técnico) ' .
                  'NO se tocan en ningún paso.'
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respondJSON(false, 'Error en el servidor: ' . $e->getMessage(), 500);
} 
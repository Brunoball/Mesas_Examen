<?php
// backend/modules/mesas/reoptimizar_mesas.php
// -----------------------------------------------------------------------------
// Reoptimiza mesas para maximizar agrupamiento y RESPETAR CORRELATIVIDAD.
//   - Usa docentes_bloques_no para bloqueos.
//   - Mantiene lógica de 7° año y 3° técnico especial.
//   - Nunca deja mesas “perdidas”: siempre están en grupo o en mesas_no_agrupadas.
//   - CORRELATIVIDAD ESTRICTA:
//        * Dos materias son correlativas si materias.correlativa es el mismo
//          número (>0) para ambas.
//        * Para cada alumno (dni) y cada valor de correlativa, la materia con
//          menor materia_id_curso es la BASE y DEBE IR ANTES en el calendario
//          que las otras (avanzadas).
//        * Esa mesa base se marca con prioridad = 1, y el algoritmo favorece
//          que las prioridad 1 entren en slots tempranos.
// -----------------------------------------------------------------------------

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../../config/db.php';

function respond(bool $ok, $payload = null, int $status = 200): void {
    if (ob_get_length()) { @ob_clean(); }
    http_response_code($status);
    echo json_encode(
        $ok ? ['exito'=>true, 'data'=>$payload]
           : ['exito'=>false, 'mensaje'=>(is_string($payload)?$payload:'Error desconocido')],
        JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES
    );
    exit;
}
function bad_request(string $m): void { respond(false, $m, 400); }

function validarFecha(?string $s): bool {
    if(!$s) return false;
    $d = DateTime::createFromFormat('Y-m-d', $s);
    return $d && $d->format('Y-m-d') === $s;
}
function rangoFechas(string $inicio, string $fin): array {
    $di = new DateTime($inicio);
    $df = new DateTime($fin);
    if ($df < $di) return [];
    $out = [];
    while ($di <= $df) {
        $dow = (int)$di->format('N'); // 1 = lunes, 7 = domingo
        if ($dow <= 5) {              // solo lunes a viernes
            $out[] = $di->format('Y-m-d');
        }
        $di->modify('+1 day');
    }
    return $out;
}

function pad4(array $g): array {
    $n = count($g);
    if ($n === 1) return [$g[0], 0, 0, 0];
    if ($n === 2) return [$g[0], $g[1], 0, 0];
    if ($n === 3) return [$g[0], $g[1], $g[2], 0];
    return [$g[0], $g[1], $g[2], $g[3]];
}

// hora según turno para INSERTS
function horaSegunTurno(int $turno): string {
    return $turno === 1 ? '07:30:00' : '13:30:00';
}

if (!isset($pdo) || !$pdo instanceof PDO) {
    bad_request("Error: no se encontró la conexión PDO (backend/config/db.php).");
}

// 🔥 Sacamos ONLY_FULL_GROUP_BY SOLO en esta conexión
try {
    $pdo->exec("SET sql_mode = (SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))");
} catch (Throwable $e) {
    // si no deja, seguimos igual
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(false, 'Método no permitido', 405);

    $input = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($input)) $input = [];

    $dryRun   = !empty($input['dry_run']);
    $maxIter  = max(1, min(20, (int)($input['max_iter'] ?? 5)));
    $soloArea = isset($input['solo_area']) ? (int)$input['solo_area'] : null;

    $fi = $input['fecha_inicio'] ?? null;
    $ff = $input['fecha_fin'] ?? null;
    if (($fi && !validarFecha($fi)) || ($ff && !validarFecha($ff))) {
        bad_request("Parámetros de fecha inválidos (YYYY-MM-DD).");
    }

    // ------------------------------------------------------------------
    // BLOQUEOS DOCENTES
    // ------------------------------------------------------------------
    $docNoTurn = [];
    $docNoDay  = [];
    $rsBN = $pdo->query("SELECT id_docente, id_turno, fecha FROM docentes_bloques_no");
    if ($rsBN) {
        foreach ($rsBN->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $idd = (int)$r['id_docente'];
            $t   = array_key_exists('id_turno', $r) && $r['id_turno'] !== null ? (int)$r['id_turno'] : null;
            $f   = array_key_exists('fecha',    $r) ? $r['fecha'] : null;

            if ($t !== null && ($f === null || $f === '')) {
                $docNoTurn[$idd][$t] = true;
                continue;
            }
            if (($t === null) && ($f !== null && $f !== '')) {
                $docNoDay[$idd][$f][1] = true;
                $docNoDay[$idd][$f][2] = true;
                continue;
            }
            if (($t !== null) && ($f !== null && $f !== '')) {
                $docNoDay[$idd][$f][$t] = true;
            }
        }
    }
    $slotProhibido = function (int $id_docente, string $fecha, int $turno) use ($docNoTurn, $docNoDay): bool {
        if ($id_docente <= 0) return false;
        if (isset($docNoTurn[$id_docente][$turno])) return true;
        if (isset($docNoDay[$id_docente][$fecha][$turno])) return true;
        return false;
    };

    // ------------------------------------------------------------------
    // DNIs POR numero_mesa
    // ------------------------------------------------------------------
    $dnisPorNumero = [];
    $res = $pdo->query("
        SELECT m.numero_mesa, p.dni
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
    ")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($res as $r) {
        $nm  = (int)$r['numero_mesa'];
        $dni = (string)$r['dni'];
        $dnisPorNumero[$nm][$dni] = true;
    }
    foreach ($dnisPorNumero as $nm => $set) {
        $dnisPorNumero[$nm] = array_keys($set);
    }

    $unionDNIs = function (array $numeros) use ($dnisPorNumero): array {
        $u = [];
        foreach ($numeros as $nm) {
            foreach (($dnisPorNumero[$nm] ?? []) as $dni) $u[$dni] = true;
        }
        return array_keys($u);
    };
    $numeroChocaSet = function (int $nm, array $set) use ($dnisPorNumero): bool {
        if ($nm === 0) return false;
        $A = $dnisPorNumero[$nm] ?? [];
        if (!$A || !$set) return false;
        $h = array_flip($set);
        foreach ($A as $x) {
            if (isset($h[$x])) return true;
        }
        return false;
    };

    // ------------------------------------------------------------------
    // HORARIO ALUMNO: evita doble mesa mismo slot
    // ------------------------------------------------------------------
    $horarioAlumno = [];
    $res2 = $pdo->query("
        SELECT p.dni, m.fecha_mesa, m.id_turno
        FROM mesas m
        INNER JOIN previas p ON p.id_previa = m.id_previa
        WHERE m.fecha_mesa IS NOT NULL AND m.id_turno IS NOT NULL
    ")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($res2 as $r) {
        $dni = (string)$r['dni'];
        $f   = $r['fecha_mesa'];
        $t   = (int)$r['id_turno'];
        $horarioAlumno[$dni][$f . '|' . $t] = true;
    }

    // ------------------------------------------------------------------
    // SLOT ACTUAL DE CADA numero_mesa
    // ------------------------------------------------------------------
    $slotMesaActual = [];
    $resSlots = $pdo->query("
        SELECT numero_mesa, fecha_mesa, id_turno
        FROM mesas
        WHERE fecha_mesa IS NOT NULL AND id_turno IS NOT NULL
    ")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($resSlots as $r) {
        $slotMesaActual[(int)$r['numero_mesa']] = [
            'fecha' => $r['fecha_mesa'],
            'turno' => (int)$r['id_turno'],
        ];
    }

    // ------------------------------------------------------------------
    // RANGO DE FECHAS
    // ------------------------------------------------------------------
    if (!$fi || !$ff) {
        $rowMin = $pdo->query("
            SELECT MIN(fecha_mesa) AS fmin, MAX(fecha_mesa) AS fmax
            FROM mesas
            WHERE fecha_mesa IS NOT NULL
        ")->fetch(PDO::FETCH_ASSOC);
        if (!$rowMin || $rowMin['fmin'] === null || $rowMin['fmax'] === null) {
            bad_request("No hay fechas agendadas para deducir rango. Enviá 'fecha_inicio' y 'fecha_fin'.");
        }
        $fi = $fi ?: $rowMin['fmin'];
        $ff = $ff ?: $rowMin['fmax'];
    }
    $fechasRango = rangoFechas($fi, $ff);
    if (!$fechasRango) bad_request("Rango de fechas inválido.");

    $slots = [];
    foreach ($fechasRango as $f) {
        $slots[] = ['fecha' => $f, 'turno' => 1];
        $slots[] = ['fecha' => $f, 'turno' => 2];
    }
    $S = count($slots);

    $slotIndex = function (string $f, int $t) use ($slots): int {
        for ($i = 0; $i < count($slots); $i++) {
            if ($slots[$i]['fecha'] === $f && $slots[$i]['turno'] === $t) return $i;
        }
        return -1;
    };

    // ------------------------------------------------------------------
    // ESTADO DE GRUPOS
    // ------------------------------------------------------------------
    $stGr = $pdo->prepare("
        SELECT g.id_mesa_grupos,
               g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4,
               g.fecha_mesa, g.id_turno,
               mat.id_area AS id_area
        FROM mesas_grupos g
        INNER JOIN mesas m1 ON m1.numero_mesa = g.numero_mesa_1
        INNER JOIN catedras c1 ON c1.id_catedra = m1.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c1.id_materia
    ");
    $stGr->execute();
    $grupos = $stGr->fetchAll(PDO::FETCH_ASSOC);

    $bucket = []; // "$f|$t|$area" => [ 'id_g', 'nums'=>[], 'dnis'=>set ]
    foreach ($grupos as $g) {
        $f   = $g['fecha_mesa'];
        $t   = (int)$g['id_turno'];
        $a   = (int)$g['id_area'];
        $key = "$f|$t|$a";
        $nums = array_values(array_filter([
            (int)$g['numero_mesa_1'],
            (int)$g['numero_mesa_2'],
            (int)$g['numero_mesa_3'],
            (int)$g['numero_mesa_4']
        ], fn($x) => $x > 0));

        if (!isset($bucket[$key])) {
            $bucket[$key] = [
                'id_g'  => $g['id_mesa_grupos'],
                'fecha'=> $f,
                'turno'=> $t,
                'area' => $a,
                'nums' => [],
                'dnis' => []
            ];
        }
        $bucket[$key]['nums'] = array_values(array_unique(array_merge($bucket[$key]['nums'], $nums)));
    }
    foreach ($bucket as $k => &$b) {
        $b['dnis'] = array_flip($unionDNIs($b['nums']));
    }
    unset($b);

    // ------------------------------------------------------------------
    // MESAS NO AGRUPADAS
    // ------------------------------------------------------------------
    $sqlNo = "
        SELECT
            l.numero_mesa,
            l.fecha_mesa,
            l.id_turno,
            mat.id_area         AS id_area,
            MIN(m.id_docente)   AS id_docente,
            MAX(m.prioridad)    AS prioridad
        FROM mesas_no_agrupadas l
        INNER JOIN mesas m      ON m.numero_mesa = l.numero_mesa
        INNER JOIN catedras c   ON c.id_catedra  = m.id_catedra
        INNER JOIN materias mat ON mat.id_materia = c.id_materia
    ";
    if ($soloArea !== null) {
        $sqlNo .= " WHERE mat.id_area = " . (int)$soloArea . " ";
    }
    $sqlNo .= "
        GROUP BY
            l.numero_mesa,
            l.fecha_mesa,
            l.id_turno,
            mat.id_area
        ORDER BY
            mat.id_area,
            prioridad DESC,
            l.numero_mesa
    ";
    $noAgr = $pdo->query($sqlNo)->fetchAll(PDO::FETCH_ASSOC);

    // Docente por numero_mesa
    $docPorNM = [];
    $res3 = $pdo->query("
        SELECT m.numero_mesa, MIN(m.id_docente) AS id_docente
        FROM mesas m
        GROUP BY m.numero_mesa
    ")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($res3 as $r) {
        $docPorNM[(int)$r['numero_mesa']] = (int)$r['id_docente'];
    }

    // ------------------------------------------------------------------
    // HELPERS SQL
    // ------------------------------------------------------------------
    $stUpdMesaSlot = $pdo->prepare("
        UPDATE mesas
           SET fecha_mesa = ?, id_turno = ?
         WHERE numero_mesa = ?
    ");
    $stInsGroup = $pdo->prepare("
        INSERT INTO mesas_grupos
          (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4, fecha_mesa, id_turno, hora)
        VALUES (:a,:b,:c,:d,:f,:t,:h)
    ");
    $stUpdGroupToAdd = $pdo->prepare("
        UPDATE mesas_grupos
           SET numero_mesa_1 = IF(numero_mesa_1=0, :nm, numero_mesa_1),
               numero_mesa_2 = IF(numero_mesa_2=0, :nm, numero_mesa_2),
               numero_mesa_3 = IF(numero_mesa_3=0, :nm, numero_mesa_3),
               numero_mesa_4 = IF(numero_mesa_4=0, :nm, numero_mesa_4)
         WHERE id_mesa_grupos = :idg
           AND (0 IN (numero_mesa_1, numero_mesa_2, numero_mesa_3, numero_mesa_4))
    ");
    $stDelLeftExact = $pdo->prepare("
        DELETE FROM mesas_no_agrupadas
         WHERE numero_mesa = :n AND fecha_mesa = :f AND id_turno = :t
    ");
    $stDelLeftByMesa = $pdo->prepare("
        DELETE FROM mesas_no_agrupadas
         WHERE numero_mesa = :n
    ");
    $stInsLeft = $pdo->prepare("
        INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
        VALUES (:n,:f,:t,:h)
    ");
    $stDupGroupExact = $pdo->prepare("
        SELECT 1 FROM mesas_grupos
         WHERE fecha_mesa = :f AND id_turno = :t
           AND numero_mesa_1 = :a AND numero_mesa_2 = :b
           AND numero_mesa_3 = :c AND numero_mesa_4 = :d
         LIMIT 1
    ");
    $findGrupoDeNM = $pdo->prepare("
        SELECT id_mesa_grupos,numero_mesa_1,numero_mesa_2,numero_mesa_3,numero_mesa_4,fecha_mesa,id_turno
        FROM mesas_grupos
        WHERE numero_mesa_1=:nm OR numero_mesa_2=:nm OR numero_mesa_3=:nm OR numero_mesa_4=:nm
        LIMIT 1
    ");

    // Carga de slots
    $slotCarga = array_fill(0, $S, 0);
    foreach ($bucket as $k => $b) {
        $s = $slotIndex($b['fecha'], $b['turno']);
        if ($s >= 0) $slotCarga[$s] += count($b['nums']);
    }

    // ------------------------------------------------------------------
    // PRIORIDAD POR CORRELATIVIDAD
    // ------------------------------------------------------------------
    $prioridadMesa = [];
    $rowsPrio = $pdo->query("SELECT numero_mesa, prioridad FROM mesas")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rowsPrio as $r) {
        $prioridadMesa[(int)$r['numero_mesa']] = (int)$r['prioridad'];
    }

    $sqlMesaMat = "
        SELECT
            m.numero_mesa,
            p.dni,
            p.id_materia,
            p.materia_id_curso AS materia_id_curso,
            mat.correlativa
        FROM mesas m
        INNER JOIN previas  p   ON p.id_previa   = m.id_previa
        INNER JOIN materias mat ON mat.id_materia = p.id_materia
        WHERE p.inscripcion = 1
          AND mat.correlativa IS NOT NULL
          AND mat.correlativa <> 0
    ";
    $rowsMesaMat = $pdo->query($sqlMesaMat)->fetchAll(PDO::FETCH_ASSOC);

    $porDni = []; // dni => [ nm => info ]
    foreach ($rowsMesaMat as $r) {
        $dni = (string)$r['dni'];
        $nm  = (int)$r['numero_mesa'];
        $porDni[$dni][$nm] = [
            'id_materia'  => (int)$r['id_materia'],
            'curso'       => (int)$r['materia_id_curso'],
            'correlativa' => (int)$r['correlativa'],
        ];
    }

    foreach ($porDni as $dni => $mesasAlumno) {
        $porCorr = [];
        foreach ($mesasAlumno as $nm => $info) {
            $corr = $info['correlativa'];
            if ($corr <= 0) continue;
            $porCorr[$corr][$nm] = $info;
        }
        foreach ($porCorr as $corr => $mesasCorr) {
            if (count($mesasCorr) < 2) continue;
            uasort($mesasCorr, fn($a,$b)=>$a['curso'] <=> $b['curso']);
            $nmBase = array_key_first($mesasCorr);
            $prioridadMesa[$nmBase] = 1;
        }
    }

    if (!$dryRun && !empty($prioridadMesa)) {
        $stSetPrio = $pdo->prepare("
            UPDATE mesas
               SET prioridad = GREATEST(prioridad, :prio)
             WHERE numero_mesa = :nm
        ");
        foreach ($prioridadMesa as $nm => $prio) {
            if ($prio > 0) {
                $stSetPrio->execute([':prio'=>$prio, ':nm'=>$nm]);
            }
        }
    }

    // ------------------------------------------------------------------
    // ELEGIR SLOT (general)
    // ------------------------------------------------------------------
    $eligeSlot = function (array $nums, ?int $areaHint) use (&$slots, &$slotCarga, &$docPorNM, $slotProhibido, $dnisPorNumero, $horarioAlumno, $prioridadMesa, $S): int {
        $dnis = [];
        foreach ($nums as $nm) {
            foreach (($dnisPorNumero[$nm] ?? []) as $d) $dnis[$d] = true;
        }
        $dnis = array_keys($dnis);

        $tienePrioridad = false;
        foreach ($nums as $nm) {
            if (($prioridadMesa[$nm] ?? 0) > 0) {
                $tienePrioridad = true;
                break;
            }
        }

        $cands = [];
        for ($s = 0; $s < count($slots); $s++) {
            $f = $slots[$s]['fecha'];
            $t = $slots[$s]['turno'];

            $ok = true;
            foreach ($nums as $nm) {
                $doc = $docPorNM[$nm] ?? 0;
                if ($doc > 0 && $slotProhibido($doc, $f, $t)) {
                    $ok = false;
                    break;
                }
            }
            if (!$ok) continue;

            foreach ($dnis as $dni) {
                if (isset($horarioAlumno[$dni]["$f|$t"])) {
                    $ok = false;
                    break;
                }
            }
            if (!$ok) continue;

            $score = $slotCarga[$s];

            if ($tienePrioridad && $S > 0) {
                $bloque = max(1, (int)ceil($S / 3));
                $bloqueIdx = (int)floor($s / $bloque);
                $score += $bloqueIdx * 1000;
            }

            $cands[] = [$s, $score];
        }
        if (!$cands) return -1;
        usort($cands, fn($A, $B) => $A[1] <=> $B[1] ?: $A[0] <=> $B[0]);
        return $cands[0][0];
    };

    // ------------------------------------------------------------------
    // ¿Cabe en bucket grupo existente?
    // ------------------------------------------------------------------
    $cabeEnBucket = function (int $nm, array $b) use ($numeroChocaSet): bool {
        if (count($b['nums']) >= 4) return false;
        $dnisGrupo = array_keys($b['dnis']);
        if ($numeroChocaSet($nm, $dnisGrupo)) return false;
        return true;
    };

    // ------------------------------------------------------------------
    // Helpers para mover mesas rompiendo grupo si hace falta (para correlatividad)
    // ------------------------------------------------------------------
    $esEspecial = function(int $nm) use ($pdo): bool {
        $sql="
          SELECT p.materia_id_curso, p.id_materia
          FROM mesas m INNER JOIN previas p ON p.id_previa=m.id_previa
          WHERE m.numero_mesa=:nm
          LIMIT 1";
        $st=$pdo->prepare($sql);
        $st->execute([':nm'=>$nm]);
        $r=$st->fetch(PDO::FETCH_ASSOC);
        if(!$r) return false;
        $c=(int)$r['materia_id_curso'];
        $idmat=(int)$r['id_materia'];
        if ($c===7) return true;
        if ($c===3 && in_array($idmat,[18,32,132],true)) return true;
        return false;
    };

    $sacarDeGrupo = function(int $nm) use ($findGrupoDeNM,$pdo,$esEspecial,$stInsLeft) {
        $findGrupoDeNM->execute([':nm'=>$nm]);
        $g=$findGrupoDeNM->fetch(PDO::FETCH_ASSOC);
        if(!$g) return;

        $idg=(int)$g['id_mesa_grupos'];
        $f=$g['fecha_mesa'];
        $t=(int)$g['id_turno'];

        $upd=$pdo->prepare("
            UPDATE mesas_grupos
               SET numero_mesa_1 = IF(numero_mesa_1=:nm,0,numero_mesa_1),
                   numero_mesa_2 = IF(numero_mesa_2=:nm,0,numero_mesa_2),
                   numero_mesa_3 = IF(numero_mesa_3=:nm,0,numero_mesa_3),
                   numero_mesa_4 = IF(numero_mesa_4=:nm,0,numero_mesa_4)
             WHERE id_mesa_grupos=:idg
        ");
        $upd->execute([':nm'=>$nm,':idg'=>$idg]);

        $r=$pdo->query("SELECT numero_mesa_1,numero_mesa_2,numero_mesa_3,numero_mesa_4,fecha_mesa,id_turno,hora FROM mesas_grupos WHERE id_mesa_grupos=".$idg)->fetch(PDO::FETCH_ASSOC);
        if(!$r) return;
        $nums=[(int)$r['numero_mesa_1'],(int)$r['numero_mesa_2'],(int)$r['numero_mesa_3'],(int)$r['numero_mesa_4']];
        $nums=array_values(array_filter($nums,fn($x)=>$x>0));
        $cnt=count($nums);

        if ($cnt===0){
            $pdo->exec("DELETE FROM mesas_grupos WHERE id_mesa_grupos=".$idg);
            return;
        }
        if ($cnt===1){
            $solo=$nums[0];
            if (!$esEspecial($solo)){
                $pdo->exec("DELETE FROM mesas_grupos WHERE id_mesa_grupos=".$idg);
                $stInsLeft->execute([':n'=>$solo,':f'=>$f,':t'=>$t,':h'=>horaSegunTurno($t)]);
                return;
            }
        }

        [$a,$b,$c,$d]=pad4($nums);
        $up=$pdo->prepare("UPDATE mesas_grupos SET numero_mesa_1=:a,numero_mesa_2=:b,numero_mesa_3=:c,numero_mesa_4=:d WHERE id_mesa_grupos=:idg");
        $up->execute([':a'=>$a,':b'=>$b,':c'=>$c,':d'=>$d,':idg'=>$idg]);
    };

    $moverMesa = function(int $nm, string $f, int $t) use ($stUpdMesaSlot,$stDelLeftByMesa,$stInsLeft,$sacarDeGrupo) {
        $sacarDeGrupo($nm);
        $stDelLeftByMesa->execute([':n'=>$nm]);
        $stUpdMesaSlot->execute([$f,$t,$nm]);
        $stInsLeft->execute([':n'=>$nm,':f'=>$f,':t'=>$t,':h'=>horaSegunTurno($t)]);
    };

    // ------------------------------------------------------------------
    // REOPTIMIZACIÓN PRINCIPAL
    // ------------------------------------------------------------------
    $iter           = 0;
    $cambiosTotales = 0;
    $detalleMov     = [];
    $detalleAgr     = [];
    $detalleFail    = [];

    if (!$dryRun) $pdo->beginTransaction();

    while ($iter < $maxIter) {
        $iter++;
        $cambiosIter = 0;

        $noAgr = $pdo->query($sqlNo)->fetchAll(PDO::FETCH_ASSOC);

        foreach ($noAgr as $row) {
            $nm   = (int)$row['numero_mesa'];
            $area = (int)$row['id_area'];
            $doc  = (int)$row['id_docente'];

            // 1) encajar en grupo existente
            $cands = [];
            foreach ($bucket as $k => $b) {
                if ($b['area'] !== $area) continue;
                if ($doc > 0 && $slotProhibido($doc, $b['fecha'], $b['turno'])) continue;

                $esMismoSlotOriginal = false;
                if (isset($slotMesaActual[$nm])) {
                    $infoSlot = $slotMesaActual[$nm];
                    if ($infoSlot['fecha'] === $b['fecha'] && $infoSlot['turno'] === $b['turno']) {
                        $esMismoSlotOriginal = true;
                    }
                }
                if (!$esMismoSlotOriginal) {
                    $chocaAlumno = false;
                    foreach (($dnisPorNumero[$nm] ?? []) as $dni) {
                        if (isset($horarioAlumno[$dni][$b['fecha'] . '|' . $b['turno']])) {
                            $chocaAlumno = true;
                            break;
                        }
                    }
                    if ($chocaAlumno) continue;
                }

                if (!$cabeEnBucket($nm, $b)) continue;
                $cands[] = [$k, count($b['nums'])];
            }

            if ($cands) {
                usort($cands, fn($A, $B) => $A[1] <=> $B[1]);
                [$keyBest, $_] = $cands[0];
                $b = $bucket[$keyBest];
                $f = $b['fecha'];
                $t = $b['turno'];

                if (!$dryRun) {
                    $stUpdMesaSlot->execute([$f, $t, $nm]);
                    $stUpdGroupToAdd->execute([':nm' => $nm, ':idg' => $b['id_g']]);
                    $stDelLeftByMesa->execute([':n' => $nm]);
                }

                $bucket[$keyBest]['nums'][] = $nm;
                foreach (($dnisPorNumero[$nm] ?? []) as $dni) {
                    $bucket[$keyBest]['dnis'][$dni] = true;
                    $horarioAlumno[$dni][$f . '|' . $t] = true;
                }

                $detalleMov[] = [
                    'numero_mesa' => $nm,
                    'to_fecha'    => $f,
                    'to_turno'    => $t,
                    'area'        => $area,
                    'motivo'      => 'encaje_en_grupo_existente'
                ];
                $cambiosIter++;
                $cambiosTotales++;
                continue;
            }

            // 2) formar grupo nuevo
            $pool = [$nm];
            foreach ($noAgr as $row2) {
                if ((int)$row2['numero_mesa'] === $nm) continue;
                if ((int)$row2['id_area'] !== $area) continue;
                $nm2 = (int)$row2['numero_mesa'];
                $d1  = $dnisPorNumero[$nm] ?? [];
                $d2  = $dnisPorNumero[$nm2] ?? [];
                $h   = array_flip($d1);
                $ok  = true;
                foreach ($d2 as $x) {
                    if (isset($h[$x])) { $ok = false; break; }
                }
                if (!$ok) continue;
                $pool[] = $nm2;
                if (count($pool) >= 6) break;
            }

            $mejorGrupo = [$nm];

            // parejas
            foreach ($pool as $a) {
                foreach ($pool as $b2) {
                    if ($a >= $b2) continue;
                    $dAB = array_merge($dnisPorNumero[$a] ?? [], $dnisPorNumero[$b2] ?? []);
                    if (count($dAB) !== count(array_unique($dAB))) continue;
                    if (count($mejorGrupo) < 2) $mejorGrupo = [$a, $b2];
                }
            }

            // ternas y cuaternas
            foreach ($pool as $a) {
                foreach ($pool as $b2) {
                    foreach ($pool as $c) {
                        $arr = array_unique([$nm, $a, $b2, $c]);
                        if (count($arr) < 3) continue;
                        $dAB = [];
                        foreach ($arr as $x) {
                            foreach (($dnisPorNumero[$x] ?? []) as $d) $dAB[$d] = true;
                        }
                        $cantEsperada = array_sum(array_map(
                            fn($x) => count($dnisPorNumero[$x] ?? []),
                            $arr
                        ));
                        if (count($dAB) !== $cantEsperada) continue;
                        if (count($arr) > count($mejorGrupo)) $mejorGrupo = array_values($arr);
                        if (count($mejorGrupo) === 4) break 3;
                    }
                }
            }

            $slotIdx = $eligeSlot($mejorGrupo, $area);
            if ($slotIdx >= 0) {
                $f = $slots[$slotIdx]['fecha'];
                $t = $slots[$slotIdx]['turno'];

                if (count($mejorGrupo) === 1) {
                    if (!$dryRun) {
                        foreach ($mejorGrupo as $nmX) {
                            $stUpdMesaSlot->execute([$f, $t, $nmX]);
                            $stDelLeftByMesa->execute([':n' => $nmX]);
                            $stInsLeft->execute([':n' => $nmX, ':f' => $f, ':t' => $t, ':h' => horaSegunTurno($t)]);
                        }
                    }
                    foreach ($mejorGrupo as $nmX) {
                        foreach (($dnisPorNumero[$nmX] ?? []) as $dni) {
                            $horarioAlumno[$dni][$f . '|' . $t] = true;
                        }
                    }
                    $slotCarga[$slotIdx] += 1;
                    $detalleMov[] = [
                        'numero_mesa' => $mejorGrupo[0],
                        'to_fecha'    => $f,
                        'to_turno'    => $t,
                        'area'        => $area,
                        'motivo'      => 'single_no_agrupada'
                    ];
                    $cambiosIter++;
                    $cambiosTotales++;
                    continue;
                }

                if (!$dryRun) {
                    foreach ($mejorGrupo as $nmX) {
                        $stUpdMesaSlot->execute([$f, $t, $nmX]);
                        $stDelLeftByMesa->execute([':n' => $nmX]);
                        $stInsLeft->execute([':n' => $nmX, ':f' => $f, ':t' => $t, ':h' => horaSegunTurno($t)]);
                    }
                    [$a1, $b1, $c1, $d1] = pad4($mejorGrupo);
                    $stDupGroupExact->execute([
                        ':f' => $f, ':t' => $t,
                        ':a' => $a1, ':b' => $b1, ':c' => $c1, ':d' => $d1
                    ]);
                    if (!$stDupGroupExact->fetch()) {
                        $stInsGroup->execute([
                            ':a' => $a1,
                            ':b' => $b1,
                            ':c' => $c1,
                            ':d' => $d1,
                            ':f' => $f,
                            ':t' => $t,
                            ':h' => horaSegunTurno($t),
                        ]);
                    }
                }

                $key = "$f|$t|$area";
                if (!isset($bucket[$key])) {
                    $bucket[$key] = [
                        'id_g'  => 0,
                        'fecha'=> $f,
                        'turno'=> $t,
                        'area' => $area,
                        'nums' => [],
                        'dnis' => []
                    ];
                }
                foreach ($mejorGrupo as $nmX) {
                    $bucket[$key]['nums'][] = $nmX;
                    foreach (($dnisPorNumero[$nmX] ?? []) as $dni) {
                        $bucket[$key]['dnis'][$dni] = true;
                        $horarioAlumno[$dni][$f . '|' . $t] = true;
                    }
                }
                $slotCarga[$slotIdx] += count($mejorGrupo);

                $detalleAgr[] = [
                    'nums'  => $mejorGrupo,
                    'fecha' => $f,
                    'turno' => $t,
                    'area'  => $area,
                    'tipo'  => 'nuevo_grupo'
                ];
                $cambiosIter++;
                $cambiosTotales++;
            } else {
                $detalleFail[] = [
                    'numero_mesa' => $nm,
                    'area'        => $area,
                    'razon'       => 'sin_slot_valido_para_grupo_nuevo'
                ];
            }
        }

        if ($cambiosIter === 0) break;
    }

    // ------------------------------------------------------------------
    // MESAS SIN FECHA/TURNO -> forzar slot
    // ------------------------------------------------------------------
    if (!$dryRun) {
        $sqlSinSlot = "
            SELECT DISTINCT m.numero_mesa, mat.id_area, m.prioridad
            FROM mesas m
            INNER JOIN previas p    ON p.id_previa   = m.id_previa
            INNER JOIN catedras c   ON c.id_catedra  = m.id_catedra
            INNER JOIN materias mat ON mat.id_materia = c.id_materia
            WHERE p.inscripcion = 1
              AND (m.fecha_mesa IS NULL OR m.id_turno IS NULL)
              AND m.numero_mesa IS NOT NULL
            ORDER BY m.prioridad DESC, m.numero_mesa
        ";
        $sinSlot = $pdo->query($sqlSinSlot)->fetchAll(PDO::FETCH_ASSOC);

        foreach ($sinSlot as $rowSS) {
            $nm    = (int)$rowSS['numero_mesa'];
            $area  = (int)$rowSS['id_area'];
            if ($nm <= 0) continue;

            $slotIdx = $eligeSlot([$nm], $area);
            if ($slotIdx >= 0) {
                $f = $slots[$slotIdx]['fecha'];
                $t = $slots[$slotIdx]['turno'];

                $stUpdMesaSlot->execute([$f, $t, $nm]);
                $stDelLeftByMesa->execute([':n' => $nm]);
                $stInsLeft->execute([':n' => $nm, ':f' => $f, ':t' => $t, ':h' => horaSegunTurno($t)]);

                foreach (($dnisPorNumero[$nm] ?? []) as $dni) {
                    $horarioAlumno[$dni]["$f|$t"] = true;
                }
                $slotCarga[$slotIdx] += 1;

                $detalleMov[] = [
                    'numero_mesa' => $nm,
                    'to_fecha'    => $f,
                    'to_turno'    => $t,
                    'area'        => $area,
                    'motivo'      => 'asignacion_forzada_sin_slot'
                ];
                $cambiosTotales++;
            } else {
                $detalleFail[] = [
                    'numero_mesa' => $nm,
                    'area'        => $area,
                    'razon'       => 'sin_slot_valido_final'
                ];
            }
        }
    }

    // ------------------------------------------------------------------
    // ENFORCE CORRELATIVIDAD (materias.correlativa)
    // ------------------------------------------------------------------
    if (!$dryRun) {
        $infoMesa=$pdo->query("
            SELECT m.numero_mesa, m.fecha_mesa, m.id_turno,
                   p.dni, p.materia_id_curso, mat.correlativa, mat.id_area
            FROM mesas m
            INNER JOIN previas p    ON p.id_previa=m.id_previa
            INNER JOIN materias mat ON mat.id_materia=p.id_materia
            WHERE p.inscripcion=1
              AND mat.correlativa IS NOT NULL
              AND mat.correlativa <> 0
        ")->fetchAll(PDO::FETCH_ASSOC);

        $porClave=[];
        foreach ($infoMesa as $r){
            $clave = $r['dni'].'|'.$r['correlativa'];
            $porClave[$clave][]=$r;
        }

        foreach ($porClave as $clave=>$lst){
            usort($lst, fn($a,$b)=>((int)$a['materia_id_curso']<=> (int)$b['materia_id_curso']));

            $base=$lst[0];
            $baseIdx = ($base['fecha_mesa'] && $base['id_turno'])
                ? $slotIndex($base['fecha_mesa'], (int)$base['id_turno'])
                : -1;

            for ($i=1;$i<count($lst);$i++){
                $adv=$lst[$i];

                if ((int)$adv['materia_id_curso'] === (int)$base['materia_id_curso']) {
                    continue;
                }

                $advIdx = ($adv['fecha_mesa'] && $adv['id_turno'])
                    ? $slotIndex($adv['fecha_mesa'], (int)$adv['id_turno'])
                    : -1;

                if ($baseIdx>=0 && $advIdx>=0 && $advIdx <= $baseIdx){
                    // 1) mover avanzada a posterior
                    $dnisLocal=$dnisPorNumero[(int)$adv['numero_mesa']] ?? [];
                    $nuevoIdx=-1;
                    for ($s=$baseIdx+1;$s<$S;$s++){
                        $f=$slots[$s]['fecha']; $t=$slots[$s]['turno'];
                        $ok=true;
                        $doc=$docPorNM[(int)$adv['numero_mesa']] ?? 0;
                        if ($doc>0 && $slotProhibido($doc,$f,$t)) $ok=false;
                        if ($ok){
                            foreach ($dnisLocal as $dni){
                                if (isset($horarioAlumno[$dni]["$f|$t"])) { $ok=false; break; }
                            }
                        }
                        if ($ok){ $nuevoIdx=$s; break; }
                    }

                    if ($nuevoIdx>=0){
                        $nf=$slots[$nuevoIdx]['fecha']; $nt=$slots[$nuevoIdx]['turno'];
                        $moverMesa((int)$adv['numero_mesa'],$nf,$nt);

                        foreach (($dnisPorNumero[(int)$adv['numero_mesa']]??[]) as $dni){
                            unset($horarioAlumno[$dni][$adv['fecha_mesa'].'|'.$adv['id_turno']]);
                            $horarioAlumno[$dni]["$nf|$nt"]=true;
                        }
                        $slotCarga[$nuevoIdx]+=1;
                        $detalleMov[]=[
                            'numero_mesa'=>(int)$adv['numero_mesa'],
                            'to_fecha'=>$nf,
                            'to_turno'=>$nt,
                            'area'=>(int)$adv['id_area'],
                            'motivo'=>'correlatividad_mover_avanzada_posterior'
                        ];
                        $advIdx=$nuevoIdx;
                    } else {
                        // 2) mover base a anterior
                        $dnisBase=$dnisPorNumero[(int)$base['numero_mesa']] ?? [];
                        $nuevoBaseIdx=-1;
                        for ($s=0;$s<$advIdx;$s++){
                            $f=$slots[$s]['fecha']; $t=$slots[$s]['turno'];
                            $ok=true;
                            $doc=$docPorNM[(int)$base['numero_mesa']] ?? 0;
                            if ($doc>0 && $slotProhibido($doc,$f,$t)) $ok=false;
                            if ($ok){
                                foreach ($dnisBase as $dni){
                                    if (isset($horarioAlumno[$dni]["$f|$t"])) { $ok=false; break; }
                                }
                            }
                            if ($ok){ $nuevoBaseIdx=$s; break; }
                        }
                        if ($nuevoBaseIdx>=0){
                            $nf=$slots[$nuevoBaseIdx]['fecha']; $nt=$slots[$nuevoBaseIdx]['turno'];
                            $moverMesa((int)$base['numero_mesa'],$nf,$nt);
                            foreach (($dnisPorNumero[(int)$base['numero_mesa']]??[]) as $dni){
                                unset($horarioAlumno[$dni][$base['fecha_mesa'].'|'.$base['id_turno']]);
                                $horarioAlumno[$dni]["$nf|$nt"]=true;
                            }
                            $slotCarga[$nuevoBaseIdx]+=1;
                            $detalleMov[]=[
                                'numero_mesa'=>(int)$base['numero_mesa'],
                                'to_fecha'=>$nf,
                                'to_turno'=>$nt,
                                'area'=>(int)$base['id_area'],
                                'motivo'=>'correlatividad_mover_base_anterior'
                            ];
                            $baseIdx=$nuevoBaseIdx;
                        } else {
                            $detalleFail[]=[
                                'numero_mesa'=>(int)$adv['numero_mesa'],
                                'area'=>(int)$adv['id_area'],
                                'razon'=>'sin_slot_para_correlatividad'
                            ];
                        }
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // AGRUPAR NO AGRUPADAS MISMO DÍA/TURNO/ÁREA
    // ------------------------------------------------------------------
    if (!$dryRun) {
        $sqlSinglesSlot = "
            SELECT l.numero_mesa, l.fecha_mesa, l.id_turno, mat.id_area
            FROM mesas_no_agrupadas l
            INNER JOIN mesas m    ON m.numero_mesa = l.numero_mesa
            INNER JOIN catedras c ON c.id_catedra = m.id_catedra
            INNER JOIN materias mat ON mat.id_materia = c.id_materia
        ";
        if ($soloArea !== null) {
            $sqlSinglesSlot .= " WHERE mat.id_area = " . (int)$soloArea . " ";
        }
        $sqlSinglesSlot .= "
            ORDER BY l.fecha_mesa, l.id_turno, mat.id_area, l.numero_mesa
        ";

        $rowsSingles = $pdo->query($sqlSinglesSlot)->fetchAll(PDO::FETCH_ASSOC);

        $slotsSingles = [];
        foreach ($rowsSingles as $r) {
            $key = $r['fecha_mesa'] . '|' . $r['id_turno'] . '|' . $r['id_area'];
            $nm  = (int)$r['numero_mesa'];
            if ($nm <= 0) continue;
            if (!isset($slotsSingles[$key])) {
                $slotsSingles[$key] = [
                    'fecha' => $r['fecha_mesa'],
                    'turno' => (int)$r['id_turno'],
                    'area'  => (int)$r['id_area'],
                    'mesas' => []
                ];
            }
            $slotsSingles[$key]['mesas'][] = $nm;
        }

        foreach ($slotsSingles as $info) {
            $lista = array_values(array_unique($info['mesas']));

            while (count($lista) > 1) {
                $baseNm = array_shift($lista);
                $grupo = [$baseNm];

                $dnisGrupo = [];
                foreach (($dnisPorNumero[$baseNm] ?? []) as $dni) $dnisGrupo[$dni] = true;

                $restantes = $lista;
                foreach ($restantes as $cand) {
                    if (count($grupo) >= 4) break;
                    $colision = false;
                    foreach (($dnisPorNumero[$cand] ?? []) as $dni) {
                        if (isset($dnisGrupo[$dni])) {
                            $colision = true;
                            break;
                        }
                    }
                    if ($colision) continue;

                    $grupo[] = $cand;
                    foreach (($dnisPorNumero[$cand] ?? []) as $dni) {
                        $dnisGrupo[$dni] = true;
                    }

                    $idx = array_search($cand, $lista, true);
                    if ($idx !== false) array_splice($lista, $idx, 1);
                }

                if (count($grupo) <= 1) continue;

                [$a1, $b1, $c1, $d1] = pad4($grupo);
                $stDupGroupExact->execute([
                    ':f' => $info['fecha'],
                    ':t' => $info['turno'],
                    ':a' => $a1,
                    ':b' => $b1,
                    ':c' => $c1,
                    ':d' => $d1,
                ]);
                if (!$stDupGroupExact->fetch()) {
                    $stInsGroup->execute([
                        ':a' => $a1,
                        ':b' => $b1,
                        ':c' => $c1,
                        ':d' => $d1,
                        ':f' => $info['fecha'],
                        ':t' => $info['turno'],
                        ':h' => horaSegunTurno((int)$info['turno']),
                    ]);
                }

                foreach ($grupo as $nmX) {
                    $stDelLeftExact->execute([
                        ':n' => $nmX,
                        ':f' => $info['fecha'],
                        ':t' => $info['turno'],
                    ]);
                }

                $detalleAgr[] = [
                    'nums'  => $grupo,
                    'fecha' => $info['fecha'],
                    'turno' => $info['turno'],
                    'area'  => $info['area'],
                    'tipo'  => 'grupo_desde_singles_mismo_slot'
                ];
                $cambiosTotales++;
            }
        }
    }

    // ------------------------------------------------------------------
    // SANIDAD FINAL Y RED DE SEGURIDAD
    // ------------------------------------------------------------------
    if (!$dryRun) {
        $pdo->exec("
            INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
            SELECT
              CASE
                WHEN numero_mesa_1>0 THEN numero_mesa_1
                WHEN numero_mesa_2>0 THEN numero_mesa_2
                WHEN numero_mesa_3>0 THEN numero_mesa_3
                ELSE numero_mesa_4
              END AS numero_mesa,
              fecha_mesa,
              id_turno,
              hora
            FROM mesas_grupos g
            WHERE ( (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0) = 1 )
              AND EXISTS (
                SELECT 1
                FROM mesas m
                INNER JOIN previas p ON p.id_previa = m.id_previa
                WHERE m.numero_mesa = CASE
                                        WHEN g.numero_mesa_1>0 THEN g.numero_mesa_1
                                        WHEN g.numero_mesa_2>0 THEN g.numero_mesa_2
                                        WHEN g.numero_mesa_3>0 THEN g.numero_mesa_3
                                        ELSE g.numero_mesa_4
                                      END
                  AND NOT (
                    p.materia_id_curso = 7
                    OR (p.materia_id_curso = 3 AND p.id_materia IN (18,32,132))
                  )
              )
        ");

        $pdo->exec("
            DELETE g
            FROM mesas_grupos g
            WHERE ( (numero_mesa_1>0)+(numero_mesa_2>0)+(numero_mesa_3>0)+(numero_mesa_4>0) = 1 )
              AND EXISTS (
                SELECT 1
                FROM mesas m
                INNER JOIN previas p ON p.id_previa = m.id_previa
                WHERE m.numero_mesa = CASE
                                        WHEN g.numero_mesa_1>0 THEN g.numero_mesa_1
                                        WHEN g.numero_mesa_2>0 THEN g.numero_mesa_2
                                        WHEN g.numero_mesa_3>0 THEN g.numero_mesa_3
                                        ELSE g.numero_mesa_4
                                      END
                  AND NOT (
                    p.materia_id_curso = 7
                    OR (p.materia_id_curso = 3 AND p.id_materia IN (18,32,132))
                  )
              )
        ");

        $pdo->exec("
            DELETE l
            FROM mesas_no_agrupadas l
            LEFT JOIN mesas m
              ON m.numero_mesa = l.numero_mesa
             AND m.fecha_mesa = l.fecha_mesa
             AND m.id_turno   = l.id_turno
            WHERE m.numero_mesa IS NULL
        ");

        $pdo->exec("
            DELETE l
            FROM mesas_no_agrupadas l
            JOIN mesas_grupos g
              ON g.fecha_mesa = l.fecha_mesa AND g.id_turno = l.id_turno
            WHERE l.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
        ");

        $pdo->exec("
            DELETE g
            FROM mesas_grupos g
            LEFT JOIN mesas m1
              ON g.numero_mesa_1 > 0
             AND g.numero_mesa_1 = m1.numero_mesa
             AND g.fecha_mesa    = m1.fecha_mesa
             AND g.id_turno      = m1.id_turno
            LEFT JOIN mesas m2
              ON g.numero_mesa_2 > 0
             AND g.numero_mesa_2 = m2.numero_mesa
             AND g.fecha_mesa    = m2.fecha_mesa
             AND g.id_turno      = m2.id_turno
            LEFT JOIN mesas m3
              ON g.numero_mesa_3 > 0
             AND g.numero_mesa_3 = m3.numero_mesa
             AND g.fecha_mesa    = m3.fecha_mesa
             AND g.id_turno      = m3.id_turno
            LEFT JOIN mesas m4
              ON g.numero_mesa_4 > 0
             AND g.numero_mesa_4 = m4.numero_mesa
             AND g.fecha_mesa    = m4.fecha_mesa
             AND g.id_turno      = m4.id_turno
            WHERE
              (g.numero_mesa_1 > 0 AND m1.numero_mesa IS NULL)
              OR (g.numero_mesa_2 > 0 AND m2.numero_mesa IS NULL)
              OR (g.numero_mesa_3 > 0 AND m3.numero_mesa IS NULL)
              OR (g.numero_mesa_4 > 0 AND m4.numero_mesa IS NULL)
        ");

        $pdo->exec("
            INSERT IGNORE INTO mesas_no_agrupadas (numero_mesa, fecha_mesa, id_turno, hora)
            SELECT m.numero_mesa, m.fecha_mesa, m.id_turno,
                   CASE
                     WHEN m.id_turno = 1 THEN '07:30:00'
                     WHEN m.id_turno = 2 THEN '13:30:00'
                     ELSE '07:30:00'
                   END AS hora
            FROM mesas m
            WHERE m.fecha_mesa IS NOT NULL
              AND m.id_turno IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                FROM mesas_grupos g
                WHERE g.fecha_mesa = m.fecha_mesa
                  AND g.id_turno   = m.id_turno
                  AND m.numero_mesa IN (g.numero_mesa_1, g.numero_mesa_2, g.numero_mesa_3, g.numero_mesa_4)
              )
              AND NOT EXISTS (
                SELECT 1
                FROM mesas_no_agrupadas l
                WHERE l.numero_mesa = m.numero_mesa
                  AND l.fecha_mesa  = m.fecha_mesa
                  AND l.id_turno    = m.id_turno
              )
        ");

        $pdo->commit();
    }

    respond(true, [
        'resumen' => [
            'iteraciones'     => $iter,
            'cambios_totales' => $cambiosTotales,
        ],
        'detalle' => [
            'movimientos'  => $detalleMov,
            'grupos_nuevos'=> $detalleAgr,
            'fallidos'     => $detalleFail,
        ],
        'nota' =>
          'Correlatividad aplicada usando materias.correlativa: para cada alumno y cada valor de correlativa, ' .
          'la mesa base (menor materia_id_curso) queda cronológicamente antes que las avanzadas.'
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    respond(false, 'Error en el servidor: ' . $e->getMessage(), 500);
}

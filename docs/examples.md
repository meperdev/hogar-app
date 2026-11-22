# Ejemplos trabajados

Este documento baja el modelo de datos a números reales en COP. Cada ejemplo muestra qué registros se crean,
cómo se ven los totales del mes, qué error de doble conteo evita el modelo y qué invariante y qué test lo protegen.
Sirve como oráculo para los tests de fase 2 y como material de revisión para verificar que las definiciones de
totales cierran a mano.

## Propósito

- Comprobar con aritmética explícita que las definiciones de los totales del mes producen los números esperados.
- Mostrar que un consumo se cuenta **una sola vez**, aunque se pague en cuotas y con intereses.
- Mostrar que pagar el pasivo de otro miembro no crea ninguna deuda entre miembros.
- Dar a los tests de fase 2 un resultado concreto que se pueda afirmar sin ambigüedad.

## Escenario base

Todos los ejemplos usan el mismo hogar. Los identificadores de las tablas (`compra-mercado`, `plan-mercado`,
`cuenta-ana`, `cat-mercado`, …) son alias legibles de los uuid que genera el cliente (UUIDv7): `compra-1` y
`compra-mercado` designan la misma fila, y así con todos los demás.

| Entidad | id corto | Campos relevantes |
| --- | --- | --- |
| Hogar | `hogar-1` | `nombre` "Casa", `moneda` COP, `zona_horaria` America/Bogota |
| Miembro | `ana` | `nombre` Ana, `rol` admin, `activo` true |
| Miembro | `beto` | `nombre` Beto, `rol` miembro, `activo` true |
| MedioDePago | `cuenta-ana` | `nombre` "Cuenta Ana", `tipo` cuenta, `owner_tipo` miembro (`ana`), `activo` true |
| MedioDePago | `cuenta-beto` | `nombre` "Cuenta Beto", `tipo` cuenta, `owner_tipo` miembro (`beto`), `activo` true |
| MedioDePago | `cuenta-comun` | `nombre` "Cuenta común", `tipo` cuenta, `owner_tipo` hogar, `owner_miembro_id` null |
| Pasivo / Tarjeta | `visa-ana` | `tipo` tarjeta, `nombre` "Visa Ana", `owner_tipo` miembro (`ana`), `dia_corte` 25, `dia_pago` 10, `tasa_tipo`/`tasa_ppm` null (en a2: EA / 280000) |

## Los cuatro totales

| Total | Qué suma | Qué nunca suma |
| --- | --- | --- |
| Gasto del mes | Σ `Compra.monto_total` con fecha en el mes + Σ `CostoFinanciero.monto` con `fecha_causacion` en el mes | `PagoDeDeuda`, `Aporte` |
| Aportes del mes | Plata que salió de medios de cada miembro hacia el hogar (compras de contado, `PagoDeDeuda`, costos pagados directo, `Aporte`) | Compras financiadas, costos cargados a un pasivo, salidas del fondo común |
| Obligaciones del mes | Agenda: cuotas con `fecha_vencimiento` en el mes (capital más sus costos con `cuota_id`) + costos cargados **sin `cuota_id`** causados en el mes + instancias de `Obligacion` del mes, con su estado derivado | No se suma al gasto; el interés de una cuota nunca se cuenta dos veces en la agenda |
| Saldo del pasivo | Σ capital de planes con `fecha_inicio` ≤ fecha + Σ costos cargados al pasivo − Σ `PagoDeDeuda` | No depende de los aportes |

Definiciones exactas, campos y firmas de las funciones: `docs/data-model.md` (entidades, campos, totales e
invariantes I1–I17). Este documento no redefine nada: solo calcula con esas reglas.

### Convenciones de lectura

- Fechas `YYYY-MM-DD`; el mes contable sale de la fecha civil (**I12**).
- Montos enteros en COP con formato `$300.000` (**I1**). Los porcentajes usan coma decimal y se redondean a un
  decimal **solo al mostrarse**; nunca se guardan.
- Las columnas de sincronización (`seq`, `creado_en`, `eliminado_en`, `actualizado_por`) se omiten: no cambian
  ningún total.
- `registrado_por` no afecta ningún total. En los ejemplos registra el miembro que aparece en la situación.
- Cada tabla de registros indica si el registro entra en el mismo **lote atómico** (una intención, una
  transacción, una entrada de `outbox`).

---

## Ejemplo a1 — mercado financiado, sin tasa

### 1. Situación

El 2026-11-10 Ana compra el mercado del mes por `$300.000` con la Visa Ana, a 3 cuotas, sin intereses. Con corte el
día 25 y pago el día 10, la compra entra en el corte del 2026-11-25 y la primera cuota vence el 2026-12-10. Ana
paga cada cuota el día de su vencimiento desde la Cuenta Ana.

### 2. Registros creados

**Lote 1 — `registrarCompra` (2026-11-10), una sola transacción:** `Compra` + `PlanDeCuotas` + 3 `Cuota`.

`Compra`

| id | fecha | descripcion | monto_total | categoria_id | pago_tipo | medio_de_pago_id | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-mercado` | 2026-11-10 | Mercado | $300.000 | Mercado | financiado | null | Ana |

`PlanDeCuotas`

| id | pasivo_id | origen | compra_id | fecha_inicio | capital | sistema | n_cuotas | fecha_primera_cuota | tasa_tipo | tasa_ppm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan-mercado` | `visa-ana` | compra | `compra-mercado` | 2026-11-10 | $300.000 | capital_fijo | 3 | 2026-12-10 | null | null |

`Cuota` (mismo lote; capital repartido con `base = floor(C/n)`, resto en las primeras)

| id | plan_id | numero | fecha_vencimiento | capital |
| --- | --- | --- | --- | --- |
| `cuota-1` | `plan-mercado` | 1 | 2026-12-10 | $100.000 |
| `cuota-2` | `plan-mercado` | 2 | 2027-01-10 | $100.000 |
| `cuota-3` | `plan-mercado` | 3 | 2027-02-10 | $100.000 |

`CostoFinanciero`: **ninguno**. Sin tasa, el dominio no crea costos calculados.

**Lotes 2, 3 y 4 — `registrarPagoDeDeuda`, uno por cuota:** un `PagoDeDeuda` por cada pago real, cada uno en su
fecha y en su propio lote.

`PagoDeDeuda`

| id | pasivo_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- |
| `pago-1` | `visa-ana` | `cuenta-ana` | $100.000 | 2026-12-10 | null | Ana |
| `pago-2` | `visa-ana` | `cuenta-ana` | $100.000 | 2027-01-10 | null | Ana |
| `pago-3` | `visa-ana` | `cuenta-ana` | $100.000 | 2027-02-10 | null | Ana |

`PagoDeDeuda` no apunta a cuotas: el estado de cada cuota se deriva por FIFO.

### 3. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | Mercado $300.000 | — | $300.000 | — | — | $300.000 |
| 2026-12 | — | — | $0 | Ana $100.000 | cuota 1 $100.000, pagada | $200.000 |
| 2027-01 | — | — | $0 | Ana $100.000 | cuota 2 $100.000, pagada | $100.000 |
| 2027-02 | — | — | $0 | Ana $100.000 | cuota 3 $100.000, pagada | $0 |
| total de la vida | Mercado $300.000 | — | $300.000 | Ana $300.000 (100,0 %) | 3 cuotas, todas pagadas | $0 |

Lectura: el gasto ocurre completo en noviembre, el mes de la compra. Diciembre, enero y febrero solo mueven caja
del bolsillo de Ana al pasivo; no agregan gasto. El total de la vida cierra: gasto `$300.000` = aportes `$300.000`.

### 4. Lo que NO pasa

- El mercado **no** vale `$300.000 + $100.000` en noviembre: la cuota de diciembre no es un consumo nuevo.
- En diciembre **no** hay `$100.000` de gasto: solo hay una obligación pagada y un aporte de Ana.
- El gasto **no** aparece tres veces (una por cuota): aparece una vez, por `monto_total`.
- El aporte **no** nace al comprar: financiar no es aportar. Nace cuando Ana paga.
- El saldo del pasivo **no** se guarda: se deriva del plan, los costos y los pagos.

### 5. Invariantes que lo protegen

- **I1** — Todos los montos son enteros positivos en COP; `$300.000` y `$100.000` no requieren redondeo.
- **I2** — El consumo suma una sola vez, en la fecha de la compra, por `monto_total`.
- **I3** — Compra financiada ⇔ un plan con su `compra_id`; `plan.capital = monto_total`; Σ cuotas = `$300.000`;
  números 1..3 contiguos.
- **I6** — El aporte es salida de caja del medio de un miembro; aquí aparece recién en diciembre.
- **I7** — Ningún registro ni cálculo dice que alguien le deba algo a alguien.
- **I10** — Saldo y estado de cuotas derivados; asignación FIFO de los pagos.
- **I13** — Compra, plan y cuotas entran completos o no entran; reenviar el lote no duplica.

### 6. Test de fase 2 (descripción)

- **T-a1-1 (registro).** *Given* el hogar base sin movimientos. *When* `registrarCompra({fecha: 2026-11-10,
  monto_total: 300000, categoria: Mercado, pago_tipo: financiado, pasivo: Visa Ana, n_cuotas: 3, sistema:
  capital_fijo})`. *Then* existe 1 `Compra`, 1 `PlanDeCuotas` con `capital = 300000` y 3 `Cuota` con capital
  `100000` cada una y vencimientos `2026-12-10`, `2027-01-10`, `2027-02-10`; no existe ningún `CostoFinanciero`;
  y `totalesDelMes(2026-11)` devuelve gasto `300000` (Mercado), aportes `0`, obligaciones `[]`, saldo de Visa Ana
  `300000`.
- **T-a1-2 (pagos).** *Given* el caso anterior. *When* se registran los tres pagos de `$100.000` desde Cuenta Ana
  en sus fechas. *Then* `totalesDelMes` de cada mes devuelve gasto `0`, aporte de Ana `100000` y la obligación del
  mes en estado pagada; el saldo de Visa Ana es `200000`, `100000`, `0` en diciembre, enero y febrero; y la suma
  de gasto de los cuatro meses (`300000`) es igual a la suma de aportes.
- **T-a1-3 (propiedad, fast-check).** Para cualquier `monto > 0` y cualquier `n` con `1 ≤ n ≤ min(24, monto)` —el
  tope garantiza que toda cuota tenga capital > 0—, el plan generado cumple Σ `cuota.capital` = `monto`, capitales
  positivos y números contiguos, y el gasto acumulado hasta cualquier fecha `d` **igual o posterior a la fecha de
  la compra** es exactamente `monto`, sin importar cuántos pagos se hayan hecho (**I3** e **I16**).

---

## Ejemplo a2 — el mismo mercado con 28 % E.A.

### 1. Situación

Igual que a1, pero la Visa Ana tiene tasa del 28 % efectivo anual y el mercado se financia al 2,0785 % mes vencido.
Los intereses se calculan por cuota sobre el capital pendiente, se causan en la fecha de vencimiento y se cargan
al pasivo (se pagan con la cuota, no desde un medio).

### 2. Conversión de la tasa, paso a paso

| paso | cálculo | resultado |
| --- | --- | --- |
| 1 | Tasa declarada del pasivo | 28 % E.A. → `tasa_tipo = EA`, `tasa_ppm = 280000` |
| 2 | `MV = (1 + EA)^(1/12) − 1` | `(1,28)^(1/12) − 1 = 0,0207847284895…` ≈ **2,0785 %** |
| 3 | Cuota 1: `300.000 × 0,0207847284895` | `≈ 6.235,4185` → **`$6.235`** |
| 4 | Cuota 2: `200.000 × 0,0207847284895` | `≈ 4.156,9457` → **`$4.157`** |
| 5 | Cuota 3: `100.000 × 0,0207847284895` | `≈ 2.078,4728` → **`$2.078`** |
| 6 | Total de intereses | `6.235 + 4.157 + 2.078 = $12.470` |

Reglas aplicadas: la tasa se calcula en coma flotante y **no se redondea**; solo se redondea el interés una vez
por cuota, al peso más cercano con las mitades hacia arriba. Se guarda `tasa_ppm = 280000` con `tasa_tipo = EA`,
no el M.V. calculado.

### 3. Registros creados

**Lote 1 — `registrarCompra`:** los mismos registros de a1, con tasa, más un `CostoFinanciero` por cuota.

`PlanDeCuotas` (cambia solo la tasa)

| id | pasivo_id | origen | compra_id | fecha_inicio | capital | sistema | n_cuotas | fecha_primera_cuota | tasa_tipo | tasa_ppm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan-mercado` | `visa-ana` | compra | `compra-mercado` | 2026-11-10 | $300.000 | capital_fijo | 3 | 2026-12-10 | EA | 280000 |

`Cuota` (idénticas a a1: la cuota guarda capital, no intereses)

| id | plan_id | numero | fecha_vencimiento | capital |
| --- | --- | --- | --- | --- |
| `cuota-1` | `plan-mercado` | 1 | 2026-12-10 | $100.000 |
| `cuota-2` | `plan-mercado` | 2 | 2027-01-10 | $100.000 |
| `cuota-3` | `plan-mercado` | 3 | 2027-02-10 | $100.000 |

`CostoFinanciero` (mismo lote que el plan)

| id | tipo | monto | fecha_causacion | pasivo_id | medio_de_pago_id | cuota_id | origen | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `costo-1` | interes | $6.235 | 2026-12-10 | `visa-ana` | null | `cuota-1` | calculado | Ana |
| `costo-2` | interes | $4.157 | 2027-01-10 | `visa-ana` | null | `cuota-2` | calculado | Ana |
| `costo-3` | interes | $2.078 | 2027-02-10 | `visa-ana` | null | `cuota-3` | calculado | Ana |

**Lotes 2, 3 y 4 — `registrarPagoDeDeuda`:** cada pago cubre el capital de la cuota más su interés calculado.

`PagoDeDeuda`

| id | pasivo_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- |
| `pago-1` | `visa-ana` | `cuenta-ana` | $106.235 | 2026-12-10 | null | Ana |
| `pago-2` | `visa-ana` | `cuenta-ana` | $104.157 | 2027-01-10 | null | Ana |
| `pago-3` | `visa-ana` | `cuenta-ana` | $102.078 | 2027-02-10 | null | Ana |

El pago sigue sin apuntar a cuotas: el FIFO cubre primero la cuota 1 (capital + su costo) y así sucesivamente.

### 4. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | Mercado $300.000 | — | $300.000 | — | — | $300.000 |
| 2026-12 | — | $6.235 | $6.235 | Ana $106.235 | cuota 1 $106.235 (capital $100.000 + interés $6.235 vía `cuota_id`), pagada; una sola entrada | $200.000 |
| 2027-01 | — | $4.157 | $4.157 | Ana $104.157 | cuota 2 $104.157, pagada | $100.000 |
| 2027-02 | — | $2.078 | $2.078 | Ana $102.078 | cuota 3 $102.078, pagada | $0 |
| total de la vida | Mercado $300.000 | $12.470 | $312.470 | Ana $312.470 (100,0 %) | 3 cuotas pagadas | $0 |

Lectura: Mercado sigue siendo `$300.000` y aparece **solo en noviembre**. El interés es gasto, pero en el balde
"Costo financiero" y en el mes en que se causa, no en la categoría del consumo. El total de la vida cierra:
gasto `$312.470` = aportes `$312.470`.

### 5. Lo que NO pasa

- Mercado **no** aparece como `$312.470` en noviembre: el consumo es `$300.000`, siempre.
- El interés **no** se suma al `monto_total` ni a la categoría Mercado: va al balde "Costo financiero" (**I4**).
- Las cuotas **no** son gasto: son obligaciones y pagos de deuda.
- El interés **no** se recalcula al pagar ni se duplica: es un registro por cuota, único para
  `tipo='interes' AND origen='calculado'`.
- El M.V. calculado **no** se guarda como tasa del pasivo: se guarda el 28 % E.A. declarado.

### 6. Invariantes que lo protegen

- **I1** — Todos los montos son enteros: el interés se redondea al peso una vez por cuota.
- **I2** — El consumo suma una sola vez, en la fecha de la compra, por `monto_total`.
- **I3** — `plan.capital = $300.000` = `monto_total`; Σ capital de las 3 cuotas = `$300.000`.
- **I4** — El interés suma al gasto en el balde "Costo financiero", en su `fecha_causacion`; nunca al
  `monto_total` ni a una categoría de consumo.
- **I5** — Cada `CostoFinanciero` de interés está cargado al pasivo (`medio_de_pago_id` null) y su `cuota_id`
  pertenece al plan de ese pasivo.
- **I10** — Saldo `$200.000` / `$100.000` / `$0` derivado de capital + costos − pagos, nunca guardado.
- **I13** — Compra, plan, cuotas y costos calculados entran en el mismo lote atómico.

### 7. Test de fase 2 (descripción)

- **T-a2-1 (conversión).** *Given* una tasa del 28 % E.A. *When* se llama la función de conversión del dominio.
  *Then* devuelve `0,0207847284895…` (tolerancia `1e-12`) y la conversión inversa vuelve a `0,28`.
- **T-a2-2 (plan con tasa).** *Given* el hogar base. *When* `registrarCompra(... tasa: 28 % E.A., 3 cuotas)`
  seguido de los tres pagos. *Then* existen 3 `CostoFinanciero` de `interes` con montos exactos `6235`, `4157`,
  `2078`, `fecha_causacion` igual al vencimiento de su cuota, `pasivo_id` de Visa Ana y `medio_de_pago_id` null;
  los tres `PagoDeDeuda` son `106235`, `104157`, `102078`; y `totalesDelMes` da gasto `300000` en noviembre y
  `6235`, `4157`, `2078` de costo financiero en diciembre, enero y febrero, con aporte de Ana igual al pago de
  cada mes.
- **T-a2-3 (propiedad, conservación I16).** Para cualquier `monto > 0` y cualquier tasa en un rango razonable,
  Σ gasto hasta el último vencimiento es igual a Σ salidas externas más el saldo final del pasivo (que es `0`), y
  es igual a Σ aportes; la identidad de conservación se cumple exactamente, sin tolerancia.

---

## Ejemplo b — deuda del hogar pagada por ambos

### 1. Situación

El 2026-11-05 compran una nevera por `$2.400.000`, financiada con la deuda "Préstamo nevera" del almacén, a 12
cuotas de `$200.000` sin tasa. La deuda es del hogar (no de un miembro). En diciembre Ana paga `$120.000` y Beto
`$80.000`; en enero Ana paga `$50.000` y Beto `$150.000`.

### 2. Registros creados

**Lote 1 — `registrarCompra` (2026-11-05):** `Compra` + `PlanDeCuotas` + 12 `Cuota`. Antes, como dato de
configuración, existía el pasivo `deuda-1`.

`Pasivo / Deuda`

| id | tipo | nombre | owner_tipo | owner_miembro_id | tasa_tipo | tasa_ppm | acreedor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `deuda-1` | deuda | Préstamo nevera | hogar | null | null | null | Almacén El Hogar |

`Compra`

| id | fecha | descripcion | monto_total | categoria_id | pago_tipo | medio_de_pago_id | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-nevera` | 2026-11-05 | Nevera | $2.400.000 | Hogar y electrodomésticos | financiado | null | Ana |

`PlanDeCuotas`

| id | pasivo_id | origen | compra_id | fecha_inicio | capital | sistema | n_cuotas | fecha_primera_cuota | tasa_tipo | tasa_ppm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan-nevera` | `deuda-1` | compra | `compra-nevera` | 2026-11-05 | $2.400.000 | capital_fijo | 12 | 2026-12-05 | null | null |

`Cuota` (12 filas; se muestran las primeras y la última)

| id | plan_id | numero | fecha_vencimiento | capital |
| --- | --- | --- | --- | --- |
| `cuota-1` | `plan-nevera` | 1 | 2026-12-05 | $200.000 |
| `cuota-2` | `plan-nevera` | 2 | 2027-01-05 | $200.000 |
| `cuota-3` | `plan-nevera` | 3 | 2027-02-05 | $200.000 |
| … | | 4..11 | cuotas 4 a 11, un 5 de cada mes hasta 2027-10-05 | $200.000 |
| `cuota-12` | `plan-nevera` | 12 | 2027-11-05 | $200.000 |

**Lotes 2 y 3 — `registrarPagoDeDeuda` (diciembre):** un pago por miembro, cada uno desde su cuenta. El aportante
es el dueño del medio.

`PagoDeDeuda`

| id | pasivo_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- |
| `pago-dec-ana` | `deuda-1` | `cuenta-ana` | $120.000 | 2026-12-05 | null | Ana |
| `pago-dec-beto` | `deuda-1` | `cuenta-beto` | $80.000 | 2026-12-05 | null | Beto |
| `pago-ene-ana` | `deuda-1` | `cuenta-ana` | $50.000 | 2027-01-05 | null | Ana |
| `pago-ene-beto` | `deuda-1` | `cuenta-beto` | $150.000 | 2027-01-05 | null | Beto |

### 3. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | Hogar y electrodomésticos $2.400.000 | — | $2.400.000 | — | — | $2.400.000 |
| 2026-12 | — | — | $0 | Ana $120.000 (60,0 %) · Beto $80.000 (40,0 %) | cuota 1 $200.000, pagada | $2.200.000 |
| 2027-01 | — | — | $0 | Ana $50.000 (25,0 %) · Beto $150.000 (75,0 %) | cuota 2 $200.000, pagada | $2.000.000 |
| total de la vida (a enero) | Hogar y electrodomésticos $2.400.000 | — | $2.400.000 | Ana $170.000 (42,5 %) · Beto $230.000 (57,5 %) | 2 cuotas pagadas de 12 | $2.000.000 |

El porcentaje de cada miembro se calcula sobre los aportes del mes, no sobre la cuota: en diciembre Ana puso el
60 % del dinero que salió y Beto el 40 %, aunque la cuota que se cubrió sea una sola.

### 4. Lo que NO pasa

- La nevera **no** vale `$2.400.000` otra vez en diciembre: la cuota no es consumo.
- El pasivo **no** genera ninguna fila "Beto le debe $20.000 a Ana" por haber aportado menos en diciembre, ni al
  revés en enero. Los porcentajes son información, no obligación.
- El reparto **no** se guarda: 60/40 y 25/75 son cálculos del mes.
- La deuda **no** aparece como gasto personal de Ana aunque la compre ella: el consumo es del hogar.
- El estado de las cuotas **no** se guarda: el FIFO marca la cuota 1 pagada porque los pagos de diciembre cubren
  `$200.000` completos.

### 4 bis. Variante — pagos incompletos en diciembre

Si en diciembre solo hubieran pagado `$150.000` en total, el FIFO cubre primero la cuota 1 y la deja **parcial**,
con `$50.000` de capital pendiente. El reparto entre Ana y Beto del total pagado lo decide quién pagó (D10 fija el
total, no el reparto).

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-12 (variante) | — | — | $0 | $150.000 en total, repartidos según quién pagó | cuota 1 $200.000, **parcial**, restante $50.000 | $2.250.000 |

Los `$50.000` que faltan son una obligación pendiente del hogar con el almacén. No son una deuda entre Ana y Beto:
el modelo no tiene ningún campo para expresarla y ningún cálculo la produce.

### 5. Invariantes que lo protegen

- **I2** — La nevera suma al gasto una vez, en noviembre, por `monto_total`.
- **I3** — `plan.capital = $2.400.000` = `monto_total`; Σ de las 12 cuotas = `$2.400.000`; números 1..12.
- **I6 / I7** — Cada pago es aporte de quien pagó; pagar la deuda del hogar no crea deuda entre miembros.
- **I8** — La deuda es del hogar (`owner_tipo = hogar`, `owner_miembro_id` null), permitido en fase 1.
- **I10** — Saldo `$2.200.000` y estado de la cuota derivados por FIFO.
- **I14** — Compra, plan, cuotas y pagos pertenecen al mismo hogar.

### 6. Test de fase 2 (descripción)

- **T-b-1 (deuda del hogar).** *Given* el hogar base con la deuda "Préstamo nevera". *When* `registrarCompra`
  con `$2.400.000` financiados a 12 cuotas de `capital_fijo`. *Then* `totalesDelMes(2026-11)` da gasto
  `2400000` en "Hogar y electrodomésticos", aportes `0`, obligaciones `[]` y saldo `2400000`; y el plan tiene 12
  cuotas cuyo capital suma `2400000`.
- **T-b-2 (dos aportantes).** *Given* el caso anterior. *When* se registran los cuatro pagos. *Then* diciembre da
  aportes Ana `120000` y Beto `80000` (60,0 % y 40,0 % del mes), la cuota 1 en estado pagada y saldo `2200000`;
  enero da `50000` y `150000` (25,0 % y 75,0 %) y saldo `2000000`; y el objeto de balance de pareja no expone
  ningún campo de diferencia o deuda.
- **T-b-3 (parcial).** *Given* la deuda y la cuota 1. *When* se registran pagos por `$150.000` en diciembre.
  *Then* la cuota 1 queda en estado parcial con restante `50000`, el saldo es `2250000`, el gasto de diciembre es
  `0` y el balance sigue sin filas de deuda.

---

## Ejemplo c — un miembro paga la cuota de la tarjeta del otro

### 1. Situación

Sobre a2: el 2027-01-10, en lugar de Ana, **Beto** paga la cuota 2 de la Visa Ana (`$104.157`) desde la Cuenta
Beto. La tarjeta sigue siendo de Ana. Se compara contra a2 para ver qué cambia y qué no.

### 2. Registros creados

**Un lote — `registrarPagoDeDeuda` (2027-01-10):** un solo `PagoDeDeuda`. No se crea ni se modifica nada más.

| id | pasivo_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- |
| `pago-2` | `visa-ana` | `cuenta-beto` | $104.157 | 2027-01-10 | null | Beto |

Cambian `medio_de_pago_id` y `registrado_por` respecto de a2 (Ana → Beto), pero solo el medio decide a quién se le
atribuye el aporte: `registrado_por` no lo afecta. El `pasivo_id` sigue siendo `visa-ana`, que es lo que determina
el saldo.

### 3. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | Mercado $300.000 | — | $300.000 | — | — | $300.000 |
| 2026-12 | — | $6.235 | $6.235 | Ana $106.235 | cuota 1 $106.235, pagada | $200.000 |
| 2027-01 | — | $4.157 | $4.157 | **Beto $104.157** · Ana $0 | cuota 2 $104.157, pagada | $100.000 |
| 2027-02 | — | $2.078 | $2.078 | Ana $102.078 | cuota 3 $102.078, pagada | $0 |
| total de la vida | Mercado $300.000 | $12.470 | $312.470 | Ana $208.313 (66,7 %) · Beto $104.157 (33,3 %) | 3 cuotas pagadas | $0 |

Comparado con a2: el gasto de enero es el mismo `$4.157`, el saldo de la tarjeta baja igual y el total de la vida
sigue cerrando en `$312.470`. Lo único que cambia es **de quién es el aporte** en enero.

### 4. Lo que NO pasa

- No aparece ninguna fila "Ana le debe $104.157 a Beto" en el balance ni en ningún cálculo (**I7**).
- Beto **no** queda como dueño de la tarjeta: `owner_tipo`/`owner_miembro_id` del pasivo no cambian con un pago.
- El gasto de enero **no** sube a `$104.157`: el pago no es consumo; el costo financiero del mes es `$4.157`.
- El aporte de Ana en enero **no** queda en `$104.157` "porque la tarjeta es suya": el aporte lo define el medio
  desde el que salió la plata.
- El saldo del pasivo **no** mejora dos veces: baja una vez, por el pago, venga de quien venga.

### 5. Invariantes que lo protegen

- **I6** — El aporte es salida de caja de un medio del miembro: Cuenta Beto ⇒ aporte de Beto.
- **I7** — Ningún campo referencia a un miembro como acreedor; pagar el pasivo de otro solo sube el aporte de
  quien paga y baja el saldo del pasivo.
- **I9** — El dueño de los medios no cambia; por eso el aporte histórico no se puede alterar.
- **I10** — El saldo se deriva del pasivo, no del aportante.
- **I2 / I4** — El pago no agrega consumo; el interés ya estaba causado como costo financiero.

### 6. Test de fase 2 (descripción)

- **T-c-1 (pago cruzado).** *Given* el estado de a2 inmediatamente antes del pago de enero de Ana (cuota 1 pagada
  por Ana el 2026-12-10, cuota 2 pendiente). *When* se **reemplaza** ese pago por uno de Beto: un único
  `registrarPagoDeDeuda({pasivo: Visa Ana, medio: Cuenta Beto, monto: 104157, fecha: 2027-01-10})`, sin ningún pago
  de Ana en enero. *Then* existe exactamente un `PagoDeDeuda` en enero (medio Cuenta Beto, `$104.157`); el aporte de
  enero es Beto `104157` y el de Ana `0`; el gasto de enero sigue siendo `4157`; el saldo de Visa Ana al 2027-01-10
  es `100000` (`300000` de capital + `10392` de costos causados − `210392` de pagos) y el interés de febrero
  (`2078`) entra al saldo recién cuando se causa, el 2027-02-10; el balance de pareja no tiene fila de deuda y la
  suma de aportes del mes es `104157`.
- **T-c-2 (propiedad).** Para un mismo pago, permutar quién paga (Ana o Beto) deja invariantes el gasto del mes,
  el saldo del pasivo y las obligaciones, y cambia únicamente el reparto de aportes; la suma total de aportes no
  cambia.

---

## Ejemplo d — ingresos fijos vs variables en el balance de pareja

### 1. Situación

Noviembre de 2026. Ana tiene salario fijo de `$4.500.000` (día 30). Beto tiene salario fijo de `$2.000.000`
(día 15) y un ingreso variable de `$1.500.000` por freelance que llegó el 2026-11-20. Durante el mes hay dos
aportes a la cuenta común, dos compras de contado desde medios de miembros (Farmacia de Ana y Energía de Beto, que
es el pago de la obligación de energía), y una compra de contado desde el fondo común (el mercado).

### 2. Registros creados

**Configuración (lotes anteriores):** miembros, medios, categorías, los dos `Ingreso` fijos y la `Obligacion`
"Energía". El `Ingreso` variable se registra durante el mes, en su propio lote.

`Ingreso` (los fijos se cierran con `vigente_hasta`, no se editan)

| id | miembro_id | tipo | descripcion | monto | dia_esperado | vigente_desde | vigente_hasta | fecha |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ing-ana-fijo` | `ana` | fijo | Salario | $4.500.000 | 30 | 2026-01-01 | null | null |
| `ing-beto-fijo` | `beto` | fijo | Salario | $2.000.000 | 15 | 2026-01-01\* | null | null |
| `ing-beto-variable` | `beto` | variable | Freelance | $1.500.000 | null | null | null | 2026-11-20 |

Los dos fijos se crean al configurar el hogar. El variable se registra el 2026-11-20, en su propio lote: el alta de
un ingreso es una intención independiente y no toca ninguna compra ni ningún aporte.

\* D10 no fija la fecha de vigencia del salario de Beto; se usa la misma de Ana para que esté vigente en noviembre.

`Obligacion`

| id | nombre | categoria_id | monto_estimado | dia_vencimiento | periodicidad | mes_inicio | medio_sugerido_id | activa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oblig-energia` | Energía | Servicios | $300.000 | 15\* | mensual | 2026-01\* | `cuenta-beto`\* | true |

\* Campos que el ejemplo no necesita para cuadrar; el pago es una `Compra` con `obligacion_id` y `periodo`.

**Lotes del mes:** `registrarAporte`, uno por transferencia, y `registrarCompra`, uno por compra. Cada intención
es una transacción atómica propia.

`Aporte`

| id | medio_origen_id | medio_destino_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- |
| `aporte-ana-nov` | `cuenta-ana` | `cuenta-comun` | $1.500.000 | 2026-11-01 | null | Ana |
| `aporte-beto-nov` | `cuenta-beto` | `cuenta-comun` | $1.000.000 | 2026-11-15 | null | Beto |

`Compra`

| id | fecha | descripcion | monto_total | categoria_id | pago_tipo | medio_de_pago_id | obligacion_id | periodo | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-farmacia` | 2026-11-08 | Farmacia | $200.000 | Salud | contado | `cuenta-ana` | null | null | Ana |
| `compra-energia` | 2026-11-15 | Energía | $300.000 | Servicios | contado | `cuenta-beto` | `oblig-energia` | 2026-11 | Beto |
| `compra-mercado-nov` | 2026-11-22 | Mercado del mes | $900.000 | Mercado | contado | `cuenta-comun` | null | null | Ana |

Las tres compras son de contado: no crean plan ni cuotas. En la compra de Energía, `periodo` (`2026-11`) es el mes
de la instancia de la obligación, no el mes en que se paga: si esta instancia se pagara en diciembre, `periodo`
seguiría siendo `2026-11` (**I11**).

### 3. Cómo se ven los totales — noviembre 2026

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | Salud $200.000 · Servicios $300.000 · Mercado $900.000 | — | $1.400.000 | Ana $1.700.000 (56,7 %) · Beto $1.300.000 (43,3 %) | Energía 2026-11, pagada | $0 |

Composición del aporte de cada uno: Ana = `$1.500.000` (`Aporte`) + `$200.000` (Farmacia de contado desde Cuenta
Ana) = `$1.700.000`. Beto = `$1.000.000` (`Aporte`) + `$300.000` (Energía desde Cuenta Beto) = `$1.300.000`. Total
aportado `$3.000.000`; `1.700.000 / 3.000.000 = 56,7 %` y `1.300.000 / 3.000.000 = 43,3 %`.

**Balance de pareja (noviembre 2026)**

| miembro | aporte | % del total | ingreso del mes | % de su ingreso |
| --- | --- | --- | --- | --- |
| Ana | $1.700.000 | 56,7 % | $4.500.000 | 37,8 % |
| Beto | $1.300.000 | 43,3 % | $3.500.000 | 37,1 % |
| total | $3.000.000 | 100,0 % | $8.000.000 | 37,5 % |

No existe fila "debe", "diferencia" ni "compensación". La tabla termina en el total y no produce ninguna
obligación entre Ana y Beto.

**Salidas del fondo común (informativo, no es aporte de nadie):** `$900.000` del mercado pagado desde Cuenta
común. Por eso el aporte total (`$3.000.000`) es mayor que el gasto (`$1.400.000`): parte de la plata que entró al
fondo todavía no se gastó.

**Diciembre 2026 (nota):** sin freelance, el ingreso del mes de Beto es `$2.000.000`, no `$3.500.000`. El variable
cuenta solo en el mes en que llegó; en diciembre no hay movimientos en este ejemplo, así que sus aportes y su % del
ingreso son `$0` y `0,0 %`.

### 4. Lo que NO pasa

- El `Aporte` de `$1.500.000` **no** es gasto: no aparece en ninguna categoría ni en el gasto total.
- El mercado de `$900.000` **no** es aporte de nadie: salió del fondo común, que es del hogar (**I17** invierte la
  dirección: el `Aporte` va de un medio de miembro a un medio del hogar, no al revés).
- La Energía **no** se cuenta dos veces: es una `Compra` de `$300.000` (gasto y aporte de Beto) y la instancia de
  `Obligacion` solo aparece en la agenda como pagada.
- El ingreso **no** entra al gasto ni a los aportes: solo es el denominador de "% de su ingreso".
- Los porcentajes **no** se guardan ni se convierten en deuda; 56,7 / 43,3 se redondea solo al mostrar.
- El freelance de Beto **no** se arrastra a diciembre: el ingreso del mes es del mes.

### 5. Invariantes que lo protegen

- **I1** — Todos los montos son enteros; ningún porcentaje se guarda como monto.
- **I2** — Cada compra suma una vez, en su fecha, en su categoría.
- **I6** — El aporte es salida de caja del medio de un miembro: incluye compras de contado, pagos y `Aporte`.
- **I7** — El balance no tiene fila de deuda ni cálculo de diferencia.
- **I11** — Una sola compra por `(obligacion_id, periodo)`: no se puede pagar Energía de noviembre dos veces.
- **I17** — `Aporte` con origen de dueño miembro y destino de dueño hogar.

### 6. Test de fase 2 (descripción)

- **T-d-1 (totales del mes).** *Given* el escenario de noviembre con sus ingresos, aportes y compras. *When* se
  piden los totales de 2026-11. *Then* gasto por categoría = Salud `200000`, Servicios `300000`, Mercado `900000`;
  gasto total `1400000`; aportes Ana `1700000` (56,7 %) y Beto `1300000` (43,3 %); obligaciones = Energía 2026-11
  pagada; saldo de pasivos `0`.
- **T-d-2 (balance de pareja e ingreso).** *Given* el mismo escenario. *When* se pide el balance de 2026-11.
  *Then* ingreso del mes Ana `4500000` y Beto `3500000`; % de su ingreso `37,8 %` y `37,1 %`; no existe ninguna
  entrada de deuda; y para 2026-12 el ingreso de Beto es `2000000` sin el freelance.
- **T-d-3 (propiedad, identidad de aportes).** Para cualquier conjunto de movimientos del mes, Σ aportes de los
  miembros = salidas externas desde medios de miembros + Σ `Aporte`, y las salidas desde medios del hogar quedan
  fuera de la suma (**I16**, segunda identidad de D8).

---

## Ejemplo e — despensa de mascota recurrente

### 1. Situación

Luna es una perra del hogar. Su concentrado de 15 kg se compra cada 30 días y cuesta alrededor de `$180.000`. La
app guarda el ítem como recordatorio de reposición, no como gasto: octubre se compró desde la Cuenta común y
noviembre desde la Cuenta Beto.

### 2. Registros creados

**Configuración:** `Mascota` y `ItemDespensa`.

`Mascota`

| id | nombre | especie | fecha_nacimiento | activa |
| --- | --- | --- | --- | --- |
| `luna` | Luna | perro | null | true |

`ItemDespensa`

| id | mascota_id | nombre | categoria_id | frecuencia_dias | monto_habitual | activo |
| --- | --- | --- | --- | --- | --- | --- |
| `item-concentrado` | `luna` | Concentrado 15 kg | Mascotas | 30 | $180.000 | true |

**Lotes — `registrarCompra`, una por compra real:** cada una apunta al ítem y a la mascota.

`Compra`

| id | fecha | descripcion | monto_total | categoria_id | pago_tipo | medio_de_pago_id | mascota_id | item_despensa_id | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-conc-oct` | 2026-10-05 | Concentrado 15 kg | $180.000 | Mascotas | contado | `cuenta-comun` | `luna` | `item-concentrado` | Beto |
| `compra-conc-nov` | 2026-11-04 | Concentrado 15 kg | $185.000 | Mascotas | contado | `cuenta-beto` | `luna` | `item-concentrado` | Beto |

**Derivado, no guardado:** la próxima compra estimada es `2026-11-04 + 30 días = 2026-12-04`. Es un recordatorio:
no es gasto, no es obligación y no tiene entidad propia.

### 3. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10 | Mascotas $180.000 | — | $180.000 | — (salió del fondo común) | — | $0 |
| 2026-11 | Mascotas $185.000 | — | $185.000 | Beto $185.000 (100,0 %) | — | $0 |

Filtro por mascota: en noviembre, `$185.000` para Luna; en octubre, `$180.000`. El filtro no cambia el total de la
categoría en este caso porque Luna es la única mascota.

### 3 bis. Variante — la reposición de diciembre se paga con tarjeta

El 2026-12-03 se compra el concentrado por `$182.000` con la Visa Ana, a 1 cuota y sin tasa. Con corte 25 y pago
10, la cuota vence el 2027-01-10.

**Lote 1 — `registrarCompra` (2026-12-03):** `Compra` + `PlanDeCuotas` + 1 `Cuota`.

| id | fecha | descripcion | monto_total | categoria_id | pago_tipo | medio_de_pago_id | mascota_id | item_despensa_id | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-conc-dic` | 2026-12-03 | Concentrado 15 kg | $182.000 | Mascotas | financiado | null | `luna` | `item-concentrado` | Ana |

`PlanDeCuotas`

| id | pasivo_id | origen | compra_id | fecha_inicio | capital | sistema | n_cuotas | fecha_primera_cuota | tasa_tipo | tasa_ppm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan-conc-dic` | `visa-ana` | compra | `compra-conc-dic` | 2026-12-03 | $182.000 | capital_fijo | 1 | 2027-01-10 | null | null |

`Cuota`

| id | plan_id | numero | fecha_vencimiento | capital |
| --- | --- | --- | --- | --- |
| `cuota-conc-dic-1` | `plan-conc-dic` | 1 | 2027-01-10 | $182.000 |

**Lote 2 — `registrarPagoDeDeuda` (2027-01-10):** cuando alguien paga, ahí nace el aporte, de quien pague.

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-12 (variante) | Mascotas $182.000 | — | $182.000 | — | — | $182.000 |
| 2027-01 (variante) | — | — | $0 | quien pague, $182.000 | cuota $182.000, pagada | $0 |

La próxima compra estimada pasa a ser `2026-12-03 + 30 días = 2027-01-02`.

### 4. Lo que NO pasa

- El concentrado **no** se cuenta al comprarlo y otra vez al pagar la cuota: `$182.000` aparece una vez, en
  diciembre.
- El ítem de despensa **no** es gasto ni obligación: no entra en ningún total aunque tenga `monto_habitual`.
- La próxima compra estimada **no** es un gasto proyectado ni una obligación del mes.
- La compra de octubre desde la Cuenta común **no** es aporte de nadie: salió del fondo del hogar.
- Comprar con tarjeta **no** adelanta el gasto a enero: el consumo es de diciembre y el pago es de enero.

### 5. Invariantes que lo protegen

- **I2** — La compra suma una vez, en su fecha, por `monto_total`, sea de contado o financiada.
- **I3** — 1 cuota con capital `$182.000`; `plan.capital = monto_total`; Σ cuotas = `$182.000`.
- **I6** — Financiar no es aportar; el aporte aparece con el pago, desde el medio de quien paga.
- **I10** — Estado de la cuota y próxima compra derivados, nunca guardados.
- **I15** — Si una compra se corrige, se marca `eliminado_en` y deja de contar; el ítem de despensa no se borra.

### 6. Test de fase 2 (descripción)

- **T-e-1 (dos contados).** *Given* Luna y su ítem. *When* se registran las compras de octubre y noviembre.
  *Then* `totalesDelMes(2026-10)` da gasto Mascotas `180000` y aportes `0`; `totalesDelMes(2026-11)` da
  `185000` y aporte de Beto `185000`; el filtro por Luna devuelve `185000` en noviembre; y la próxima compra
  estimada es `2026-12-04` sin aparecer en gasto ni en obligaciones.
- **T-e-2 (variante financiada).** *Given* el hogar con Luna y su ítem. *When* se registra la compra del
  2026-12-03 por `$182.000` con Visa Ana a 1 cuota. *Then* existe 1 `PlanDeCuotas` y 1 `Cuota` con vencimiento
  `2027-01-10`; el gasto de diciembre es `182000` (una sola vez) y los aportes de diciembre son `0`; el saldo de
  Visa Ana es `182000`; y al registrar el pago del 2027-01-10 el aporte del mes es de quien pagó y el saldo vuelve
  a `0`.
- **T-e-3 (propiedad).** Para cualquier secuencia de compras con `frecuencia_dias = f`, la próxima compra estimada
  es la última `fecha` + `f` días, y ninguna función de totales incluye esa fecha estimada; el gasto acumulado
  sigue siendo Σ de los `monto_total` de las compras no eliminadas (**I16**).

---

## Resumen

| ejemplo | qué demuestra | invariantes | test de fase 2 |
| --- | --- | --- | --- |
| a1 | compra financiada sin tasa: consumo una vez, cuotas son pagos | I1, I2, I3, I6, I7, I10, I13 | T-a1-1, T-a1-2, T-a1-3 (propiedad) |
| a2 | tasa E.A. → M.V., interés como costo financiero aparte | I2, I3, I4, I5, I6, I10 | T-a2-1, T-a2-2, T-a2-3 (conservación) |
| b | deuda del hogar pagada por ambos, sin deuda entre miembros | I2, I3, I6, I7, I8, I10, I14 | T-b-1, T-b-2, T-b-3 |
| c | un miembro paga la tarjeta del otro: cambia el aporte, no el gasto | I2, I4, I6, I7, I9, I10 | T-c-1, T-c-2 (propiedad) |
| d | ingresos fijos vs variables, balance de pareja sin "debe" | I1, I2, I6, I7, I11, I17 | T-d-1, T-d-2, T-d-3 (identidad de aportes) |
| e | despensa recurrente, recordatorio derivado y variante con tarjeta | I2, I3, I6, I10, I15 | T-e-1, T-e-2, T-e-3 (propiedad) |

Los property-based tests de a1, a2, c, d y e cubren la identidad de conservación **I16** desde ángulos distintos:
sin tasa, con tasa, con pagos parciales y con salidas del fondo común. Todos se prueban a través de la interfaz
pública del dominio (casos de uso + funciones de totales), nunca leyendo la base de datos.

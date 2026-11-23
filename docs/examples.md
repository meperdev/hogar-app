# Ejemplos trabajados

Este documento baja el modelo de datos a números reales en COP. Cada ejemplo muestra qué registros se crean,
cómo se ven los totales del mes, qué error de doble conteo evita el modelo y qué invariante y qué test lo protegen.
Sirve como oráculo para los tests de fase 2 y como material de revisión para verificar que las definiciones de
totales cierran a mano.

Las reglas de negocio están en [domain.md](domain.md) y las entidades, campos, fórmulas e invariantes en
[data-model.md](data-model.md); acá no se redefinen, solo se calculan con ellas. Todas las cifras de este
documento se verificaron con `python3` (aritmética entera, redondeo al peso y porcentajes a un decimal).

## Propósito

- Comprobar con aritmética explícita que las definiciones de los totales del mes producen los números esperados.
- Mostrar que un consumo se cuenta **una sola vez**, aunque se pague en cuotas y con intereses.
- Mostrar que pagar el pasivo de otro miembro no crea ninguna deuda entre miembros.
- Mostrar que lo personal y lo del hogar no se mezclan, ni en el gasto ni en los aportes.
- Mostrar que el desembolso de un préstamo en efectivo entra una vez, en la fecha del giro, y que el aporte
  aparece cuando se paga el préstamo.
- Mostrar que un pago que dejaría el saldo del pasivo negativo, o un segundo enlace a una cuota ya cubierta, se
  rechazan, y que un reintento del mismo lote no se confunde con un pago nuevo.
- Mostrar que un ingreso fijo recibido por un monto distinto cambia el denominador de "% de su ingreso" y no los
  aportes.
- Dar a los tests de fase 2 un resultado concreto que se pueda afirmar sin ambigüedad.

## Escenario base

Todos los ejemplos usan el mismo hogar. Los identificadores de las tablas (`compra-mercado`, `plan-mercado`,
`cuenta-ana`, `cat-mercado`, …) son alias legibles de los uuid que genera el cliente (UUIDv7): `compra-1` y
`compra-mercado` designan la misma fila, y así con todos los demás.

| Entidad | id corto | Campos relevantes |
| --- | --- | --- |
| Hogar | `hogar-1` | `nombre` "Casa", `moneda` COP, `zona_horaria` America/Bogota, `mostrar_pct_ingreso` false |
| Miembro | `ana` | `nombre` Ana, `rol` admin, `activo` true |
| Miembro | `beto` | `nombre` Beto, `rol` miembro, `activo` true |
| MedioDePago | `cuenta-ana` | `nombre` "Cuenta Ana", `tipo` cuenta, `owner_tipo` miembro (`ana`), `activo` true |
| MedioDePago | `cuenta-beto` | `nombre` "Cuenta Beto", `tipo` cuenta, `owner_tipo` miembro (`beto`), `activo` true |
| MedioDePago | `cuenta-comun` | `nombre` "Cuenta común", `tipo` cuenta, `owner_tipo` hogar, `owner_miembro_id` null |
| Pasivo / Tarjeta | `visa-ana` | `tipo` tarjeta, `nombre` "Visa Ana", `owner_tipo` miembro (`ana`), `dia_corte` 25, `dia_pago` 10, `tasa_tipo`/`tasa_ppm` null (en a2: EA / 280000) |

## Los totales

| Total | Qué suma | Qué nunca suma |
| --- | --- | --- |
| Gasto del hogar del mes | Σ `Compra.monto_total` con `ambito='hogar'` y fecha en el mes + Σ `CostoFinanciero.monto` de ámbito hogar con `fecha_causacion` en el mes | Compras personales, `PagoDeDeuda`, `Aporte`; el `iva` de una factura (ya está dentro de `monto_total`) |
| Gasto personal del mes | Σ compras `ambito='personal'` del miembro con fecha en el mes + los costos de ámbito personal atribuidos a ese miembro | Se muestra al dueño o con `incluir_personales`; nunca entra al gasto del hogar ni a los aportes |
| Aportes del mes | Salidas de medios de cada miembro que cubren cargos del hogar: compras de contado del hogar, pagos `abono` de pasivos del hogar, saldo a favor aplicado, costos pagados directo, `Aporte` | Compras personales, compras pagadas con `financiada_por_pasivo_id`, pagos a un libro personal, saldo a favor no aplicado, salidas del fondo común |
| Obligaciones del mes | Agenda: cuotas con `fecha_vencimiento` en el mes (capital más sus costos con `cuota_id`) + costos cargados **sin `cuota_id`** causados en el mes + instancias de `Obligacion` del mes, con su estado derivado | No se suma al gasto; el interés de una cuota nunca se cuenta dos veces en la agenda |
| Saldo del pasivo | Σ capital de planes con `fecha_inicio` ≤ fecha + Σ costos cargados al pasivo − Σ `PagoDeDeuda` `abono` − Σ saldo a favor aplicado a cargos; **nunca negativo** | No depende de los aportes |

Definiciones exactas, campos, fórmulas e invariantes: [data-model.md](data-model.md) (entidades, campos, totales e
invariantes I1–I26). Este documento no redefine nada: solo calcula con esas reglas.

### Convenciones de lectura

- Fechas `YYYY-MM-DD`; el mes contable sale de la fecha civil (**I12**).
- Montos enteros en COP con formato `$300.000` (**I1**). Los porcentajes usan coma decimal y se redondean a un
  decimal **solo al mostrarse**; nunca se guardan.
- Las columnas de sincronización (`seq`, `creado_en`, `eliminado_en`, `actualizado_por`) se omiten: no cambian
  ningún total.
- `registrado_por` no afecta ningún total. En los ejemplos registra el miembro que aparece en la situación.
- Toda `Compra` de los ejemplos a–e es `ambito='hogar'` con `miembro_id` nulo, salvo que el ejemplo diga otra
  cosa; todo `PagoDeDeuda` es `tipo='abono'` y solo lleva `cuota_id` cuando cubre una cuota completa (**I20**).
- El `iva` de una factura ya está dentro de `monto_total`: se muestra, nunca se suma aparte (**I2**, **I4**).
- `incluir_personales` es preferencia **local** del dispositivo y `Hogar.mostrar_pct_ingreso` viene apagado: cada
  tabla aclara qué vista muestra.
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

| id | pasivo_id | cuota_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pago-1` | `visa-ana` | `cuota-1` | `cuenta-ana` | $100.000 | 2026-12-10 | null | Ana |
| `pago-2` | `visa-ana` | `cuota-2` | `cuenta-ana` | $100.000 | 2027-01-10 | null | Ana |
| `pago-3` | `visa-ana` | `cuota-3` | `cuenta-ana` | $100.000 | 2027-02-10 | null | Ana |

Cada pago cubre una cuota completa y la declara en `cuota_id`. El enlace es **declarativo**: no asigna nada ni
cambia el orden, y el estado de cada cuota se sigue derivando por FIFO (**I10**, **I20**). Un pago parcial no
llevaría `cuota_id`.

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
  la compra** es exactamente `monto`, sin importar cuántos pagos se hayan hecho (**I3** e **I16**). En este ejemplo
  los tres términos extra de la conservación valen `0`: no hay plan `saldo_inicial` ni `desembolso`, y no hay
  `saldo_a_favor`, así que `Σ gasto = Σ salidas externas + Σ saldo`.

### 7. Variante canónica de fechas de cuota (22 nov, corte 15, pago 25)

La decisión del 22 nov fija el caso de referencia: compra el 22 de noviembre, corte el 15 y pago el 25. La regla de
[data-model.md](data-model.md) §9 da `corte_1 = 2026-12-15` (el día 22 ya pasó el corte de noviembre) y
`pago_1 = 2026-12-25` (primer 25 posterior al corte), y de ahí las cuotas salen mes a mes.

| cuota | fecha_vencimiento | capital |
| --- | --- | --- |
| 1 | 2026-12-25 | $100.000 |
| 2 | 2027-01-25 | $100.000 |
| 3 | 2027-02-25 | $100.000 |

Los ejemplos a1, a2, c y e usan otra tarjeta (`visa-ana`, corte 25, pago 10) con sus propias fechas
`2026-12-10`, `2027-01-10`, `2027-02-10`. Las dos son internamente consistentes y no se reemplazan: la variante
solo fija cuál es el caso canónico de la decisión y sirve de fixture para el cálculo de fechas. Con la misma
compra de `$300.000` en 3 cuotas, esta variante muestra que el gasto sigue siendo `$300.000` en noviembre y que
solo cambian los vencimientos, no ningún total.

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

| id | pasivo_id | cuota_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pago-1` | `visa-ana` | `cuota-1` | `cuenta-ana` | $106.235 | 2026-12-10 | null | Ana |
| `pago-2` | `visa-ana` | `cuota-2` | `cuenta-ana` | $104.157 | 2027-01-10 | null | Ana |
| `pago-3` | `visa-ana` | `cuota-3` | `cuenta-ana` | $102.078 | 2027-02-10 | null | Ana |

Cada pago cubre el cargo completo de su cuota (capital + su interés) y lo declara en `cuota_id`; el FIFO sigue
siendo el que reparte y el enlace no reasigna nada (**I10**, **I20**). Dos pagos completos enlazados a la misma
cuota no pueden coexistir: ese es el caso del ejemplo h.

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
  es igual a Σ aportes; la identidad de conservación se cumple exactamente, sin tolerancia. En un plan
  `origen='compra'` los tres términos negativos de **I16** son `0` (sin `saldo_inicial`, sin `desembolso`, sin
  `saldo_a_favor`), así que la igualdad anterior es la identidad completa; el ejemplo g es el que ejercita los
  términos no nulos.

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

| id | pasivo_id | cuota_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pago-dec-ana` | `deuda-1` | null | `cuenta-ana` | $120.000 | 2026-12-05 | null | Ana |
| `pago-dec-beto` | `deuda-1` | null | `cuenta-beto` | $80.000 | 2026-12-05 | null | Beto |
| `pago-ene-ana` | `deuda-1` | null | `cuenta-ana` | $50.000 | 2027-01-05 | null | Ana |
| `pago-ene-beto` | `deuda-1` | null | `cuenta-beto` | $150.000 | 2027-01-05 | null | Beto |

Ningún pago individual cubre una cuota completa (`$120.000` y `$80.000` son parciales), así que ninguno lleva
`cuota_id`: la cuota 1 queda pagada recién con la suma de los dos, que es lo que ve el FIFO (**I10**).

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

| id | pasivo_id | cuota_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pago-2` | `visa-ana` | `cuota-2` | `cuenta-beto` | $104.157 | 2027-01-10 | null | Beto |

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

| id | serie_id | miembro_id | tipo | descripcion | monto | dia_esperado | vigente_desde | vigente_hasta | fecha |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ing-ana-fijo` | `ing-ana-fijo` | `ana` | fijo | Salario | $4.500.000 | 30 | 2026-01-01 | null | null |
| `ing-beto-fijo` | `ing-beto-fijo` | `beto` | fijo | Salario | $2.000.000 | 15 | 2026-01-01\* | null | null |
| `ing-beto-variable` | null | `beto` | variable | Freelance | $1.500.000 | null | null | null | 2026-11-20 |

Los dos fijos se crean al configurar el hogar. El variable se registra el 2026-11-20, en su propio lote: el alta de
un ingreso es una intención independiente y no toca ninguna compra ni ningún aporte.

\* D10 no fija la fecha de vigencia del salario de Beto; se usa la misma de Ana para que esté vigente en noviembre.

`RecepcionIngreso` (el recibo de noviembre de cada fijo; `monto_recibido` null = llegó el monto esperado)

| id | ingreso_id | serie_id | periodo | recibido | monto_recibido | fecha_recepcion | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rec-ana-nov` | `ing-ana-fijo` | `ing-ana-fijo` | 2026-11 | true | null | 2026-11-30 | Ana |
| `rec-beto-nov` | `ing-beto-fijo` | `ing-beto-fijo` | 2026-11 | true | null | 2026-11-15 | Beto |

`serie_id` es una columna física del recibo: la pone el servidor desde la versión referenciada y es inmutable, así
el índice único parcial `(serie_id, periodo)` es implementable y el cliente no puede reclamar una serie ajena
([data-model.md](data-model.md) §3.3.1).

El recibo no crea un ingreso nuevo ni cambia `Ingreso.monto`: solo marca ese periodo como **recibido**. Sin la
fila, el estado sería **esperado** y el balance usaría igual el monto declarado. Los dos recibos son del mismo mes
del periodo (`periodo` `2026-11` con `fecha_recepcion` en noviembre); el `periodo` es el que manda, no la fecha de
recepción (**I22**).

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

| miembro | aporte | % del total | ingreso del mes | estado del fijo | % de su ingreso |
| --- | --- | --- | --- | --- | --- |
| Ana | $1.700.000 | 56,7 % | $4.500.000 | recibido | 37,8 % |
| Beto | $1.300.000 | 43,3 % | $3.500.000 ($2.000.000 fijo + $1.500.000 variable) | recibido | 37,1 % |
| total | $3.000.000 | 100,0 % | $8.000.000 | — | 37,5 % |

No existe fila "debe", "diferencia" ni "compensación". La tabla termina en el total y no produce ninguna
obligación entre Ana y Beto.

El estado sale de `RecepcionIngreso`: **recibido** si hay fila con `recibido=true`, **esperado** si no hay fila o
`recibido=false`. La columna "% de su ingreso" es **opcional**: `Hogar.mostrar_pct_ingreso` viene apagado por
defecto, así que el balance muestra pesos y % del total aportado, y solo con el interruptor prendido agrega el %
sobre el ingreso individual. Nada de eso se guarda: `1.700.000 / 4.500.000 = 37,777… %` se muestra como `37,8 %` y
se recalcula cada vez.

**Salidas del fondo común (informativo, no es aporte de nadie):** `$900.000` del mercado pagado desde Cuenta
común. Por eso el aporte total (`$3.000.000`) es mayor que el gasto (`$1.400.000`): parte de la plata que entró al
fondo todavía no se gastó.

**Diciembre 2026 (nota):** sin freelance, el ingreso del mes de Beto es `$2.000.000`, no `$3.500.000`. El variable
cuenta solo en el mes en que llegó; en diciembre no hay movimientos en este ejemplo, así que sus aportes y su % del
ingreso son `$0` y `0,0 %`. Tampoco hay `RecepcionIngreso` de `2026-12`: el estado de los dos fijos es **esperado** y
el ingreso del mes es el monto declarado (`$4.500.000` y `$2.000.000`).

### 4. Lo que NO pasa

- El `Aporte` de `$1.500.000` **no** es gasto: no aparece en ninguna categoría ni en el gasto total.
- El mercado de `$900.000` **no** es aporte de nadie: salió del fondo común, que es del hogar (**I17** invierte la
  dirección: el `Aporte` va de un medio de miembro a un medio del hogar, no al revés).
- La Energía **no** se cuenta dos veces: es una `Compra` de `$300.000` (gasto y aporte de Beto) y la instancia de
  `Obligacion` solo aparece en la agenda como pagada.
- El ingreso **no** entra al gasto ni a los aportes: solo es el denominador de "% de su ingreso".
- El recibo **no** edita el salario: marcar un periodo como recibido es un hecho aparte (`RecepcionIngreso`) y
  `Ingreso.monto` no cambia (**I22**).
- El "% de su ingreso" **no** se muestra por defecto ni se guarda: depende de `mostrar_pct_ingreso` y se recalcula
  a un decimal al mostrarse.
- Los porcentajes **no** se guardan ni se convierten en deuda; 56,7 / 43,3 se redondea solo al mostrar.
- El freelance de Beto **no** se arrastra a diciembre: el ingreso del mes es del mes.

### 5. Invariantes que lo protegen

- **I1** — Todos los montos son enteros; ningún porcentaje se guarda como monto.
- **I2** — Cada compra suma una vez, en su fecha, en su categoría.
- **I6** — El aporte es salida de caja del medio de un miembro: incluye compras de contado, pagos y `Aporte`.
- **I7** — El balance no tiene fila de deuda ni cálculo de diferencia.
- **I11** — Una sola compra por `(obligacion_id, periodo)`: no se puede pagar Energía de noviembre dos veces.
- **I17** — `Aporte` con origen de dueño miembro y destino de dueño hogar.
- **I22** — Un `RecepcionIngreso` por `(serie_id, periodo)`; el balance usa `monto_recibido` si `recibido=true` y
  el esperado si no.

### 6. Test de fase 2 (descripción)

- **T-d-1 (totales del mes).** *Given* el escenario de noviembre con sus ingresos, aportes y compras. *When* se
  piden los totales de 2026-11. *Then* gasto por categoría = Salud `200000`, Servicios `300000`, Mercado `900000`;
  gasto total `1400000`; aportes Ana `1700000` (56,7 %) y Beto `1300000` (43,3 %); obligaciones = Energía 2026-11
  pagada; saldo de pasivos `0`.
- **T-d-2 (balance de pareja e ingreso).** *Given* el mismo escenario. *When* se pide el balance de 2026-11.
  *Then* ingreso del mes Ana `4500000` y Beto `3500000`; estado de los dos fijos "recibido"; % de su ingreso
  `37,8 %` y `37,1 %`; no existe ninguna entrada de deuda; y para 2026-12 el ingreso de Beto es `2000000` sin el
  freelance y el estado de los dos fijos es "esperado" (**I22**).
- **T-d-3 (propiedad, identidad de aportes).** Para cualquier conjunto de movimientos del mes, Σ aportes de los
  miembros = salidas externas desde medios de miembros que cubren cargos del hogar + Σ `Aporte`, y las salidas desde
  medios del hogar quedan fuera de la suma (**I16**, segunda identidad de §8 de [data-model.md](data-model.md)). En
  este ejemplo los tres términos extra de la conservación valen `0`: sin `saldo_inicial`, sin `desembolso` y sin
  `saldo_a_favor`, así que `Σ gasto = Σ salidas externas + Σ saldo` y Σ saldo es `0`.

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

| id | mascota_id | nombre | tipo | categoria_id | frecuencia_dias | umbral_alerta_pct | monto_habitual | activo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `item-concentrado` | `luna` | Concentrado 15 kg | comida | Mascotas | 30 | 20 | $180.000 | true |

**Lotes — `registrarCompra`, una por compra real:** cada una apunta al ítem y a la mascota.

`Compra`

| id | fecha | descripcion | monto_total | categoria_id | pago_tipo | medio_de_pago_id | mascota_id | item_despensa_id | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-conc-oct` | 2026-10-05 | Concentrado 15 kg | $180.000 | Mascotas | contado | `cuenta-comun` | `luna` | `item-concentrado` | Beto |
| `compra-conc-nov` | 2026-11-04 | Concentrado 15 kg | $185.000 | Mascotas | contado | `cuenta-beto` | `luna` | `item-concentrado` | Beto |

`NivelDespensa` (hechos observados; cada compra del ítem registra nivel 100 en el mismo lote atómico)

| id | item_despensa_id | compra_id | fecha | nivel_pct | origen | lote |
| --- | --- | --- | --- | --- | --- | --- |
| `nivel-oct` | `item-concentrado` | `compra-conc-oct` | 2026-10-05 | 100 | compra | con `compra-conc-oct` |
| `nivel-nov` | `item-concentrado` | `compra-conc-nov` | 2026-11-04 | 100 | compra | con `compra-conc-nov` |
| `nivel-ajuste-1` | `item-concentrado` | null | 2026-11-20 | 54 | ajuste | propio |
| `nivel-ajuste-2` | `item-concentrado` | null | 2026-11-28 | 15 | ajuste | propio |

**Derivado, no guardado**, con `frecuencia_dias = 30` y `umbral_alerta_pct = 20`:

| consulta al | nivel_actual | días restantes | próxima compra estimada | alerta |
| --- | --- | --- | --- | --- |
| antes de `nivel-oct` | desconocido | — | — | no |
| 2026-10-05 | 100 | `floor(100 × 30 / 100) = 30` | `2026-10-05 + 30 = 2026-11-04` | no |
| 2026-11-04 | 100 | `floor(100 × 30 / 100) = 30` | `2026-11-04 + 30 = 2026-12-04` | no |
| 2026-11-20 | 54 | `floor(54 × 30 / 100) = 16` | `2026-11-20 + 16 = 2026-12-06` | no (54 > 20) |
| 2026-11-28 | 15 | `floor(15 × 30 / 100) = 4` | `2026-11-28 + 4 = 2026-12-02` | **sí** (15 ≤ 20) |

Cada compra **resetea** el nivel a 100 con un hecho nuevo, no con una columna: un ajuste posterior lo baja y la
compra siguiente lo vuelve a subir. El nivel actual, los días restantes, la próxima compra estimada y la alerta se
calculan en cada consulta a partir del último hecho compartido por `(fecha, id)`; el ítem no guarda ninguno de los cuatro
(**I21**). La próxima compra estimada es un recordatorio: no es gasto, no es obligación y no tiene entidad propia.

### 3. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10 | Mascotas $180.000 | — | $180.000 | — (salió del fondo común) | — | $0 |
| 2026-11 | Mascotas $185.000 | — | $185.000 | Beto $185.000 (100,0 %) | — | $0 |

Filtro por mascota: en noviembre, `$185.000` para Luna; en octubre, `$180.000`. El filtro no cambia el total de la
categoría en este caso porque Luna es la única mascota etiquetada en la categoría Mascotas.

### 3 ter. Alcance del total de mascotas (fixtures positivas y negativas)

Sobre el mismo noviembre, cuatro compras más para fijar el alcance de la tarjeta "Mascotas" del hogar (no alteran
las cifras de §3, que son el escenario base):

| id | ámbito | categoría | mascota_id | monto | qué demuestra |
| --- | --- | --- | --- | --- | --- |
| `compra-juguete` | hogar | Mascotas | `luna` | $20.000 | positiva: suma al total y al desglose de Luna |
| `compra-vet` | hogar | Mascotas | null | $40.000 | positiva sin etiqueta: suma al total, no a una mascota |
| `compra-arena` | hogar | Mercado | `luna` | $10.000 | negativa: etiqueta mal puesta, sigue siendo Mercado |
| `compra-masc-ana` | personal | Mascotas | `luna` | $50.000 | negativa en la vista compartida: es de Ana |

| vista | cálculo | resultado |
| --- | --- | --- |
| Total Mascotas del hogar (noviembre) | `185.000 + 20.000 + 40.000` | **$245.000** |
| Desglose por mascota: Luna | `185.000 + 20.000` | $205.000 |
| Desglose sin etiqueta | `40.000` | $40.000 |
| Suma del desglose | `205.000 + 40.000` | **$245.000** = el total, sin doble conteo |
| Mercado del hogar (noviembre) | `compra-arena` sigue en su categoría | $10.000 |
| Vista personal de Ana | `compra-masc-ana` | $50.000, nunca en la vista compartida |

La tarjeta es una **vista de categoría**: el total son compras de ámbito hogar de la categoría Mascotas, cada una
una vez. `mascota_id` solo reparte ese total; no agrega compras de otras categorías ni convierte una compra personal
en gasto del hogar (**I26**).

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

Esa compra agrega `NivelDespensa` con `compra_id='compra-conc-dic'`, `origen='compra'`, `nivel_pct=100` y
`fecha=2026-12-03` en el mismo lote. El nivel vuelve a 100, los días restantes a `floor(100 × 30 / 100) = 30` y
la próxima compra estimada pasa a ser
`2026-12-03 + 30 días = 2027-01-02`, con la alerta apagada porque 100 > 20.

### 4. Lo que NO pasa

- El concentrado **no** se cuenta al comprarlo y otra vez al pagar la cuota: `$182.000` aparece una vez, en
  diciembre.
- El ítem de despensa **no** es gasto ni obligación: no entra en ningún total aunque tenga `monto_habitual`.
- La próxima compra estimada **no** es un gasto proyectado ni una obligación del mes.
- La compra de octubre desde la Cuenta común **no** es aporte de nadie: salió del fondo del hogar.
- Comprar con tarjeta **no** adelanta el gasto a enero: el consumo es de diciembre y el pago es de enero.
- El nivel de despensa **no** es una columna del ítem: la compra solo deja un hecho `NivelDespensa` con
  `nivel_pct = 100`; el nivel actual, los días, la próxima compra y la alerta se derivan (**I21**).
- Una alerta **no** crea compra, obligación ni gasto: es un aviso sobre el nivel derivado.
- Un ajuste **no** crea ni modifica compras: es un lote propio con su `nivel_pct` y su fecha.

### 5. Invariantes que lo protegen

- **I2** — La compra suma una vez, en su fecha, por `monto_total`, sea de contado o financiada.
- **I3** — 1 cuota con capital `$182.000`; `plan.capital = monto_total`; Σ cuotas = `$182.000`.
- **I6** — Financiar no es aportar; el aporte aparece con el pago, desde el medio de quien paga.
- **I10** — Estado de la cuota y saldo derivados, nunca guardados.
- **I15** — Si una compra se corrige, se marca `eliminado_en` y deja de contar; el ítem de despensa no se borra.
- **I21** — Nivel de despensa derivado (nunca guardado), determinista con nivel desconocido o `frecuencia_dias`
  nula; la compra del ítem guarda `NivelDespensa(100)` en el mismo lote atómico.

### 6. Test de fase 2 (descripción)

- **T-e-1 (dos contados).** *Given* Luna y su ítem. *When* se registran las compras de octubre y noviembre.
  *Then* `totalesDelMes(2026-10)` da gasto Mascotas `180000` y aportes `0`; `totalesDelMes(2026-11)` da
  `185000` y aporte de Beto `185000`; el filtro por Luna devuelve `185000` en noviembre; cada compra creó su
  `NivelDespensa` con su `compra_id`, `nivel_pct = 100` y `origen='compra'` en el mismo lote; el nivel derivado es `100`, no hay
  alerta y la próxima compra estimada es `2026-12-04`, sin aparecer en gasto ni en obligaciones.
- **T-e-2 (variante financiada).** *Given* el hogar con Luna y su ítem. *When* se registra la compra del
  2026-12-03 por `$182.000` con Visa Ana a 1 cuota. *Then* existe 1 `PlanDeCuotas` y 1 `Cuota` con vencimiento
  `2027-01-10`; el gasto de diciembre es `182000` (una sola vez) y los aportes de diciembre son `0`; el saldo de
  Visa Ana es `182000`; la compra resetea el nivel a `100` y la próxima compra estimada es `2027-01-02`; y al
  registrar el pago del 2027-01-10 el aporte del mes es de quien pagó y el saldo vuelve a `0`.
- **T-e-4 (ajuste y reset).** *Given* el ítem con nivel 100 al 2026-11-04. *When* se registra un ajuste a `54` el
  2026-11-20 y otro a `15` el 2026-11-28. *Then* el nivel derivado es `54` (16 días de vida útil, próxima
  `2026-12-06`, sin alerta) y después `15` (4 días, próxima `2026-12-02`, con alerta); ninguna de las dos compras
  del ítem se crea ni se modifica; y la compra siguiente vuelve a dejar el nivel en `100`.
- **T-e-5 (alcance del total de mascotas).** *Given* las cuatro fixtures de §3 ter. *Then* el total Mascotas del
  hogar es `245000`; el desglose suma `245000` (Luna `205000` + sin etiqueta `40000`); `compra-arena` queda en
  Mercado (`10000`) y no entra al total de mascotas; `compra-masc-ana` no aparece en la vista compartida y sí en la
  vista personal de Ana (`50000`); ninguna compra se cuenta dos veces (**I26**).
- **T-e-6 (días restantes vs. vida útil).** *Given* la observación del 2026-11-20 con `nivel_pct=54` y
  `frecuencia_dias=30`. *Then* `vida_util_dias=16` y `proxima_compra_estimada=2026-12-06` son fijos, y al consultar
  el 2026-11-26 `dias_restantes=10`; el 2026-12-08 es `-2` (vencida). El valor no se congela en `16`.
- **T-e-3 (propiedad, nivel derivado).** Para cualquier `nivel_pct` en `0..100` y cualquier `frecuencia_dias = f`
  positivo: `vida_util_dias = floor(nivel_pct × f / 100)`, `proxima_compra_estimada = observacion.fecha +
  vida_util_dias`, `dias_restantes(hoy) = proxima_compra_estimada − hoy` y `alerta` es verdadera si y solo si
  `nivel_pct ≤ umbral_alerta_pct`; sin observación compartida el nivel es desconocido, sin alerta y sin fecha; con
  `frecuencia_dias` nula el nivel y la alerta existen pero los días y la próxima compra son `null`. Ninguna función
  de totales incluye la fecha estimada y el gasto acumulado sigue siendo Σ de los `monto_total` de las compras no
  eliminadas (**I16**, **I21**).

---

## Ejemplo f — compra personal vs compra del hogar

### 1. Situación

Noviembre de 2026. Ana paga el mercado del hogar (`$300.000`, Cuenta Ana) y una farmacia personal (`$85.000` con
factura electrónica, IVA del 19 % incluido, Cuenta Ana). Beto paga un cine personal (`$60.000`, Cuenta Beto). Nadie
prendió `incluir_personales` y el hogar no prendió `mostrar_pct_ingreso`.

### 2. Registros creados

**Configuración:** `Hogar.mostrar_pct_ingreso = false`. `incluir_personales` no es una columna: es preferencia
**local** del dispositivo de cada miembro, no viaja en el lote y no altera ningún cálculo.

`Compra`

| id | fecha | descripcion | monto_total | categoria_id | ambito | miembro_id | pago_tipo | medio_de_pago_id | cufe | nit_comercio | iva | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-mercado-nov` | 2026-11-05 | Mercado | $300.000 | Mercado | hogar | null | contado | `cuenta-ana` | null | null | null | Ana |
| `compra-farmacia-ana` | 2026-11-08 | Farmacia | $85.000 | Salud | personal | `ana` | contado | `cuenta-ana` | `cufe-1` | 900123456 | $13.571 | Ana |
| `compra-cine-beto` | 2026-11-12 | Cine | $60.000 | Entretenimiento | personal | `beto` | contado | `cuenta-beto` | null | null | null | Beto |

**El IVA incluido se muestra, no se suma.** `$85.000` con IVA del 19 % incluido son `85.000 × 19 / 119 =
13.571,43…`, es decir `iva = $13.571` sobre una base de `$71.429`; `71.429 + 13.571 = 85.000`. El campo `iva` es
informativo y nunca se agrega a `monto_total` (**I2**, **I4**): el gasto de esa compra es `$85.000`, no `$98.571`.

**Visibilidad.** Cada compra personal la ve por defecto solo su dueño (`Compra.miembro_id`, **I18**). Ana ve la
suya y la del hogar; Beto ve la suya y la del hogar; ninguno ve la personal del otro.

### 3. Cómo se ven los totales — noviembre 2026

| vista | gasto del hogar | gasto personal visible | gasto mostrado | aportes del mes |
| --- | --- | --- | --- | --- |
| Canónica (interruptor apagado) | Mercado $300.000 | — | $300.000 | Ana $300.000 (100,0 %) · Beto $0 (0,0 %) |
| Dispositivo de Ana, `incluir_personales` prendido | Mercado $300.000 | Ana $85.000 | $385.000 | **igual**: Ana $300.000 · Beto $0 |
| Dispositivo de Beto, `incluir_personales` prendido | Mercado $300.000 | Beto $60.000 | $360.000 | **igual**: Ana $300.000 · Beto $0 |

El interruptor cambia lo que se **muestra**, no lo que se calcula: el gasto del hogar sigue siendo `$300.000` y los
aportes siguen siendo `$300.000` de Ana y `$0` de Beto en las tres vistas.

**Conservación de todos los ámbitos al 2026-11-30** (suma hogar y personales):

```
Σ gasto                     = 300.000 + 85.000 + 60.000 = 445.000
Σ salidas externas          = 300.000 + 85.000 + 60.000 = 445.000   (tres compras de contado desde medios)
Σ saldo de pasivos          = 0
Σ capital saldo_inicial     = 0
Σ saldo_no_usado_desembolso = 0
Σ saldo_a_favor_no_aplicado = 0
445.000 = 445.000 + 0 − 0 − 0 − 0   ✓   (I16)
```

### 4. Lo que NO pasa

- La farmacia de Ana **no** entra al gasto del hogar ni al de Beto: es gasto personal de Ana.
- Ninguna de las dos compras personales es aporte, aunque salgan de medios de miembros: no cubren cargos del hogar
  (**I6**, **I18**).
- `incluir_personales` **no** es una columna sincronizada ni un cambio de datos: es una preferencia del teléfono y
  no altera aportes, gasto del hogar ni saldos.
- Ana **no** ve el cine de Beto ni con el interruptor prendido: la visibilidad por dueño la impone RLS, no la vista.
- El IVA **no** se suma: `$85.000`, nunca `$98.571`.
- Que Ana haya puesto el 100 % del aporte **no** crea ninguna fila "Beto le debe": el aporte es libre (**I7**).

### 5. Invariantes que lo protegen

- **I1** — Todos los montos son enteros: `iva = 13.571` es el redondeo al peso de `13.571,43…`.
- **I2** — Cada compra suma una vez, en su ámbito y su fecha, por `monto_total`; el `iva` no se agrega.
- **I6 / I18** — Una compra personal no es aporte del hogar, ni con `incluir_personales` prendido;
  `ambito='personal'` ⇔ `miembro_id` no nulo.
- **I14** — Todo registro y toda FK quedan dentro del hogar; RLS oculta la compra personal al otro miembro.
- **I16** — La conservación suma hogar y personales y cierra con los tres términos extra en `0`.

### 6. Test de fase 2 (descripción)

- **T-f-1 (gasto por ámbito).** *Given* el hogar base. *When* se registran las tres compras. *Then*
  `totalesDelMes(2026-11)` devuelve `gastoHogar = 300000`, `gastoPersonal(ana) = 85000` y
  `gastoPersonal(beto) = 60000`; y la compra de Ana guarda `iva = 13571` sin alterar `monto_total`.
- **T-f-2 (interruptor de vista).** *Given* el mismo escenario. *When* se prende `incluir_personales` en el
  dispositivo de Ana. *Then* el gasto mostrado es `385000` y los aportes no cambian: Ana `300000`, Beto `0`.
- **T-f-3 (propiedad).** Para cualquier conjunto de compras con ámbitos mezclados, `gasto_hogar` es Σ de las
  `ambito='hogar'`, `gasto_personal(M)` es Σ de las `ambito='personal'` de `M`, `aportes(M)` no depende de
  `incluir_personales` y la conservación de **I16** cierra con los tres términos extra en `0`.

---

## Ejemplo g — préstamo en efectivo gastado en compras del hogar

### 1. Situación

El 2026-11-02 el Banco Andino desembolsa un crédito de consumo de `$2.000.000` a nombre de Ana, a 4 cuotas de
capital de `$500.000`, sin tasa ("Sin tasa" es el default del formulario). Con esa plata se compra una lavadora de
`$1.200.000` el 2026-11-05 y un mercado mayorista de `$300.000` el 2026-11-10; quedan `$500.000` sin gastar. Cada
cuota la paga alguien desde su cuenta: Ana la 1 y la 3, Beto la 2 y la 4, cada una el día de su vencimiento.

### 2. Registros creados

**Lote 1 — alta del préstamo (2026-11-02):** `Pasivo` + `Credito` + `PlanDeCuotas` `desembolso` + 4 `Cuota`.

`Pasivo` / `Credito`

| id | tipo | nombre | owner_tipo | owner_miembro_id | ambito | tasa_tipo | tasa_ppm | entidad | referencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `credito-ana` | credito | Crédito Andino | miembro | `ana` | hogar | null | null | Banco Andino | 001-2026 |

`PlanDeCuotas` (el desembolso se registra **una sola vez**, en la fecha del giro)

| id | pasivo_id | origen | compra_id | fecha_inicio | capital | sistema | n_cuotas | fecha_primera_cuota | tasa_tipo | tasa_ppm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plan-credito` | `credito-ana` | desembolso | null | 2026-11-02 | $2.000.000 | capital_fijo | 4 | 2026-12-02 | null | null |

`Cuota`

| id | plan_id | numero | fecha_vencimiento | capital |
| --- | --- | --- | --- | --- |
| `cuota-c1` | `plan-credito` | 1 | 2026-12-02 | $500.000 |
| `cuota-c2` | `plan-credito` | 2 | 2027-01-02 | $500.000 |
| `cuota-c3` | `plan-credito` | 3 | 2027-02-02 | $500.000 |
| `cuota-c4` | `plan-credito` | 4 | 2027-03-02 | $500.000 |

Ni el desembolso ni su capital son compra, gasto, aporte ni `RecepcionIngreso`: son saldo del pasivo desde el día
del giro. Por eso en noviembre el saldo de `credito-ana` ya es `$2.000.000`, antes de que exista cualquier compra.

**Lotes 2 y 3 — `registrarCompra` (2026-11-05 y 2026-11-10):** `Compra`, sin `PlanDeCuotas`.

| id | fecha | descripcion | monto_total | categoria_id | ambito | pago_tipo | medio_de_pago_id | financiada_por_pasivo_id | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `compra-lavadora` | 2026-11-05 | Lavadora | $1.200.000 | Hogar y electrodomésticos | hogar | contado | null | `credito-ana` | Ana |
| `compra-mercado-may` | 2026-11-10 | Mercado mayorista | $300.000 | Mercado | hogar | contado | null | `credito-ana` | Ana |

Ninguna de las dos crea plan ni suma capital: la plata ya estaba en el plan `desembolso`. El `Pasivo.ambito` de
`credito-ana` fija el ámbito del desembolso (`hogar`). Cada compra indica de dónde salieron los fondos y debe
coincidir con ese ámbito; no lo determina (**I19**).

**Lotes 4 a 7 — `registrarPagoDeDeuda`, uno por cuota** (`tipo='abono'`, capital sin intereses porque no hay tasa):

| id | pasivo_id | cuota_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pago-c1` | `credito-ana` | `cuota-c1` | `cuenta-ana` | $500.000 | 2026-12-02 | null | Ana |
| `pago-c2` | `credito-ana` | `cuota-c2` | `cuenta-beto` | $500.000 | 2027-01-02 | null | Beto |
| `pago-c3` | `credito-ana` | `cuota-c3` | `cuenta-ana` | $500.000 | 2027-02-02 | null | Ana |
| `pago-c4` | `credito-ana` | `cuota-c4` | `cuenta-beto` | $500.000 | 2027-03-02 | null | Beto |

### 3. Cómo se ven los totales

| mes | gasto por categoría | costo financiero | gasto total | aportes por miembro | obligaciones del mes y estado | saldo del pasivo |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11 | Hogar y electrodomésticos $1.200.000 · Mercado $300.000 | — | $1.500.000 | — | — | $2.000.000 |
| 2026-12 | — | — | $0 | Ana $500.000 | cuota 1 $500.000, pagada | $1.500.000 |
| 2027-01 | — | — | $0 | Beto $500.000 | cuota 2 $500.000, pagada | $1.000.000 |
| 2027-02 | — | — | $0 | Ana $500.000 | cuota 3 $500.000, pagada | $500.000 |
| 2027-03 | — | — | $0 | Beto $500.000 | cuota 4 $500.000, pagada | $0 |
| total de la vida | Hogar y electrodomésticos $1.200.000 · Mercado $300.000 | — | $1.500.000 | Ana $1.000.000 (50,0 %) · Beto $1.000.000 (50,0 %) | 4 cuotas pagadas | $0 |

Lectura: el gasto ocurre completo cuando se compra (`$1.500.000`), no cuando se paga el préstamo; los meses
siguientes solo mueven caja. Acá **Σ gasto ≠ Σ aportes**: se devuelven `$2.000.000` porque `$500.000` del
desembolso nunca se gastaron. Lo que cierra es la identidad de conservación.

**Conservación al 2027-03-02** (el préstamo terminó de pagarse):

```
Σ gasto                     = 1.200.000 + 300.000 = 1.500.000
Σ salidas externas          = 500.000 + 500.000 + 500.000 + 500.000 = 2.000.000   (los cuatro pagos)
Σ saldo de pasivos(d)       = 0
Σ capital saldo_inicial     = 0
Σ saldo_no_usado_desembolso = 2.000.000 − 1.500.000 = 500.000
Σ saldo_a_favor_no_aplicado = 0
1.500.000 = 2.000.000 + 0 − 0 − 500.000 − 0   ✓   (I16)
```

El término `saldo_no_usado_desembolso` es exactamente la plata del préstamo que no se gastó: sin él la identidad no
cerraría y el préstamo parecería haber generado gasto.

### 4. Lo que NO pasa

- El desembolso **no** es ingreso, gasto ni aporte: es capital del pasivo y se registra una vez, en la fecha del
  giro.
- La lavadora **no** suma capital otra vez: no tiene plan propio aunque se haya pagado con el préstamo; su
  `pago_tipo` es `contado` con `medio_de_pago_id` nulo y `financiada_por_pasivo_id` seteado (**I3**, **I19**).
- Las compras vinculadas **no** son aporte: la plata no salió de un medio de un miembro (**I6**).
- No se puede gastar más de lo desembolsado: una tercera compra de `$600.000` (acumulado `2.100.000 > 2.000.000`)
  se rechaza, y una compra del 2026-11-01 (anterior al giro) también (**I19**).
- El préstamo **no** mezcla ámbitos: una compra personal vinculada al mismo pasivo se rechaza; si financiara
  compras de ambos ámbitos, se modela como dos pasivos.
- Los pagos **no** son gasto: mueven caja del bolsillo al pasivo y bajan el saldo (**I2**, **I10**).
- El saldo **no** depende de quién pagó: baja igual con el pago de Ana o de Beto (**I10**).

### 5. Invariantes que lo protegen

- **I1** — Capital, cuotas y compras son enteros: `$2.000.000` se reparte en 4 cuotas exactas de `$500.000`.
- **I2** — Las dos compras suman una vez cada una, en su fecha, por `monto_total`.
- **I3** — Las compras son `contado` con exactamente uno de `medio_de_pago_id` / `financiada_por_pasivo_id` y sin
  plan con su `compra_id`; Σ capital de las 4 cuotas = `plan.capital` = `$2.000.000`.
- **I6** — Financiar con el desembolso no es aportar; el aporte aparece cuando Ana o Beto pagan desde su medio.
- **I8** — Un `Credito` es de un miembro (`owner_tipo='miembro'`, `owner_miembro_id='ana'`).
- **I10** — Saldo y estado de cuotas derivados; el enlace `cuota_id` no reasigna.
- **I19** — `financiada_por_pasivo_id` no crea plan ni capital, exige el desembolso previo y que el acumulado no
  supere lo desembolsado; un solo ámbito por plan.
- **I16** — Conservación con el término `saldo_no_usado_desembolso`.
- **I20** — Ningún pago deja el saldo negativo en ninguna fecha histórica.

### 6. Test de fase 2 (descripción)

- **T-g-1 (alta del préstamo).** *Given* el hogar base. *When* se registra el préstamo en efectivo del 2026-11-02
  por `$2.000.000` a 4 cuotas sin tasa. *Then* existe 1 `Pasivo` con su `Credito`, 1 `PlanDeCuotas` con
  `origen='desembolso'`, `capital = 2000000` y `fecha_inicio = 2026-11-02`, y 4 `Cuota` cuyo capital suma
  `2000000`; `totalesDelMes(2026-11)` da gasto `0`, aportes `0` y saldo de `credito-ana` `2000000`; y el alta no
  crea ninguna `Compra`, `Aporte` ni `RecepcionIngreso`.
- **T-g-2 (compras vinculadas).** *Given* el préstamo. *When* se registran las compras de `$1.200.000` y
  `$300.000`. *Then* el gasto de noviembre es `1500000` repartido en las dos categorías, los aportes son `0`, no
  existe ningún `PlanDeCuotas` con esas `compra_id`, el saldo sigue en `2000000` y
  `saldo_no_usado_desembolso(2026-11-30)` = `500000`; una compra de `$600.000` se rechaza (**I19**), una compra del
  2026-11-01 se rechaza y una compra personal vinculada al mismo pasivo se rechaza.
- **T-g-3 (los pagos son el aporte).** *Given* el escenario con las dos compras. *When* se registran los cuatro
  pagos. *Then* diciembre da aporte de Ana `500000`, gasto `0` y saldo `1500000`; enero da aporte de Beto `500000`
  y saldo `1000000`; al final los aportes son Ana `1000000` (50,0 %) y Beto `1000000` (50,0 %) con saldo `0`.
- **T-g-4 (propiedad, I16 con desembolso parcial).** Para cualquier capital desembolsado `L` y cualquier conjunto de
  compras vinculadas con Σ ≤ `L`, en cualquier fecha `d` se cumple `Σ gasto = Σ salidas externas + Σ saldo −
  Σ capital saldo_inicial − Σ saldo_no_usado_desembolso − Σ saldo_a_favor_no_aplicado`, exacto y sin tolerancia,
  incluso antes de terminar de pagar y con `L` gastado en parte.

---

## Ejemplo h — pago duplicado de cuota rechazado

### 1. Situación

Sobre a2. El 2026-12-10 Ana pagó la cuota 1 de la Visa Ana (`$106.235`, Cuenta Ana) y el pago quedó enlazado a
`cuota-1`. A partir de ahí pasan tres cosas distintas:

1. Un **segundo registro de pago**, con otro `id` y otro lote, mismo monto y mismo día, que intenta cubrir la misma
   `cuota-1`.
2. El 2027-01-25, ya pagada la cuota 2, un **pago nuevo** de `$104.157` sin `cuota_id` que dejaría el saldo
   negativo.
3. El **mismo lote** del primer pago, reenviado porque se perdió la respuesta.

### 2. El pago aceptado y el saldo

`PagoDeDeuda` (lote 2 de a2, aceptado)

| id | pasivo_id | cuota_id | medio_de_pago_id | monto | fecha | nota | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pago-1` | `visa-ana` | `cuota-1` | `cuenta-ana` | $106.235 | 2026-12-10 | null | Ana |

`saldo(2026-12-10) = 300.000 (capital) + 6.235 (interés causado) − 106.235 = $200.000`.

### 3. Caso 1 — lo rechaza el único de `cuota_id`, no el saldo

| campo | valor |
| --- | --- |
| id | `pago-1-bis` (registro distinto) |
| pasivo_id | `visa-ana` |
| cuota_id | `cuota-1` |
| medio_de_pago_id | `cuenta-ana` |
| monto | $106.235 |
| fecha | 2026-12-10 |
| saldo si entrara | `200.000 − 106.235 = $93.765` (no negativo) |
| resultado | **rechazado**: "posible pago duplicado" |

El saldo hipotético no sería negativo, así que el guardián de saldo **no** lo habría detenido: lo rechaza el único
parcial `(cuota_id)` de **I20**, porque `cuota-1` ya tiene un pago completo enlazado y dos enlaces completos a la
misma cuota no pueden coexistir. La validación FIFO del mismo lote también falla, porque la cuota declarada ya
estaba cubierta.

Sin `cuota_id`, el mismo monto no supera el saldo causado de `$200.000` y puede aceptarse como adelanto. Una vez
aceptado, el FIFO lo aplicaría a la cuota 2 (`$104.157`) y a `$2.078` de la cuota 3; el saldo a esa fecha quedaría
en `$93.765`. El aviso de posible duplicado de [data-model.md](data-model.md) §3.7.1 es una ayuda, no un rechazo
duro. El FIFO no fija el tope; el caso siguiente muestra un monto que sí lo supera.

### 4. Caso 2 — lo rechaza el guardián de saldo no negativo

Después de `pago-2` (2027-01-10, `$104.157`) el saldo es `300.000 + 10.392 − 210.392 = $100.000`.

| campo | valor |
| --- | --- |
| id | `pago-dup-ene` (registro distinto) |
| pasivo_id | `visa-ana` |
| cuota_id | null |
| medio_de_pago_id | `cuenta-ana` |
| monto | $104.157 |
| fecha | 2027-01-25 |
| saldo si entrara | `100.000 − 104.157 = −$4.157` |
| resultado | **rechazado**: "posible pago duplicado o sobrepago" |

El **25/01 el abono máximo es `$100.000`**, el saldo causado a la fecha (**I20**). La cola FIFO aún tiene
`$102.078` programados, pero los `$2.078` de interés de febrero no se aceptan como abono por encima del tope. No
interviene el único de `cuota_id`. Solo con confirmación explícita se registran dos filas en el mismo lote:
`abono $100.000` (saldo `$0`) y `saldo_a_favor $4.157` (crédito, ni capital ni costo financiero). Sin confirmación
no se registra ninguna de las dos.

El saldo a favor no aplicado **no es aporte**. El 2027-02-10 se causa el interés de la cuota 3 (`$2.078`), que sí cae
sobre ese crédito: ese `$2.078` es aporte del dueño del medio en febrero y quedan `$2.079` sin aplicar.

**Conservación al 2027-02-10, con el saldo a favor:**

```
Σ gasto                     = 300.000 + 6.235 + 4.157 + 2.078 = 312.470
Σ salidas externas          = 106.235 + 104.157 + 100.000 + 4.157 = 314.549
Σ saldo de pasivos          = 300.000 + 12.470 − 210.392 − 100.000 − 2.078 = 0
Σ capital saldo_inicial     = 0
Σ saldo_no_usado_desembolso = 0
Σ saldo_a_favor_no_aplicado = 4.157 − 2.078 = 2.079
312.470 = 314.549 + 0 − 0 − 0 − 2.079   ✓   (I16)
```

### 5. Caso 3 — el reintento idempotente no es un pago nuevo

Si Ana reenvía el lote del primer pago (mismo `lote_id`, mismo `id`, mismo `base_seq`) y sigue siendo miembro
activo del hogar, recibe el resultado guardado en `lote_aplicado` sin volver a evaluar `base_seq` (**I13**): queda
un solo `PagoDeDeuda`, el saldo no se mueve y no aparece ningún aviso de duplicado. Un pago nuevo, en otro lote y
con otro `id`, sí pasa por el único de `cuota_id` y el guardián de saldo.

Dos pagos offline de la misma cuota se serializan igual: `sync_push` bloquea el pasivo y recalcula con las filas
del lote y las ya confirmadas. Si el segundo excede el tope, lo rechaza; el exceso solo se registra como
`saldo_a_favor` con confirmación explícita (**I20**).

### 6. Invariantes que lo protegen

- **I10** — Estado de cuota y saldo derivados; el enlace `cuota_id` no reasigna pagos.
- **I13** — El autor activo puede reenviar el mismo lote sin duplicarlo: la idempotencia es por hogar, autor y
  `lote_id`, no por monto ni por fecha.
- **I16** — La conservación resta el saldo a favor no aplicado.
- **I6** — El saldo a favor no aplicado no es aporte; cuando cubre un cargo del hogar, el monto aplicado sí lo es.
- **I20** — Saldo nunca negativo; abono hasta el saldo causado a la fecha del pago; `cuota_id` solo en pago
  completo y único por cuota. El exceso solo va como `saldo_a_favor` con confirmación explícita.

### 7. Test de fase 2 (descripción)

- **T-h-1 (doble enlace).** *Given* a2 con `pago-1` enlazado a `cuota-1`. *When* llega `pago-1-bis` por `106235`
  con `cuota_id='cuota-1'`. *Then* la escritura se rechaza con aviso de posible duplicado, no se crea ningún
  `PagoDeDeuda` y el saldo sigue en `200000`.
- **T-h-2 (tope y sobrepago).** *Given* el saldo causado de `100000` al 2027-01-25, con interés futuro de `2078`.
  *When* se intenta un `abono` en escenarios independientes. *Then* `100000` se acepta y deja saldo `0`; `100001`,
  `102078` y `104157` se rechazan con aviso de posible pago duplicado o sobrepago y sin crear pagos. Solo al
  confirmar la división de `104157` se registran en el mismo lote `100000` de `abono` y `4157` de `saldo_a_favor`;
  el saldo queda en `0` y el aporte del mes no incluye el crédito no aplicado.
- **T-h-3 (idempotencia).** *Given* el lote del primer pago. *When* Ana, su autora y miembro activo, lo reenvía dos
  veces con el mismo `lote_id`. *Then* existe un solo `PagoDeDeuda`, la respuesta es la misma y no hay aviso de duplicado.
- **T-h-4 (propiedad).** Para cualquier secuencia de pagos sobre un pasivo, ningún saldo histórico es negativo,
  ningún `abono` supera el saldo causado a su fecha antes de aplicarlo y nunca coexisten dos enlaces completos a
  la misma cuota.

---

## Ejemplo i — ingreso fijo recibido por un monto distinto

### 1. Situación

Sobre d. El 2026-11-30 Ana recibe su salario de noviembre, pero llega `$4.300.000` en lugar de los `$4.500.000`
declarados. Beto recibe el suyo completo el 2026-11-15. Los dos recibos son del mismo mes del periodo
(`periodo = '2026-11'` con `fecha_recepcion` en noviembre). Diciembre no tiene ningún recibo registrado.

### 2. Registros creados

`RecepcionIngreso`

| id | ingreso_id | serie_id | periodo | recibido | monto_recibido | fecha_recepcion | registrado_por |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rec-ana-nov` | `ing-ana-fijo` | `ing-ana-fijo` | 2026-11 | true | $4.300.000 | 2026-11-30 | Ana |
| `rec-beto-nov` | `ing-beto-fijo` | `ing-beto-fijo` | 2026-11 | true | null | 2026-11-15 | Beto |

`monto_recibido = null` con `recibido = true` significa "llegó el monto esperado". `Ingreso.monto` **no** cambia:
Ana sigue declarando `$4.500.000`. El recibo del periodo es un hecho aparte, no una edición del salario (**I22**).

### 3. Cómo se ven los totales — noviembre 2026

El gasto y los aportes son los mismos de d: el recibo no toca ninguno de los dos.

| miembro | aporte | % del total | ingreso del mes | estado del fijo | % de su ingreso |
| --- | --- | --- | --- | --- | --- |
| Ana | $1.700.000 | 56,7 % | $4.300.000 | recibido | 39,5 % |
| Beto | $1.300.000 | 43,3 % | $3.500.000 ($2.000.000 fijo + $1.500.000 variable) | recibido | 37,1 % |
| total | $3.000.000 | 100,0 % | $7.800.000 | — | 38,5 % |

Comparado con d, donde los dos fijos llegaron completos: el ingreso de Ana pasa de `$4.500.000` a `$4.300.000` y su
"% de su ingreso" de `37,8 %` a `39,5 %`; el de Beto no cambia (`37,1 %`); el total pasa de `37,5 %` a `38,5 %`. El
aporte de cada uno y el gasto del mes quedan idénticos.

`1.700.000 / 4.300.000 = 39,5348… %` se muestra como `39,5 %`: un decimal, y solo al mostrarse. La columna "% de su
ingreso" es además **opcional**: `Hogar.mostrar_pct_ingreso` viene apagado por defecto, así que el balance muestra
pesos y % del total aportado, y recién con el interruptor prendido agrega el % sobre el ingreso individual. El "% del
total" no depende del interruptor.

### 4. Diciembre 2026

Sin `RecepcionIngreso` de `2026-12`, el estado de los dos fijos es **esperado** y el ingreso del mes vuelve a los
montos declarados: Ana `$4.500.000` y Beto `$2.000.000` (sin freelance). Un periodo puede pasar de "esperado" a
"recibido" más tarde sin reescribir nada: se agrega la fila del periodo.

Si el recibo de Ana llegara el 2026-12-02 con `periodo = '2026-11'`, el ingreso de **noviembre** sería `$4.300.000` y
el de diciembre no cambiaría: manda el `periodo`, igual que en la agenda de obligaciones (§8 de
[data-model.md](data-model.md)). La `fecha_recepcion` es informativa.

### 5. Lo que NO pasa

- El recibo **no** crea un `Ingreso` nuevo ni cambia `Ingreso.monto`.
- El monto recibido **no** entra al gasto ni a los aportes: solo es el denominador de "% de su ingreso".
- El "% de su ingreso" **no** se guarda: `39,5 %` se recalcula de `1.700.000 / 4.300.000` cada vez.
- La ausencia de fila **no** es un error: es el estado "esperado".
- Un segundo recibo del mismo `(serie_id, periodo)` **no** puede existir, aunque la serie tenga dos versiones ese
  mes (**I22**).
- Un recibo **no** se admite sobre un ingreso `tipo='variable'`: el freelance ya trae su `fecha` en el `Ingreso`.
- `recibido = false` con `monto_recibido` cargado **no** es válido: los dos campos van juntos o ninguno (CHECK de
  [data-model.md](data-model.md) §3.3.1).

### 6. Invariantes que lo protegen

- **I1** — `$4.300.000` es entero; ningún porcentaje se guarda como monto.
- **I6** — Los aportes no cambian por un recibo: el ingreso nunca es aporte.
- **I7** — El balance sigue sin fila de deuda: el recibo no crea obligaciones entre miembros.
- **I12** — `periodo` es `'YYYY-MM'` de fecha civil: el mes del recibo no depende de un `timestamptz`.
- **I22** — Único `(serie_id, periodo)`; el balance usa `monto_recibido` si `recibido = true` y el monto declarado
  si no.

### 7. Test de fase 2 (descripción)

- **T-i-1 (recibido distinto).** *Given* d con el recibo de Ana del periodo `2026-11` por `4300000`. *Then* el
  ingreso del mes de Ana es `4300000`, el estado de su fijo muestra "recibido", el % de su ingreso es `39,5 %` y
  `Ingreso.monto` sigue en `4500000`.
- **T-i-2 (esperado).** *Given* el mismo escenario sin la fila de Ana. *Then* el ingreso del mes de Ana es
  `4500000`, el estado es "esperado" y el % es `37,8 %`; para `2026-12` los dos fijos están "esperado" con
  `4500000` y `2000000`.
- **T-i-3 (rechazos).** *When* se intenta un segundo recibo del mismo `(serie_id, periodo)`, un recibo sobre un
  ingreso variable o un `recibido = false` con `monto_recibido` cargado. *Then* los tres se rechazan.
- **T-i-4 (propiedad).** Para cualquier ingreso fijo y cualquier `monto_recibido > 0`: el ingreso del mes es
  `monto_recibido` cuando `recibido = true` y el monto declarado cuando no hay fila o `recibido = false`; los aportes
  del mes no cambian; y el % se calcula a un decimal solo si `mostrar_pct_ingreso` está prendido.

---

## Ejemplo i bis — cambio de monto y de día a mitad de mes

### 1. Situación

Variante de d. Ana cambia su salario el 2026-11-16: el monto pasa de `$4.500.000` a `$4.700.000` y el día de
pago del 10 al 20. La serie se modela con dos versiones contiguas, no con filas sueltas. Noviembre debe aportar
**un solo sueldo**: `$4.500.000`, el de la versión vigente el día 1. Diciembre ya usa `$4.700.000`.

### 2. Registros creados

`Ingreso` (misma serie, dos versiones con vigencias inclusivas y contiguas)

| id | serie_id | miembro_id | tipo | descripcion | monto | dia_esperado | vigente_desde | vigente_hasta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ing-ana-fijo` | `ing-ana-fijo` | `ana` | fijo | Salario | $4.500.000 | 10 | 2026-01-01 | 2026-11-15 |
| `ing-ana-v2` | `ing-ana-fijo` | `ana` | fijo | Salario | $4.700.000 | 20 | 2026-11-16 | null |

`2026-11-15 + 1 día = 2026-11-16`: no hay solape ni hueco y una sola versión queda abierta ([data-model.md](data-model.md) §3.3).

### 3. Qué importe aporta cada mes

| mes | versión aplicable | esperado | recibo del periodo | ingreso del mes | por qué |
| --- | --- | --- | --- | --- | --- |
| 2026-10 | `ing-ana-fijo` | $4.500.000 | no | $4.500.000 | el día 1 de octubre cae en esa versión |
| 2026-11 | `ing-ana-fijo` | $4.500.000 | no | $4.500.000 | el día 1 de noviembre cae en la versión vieja: el cambio rige desde diciembre |
| 2026-11 (con recibo) | `ing-ana-fijo` | $4.500.000 | `rec-ana-nov`, `$4.700.000` | **$4.700.000** | el recibo manda sobre el esperado |
| 2026-12 | `ing-ana-v2` | $4.700.000 | no | $4.700.000 | el día 1 de diciembre ya cae en la versión nueva |

Con el recibo de `$4.700.000`, el "% de su ingreso" de Ana en noviembre es `1.700.000 / 4.700.000 = 36,2 %`; los
aportes y el gasto de d no cambian.

### 3 bis. Los dos contraejemplos de la revisión

La regla anterior sumaba cada fila cuya **propia** fecha esperada caía dentro de su vigencia. Con vigencias 1–15 y
16–30 de noviembre eso da dos sueldos o ninguno, según el orden de los días:

| orden de días | versión 1–15 | versión 16–30 | regla anterior (fecha esperada propia) | regla vigente (día 1) |
| --- | --- | --- | --- | --- |
| 10 → 20 | día 10, `$4.500.000` | día 20, `$4.700.000` | **dos** sueldos: `$9.200.000` | **un** sueldo: `$4.500.000` |
| 20 → 10 | día 20, `$4.500.000` | día 10, `$4.700.000` | **ninguno**: `$0` | **un** sueldo: `$4.500.000` |

Con la regla vigente el resultado es el mismo en los dos órdenes: la serie aporta una sola vez por mes y el día de
pago no interviene en la selección (**I24**).

### 3 ter. Serie que arranca a mitad de mes

Un ingreso fijo nuevo de Ana, serie `ing-ana-arriendo`, arranca el 2026-11-20 con `$3.000.000` y día esperado 5, sin
versión anterior en la serie.

| mes | versión aplicable | ingreso del mes | por qué |
| --- | --- | --- | --- |
| 2026-10 | ninguna | $0 | la serie todavía no existía |
| 2026-11 | la vigente el 2026-11-30 | $3.000.000 | no hay versión para el día 1: aplica la del último día |
| 2026-12 | la misma (abierta) | $3.000.000 | el día 1 de diciembre ya cae en ella |

Si esa misma serie se cierra el 2026-11-25 sin versión siguiente, el extremo efectivo de su última versión para
seleccionar es el 2026-11-30, aunque su cierre guardado siga siendo el día 25:

| mes | versión aplicable | sin recibo | con recibo de noviembre por $3.200.000 |
| --- | --- | --- | --- |
| 2026-11 | una, la última versión | $3.000.000 | $3.200.000 (aceptado; sustituye al esperado) |
| 2026-12 | ninguna | $0 | $0 (noviembre no se arrastra; un recibo de diciembre se rechaza) |

### 4. Lo que NO pasa

- El cambio de monto **no** crea un ingreso nuevo: crea otra versión de la misma serie (`serie_id` estable).
- El cambio de día **no** adelanta ni duplica el sueldo de noviembre: el día de pago no decide el mes.
- Un recibo **no** se duplica por tener dos versiones: el único es `(serie_id, periodo)`, no `(ingreso_id, periodo)`.
- Un mes anterior al inicio de la serie **no** se estima ni se prorratea: aporta `0`.
- El cierre a mitad de mes **no** borra el mes en curso: el día 1 ya estaba cubierto, o si la serie arrancó después
  del día 1 de ese mismo mes, la última versión se extiende hasta fin de mes solo para la selección.

### 5. Invariantes que lo protegen

- **I1** — Los montos son enteros; el ingreso no se prorratea por días.
- **I12** — El mes es calendario civil en `America/Bogota`; el día 1 y el último día salen de la fecha civil.
- **I22** — Un solo `RecepcionIngreso` por `(serie, periodo)`; el balance usa `monto_recibido` si `recibido=true`.
- **I24** — Vigencias inclusivas y contiguas; exactamente un importe por serie y mes calendario.

### 6. Test de fase 2 (descripción)

- **T-i-5 (los dos contraejemplos).** *Given* una serie con vigencias 1–15 y 16–30 de noviembre. *When* se piden
  los ingresos fijos de noviembre para días 10→20 y para días 20→10. *Then* en los dos casos el ingreso es
  `4500000`, exactamente una versión aplicable y el total del hogar no suma dos veces.
- **T-i-6 (arranque a mitad de mes y cierre terminal en el mismo mes).** *Given* una serie que arranca el
  2026-11-20. *Then* octubre da `0` y noviembre da el monto de la versión vigente el 2026-11-30. *Given además* una
  serie que arranca el 2026-11-20 y se cierra el 2026-11-25, sin versión siguiente. *Then* noviembre da **un solo**
  importe de `3000000` sin recibo; al registrar un recibo de noviembre por `3200000`, lo acepta y devuelve
  solo ese importe. Diciembre da `0` y no admite recibo. Una serie que arranca en octubre y se cierra el 2026-11-25
  sigue dando noviembre con su importe, sin aplicar la regla del cierre en el mismo mes.
- **T-i-7 (recibo: precedencia, mes activo y unicidad entre versiones).** *Given* la serie con dos versiones en
  noviembre. *When* se registra un recibo de `2026-11` por `4700000` apuntando a la versión vieja y luego otro para
  la nueva con el mismo periodo. *Then* el primero deja el ingreso de noviembre en `4700000` y el segundo se rechaza
  por el único parcial `(serie_id, periodo)`. *Then además* ese recibo no cambia la versión aplicable (sigue siendo
  la vigente el día 1) ni el mes: diciembre sigue con el esperado de la nueva versión. *And* se rechazan: un recibo
  con `serie_id` distinto al de la versión referenciada (la FK compuesta `(ingreso_id, serie_id)` no lo permite), un
  recibo sobre una versión `tipo='variable'`, y un recibo con `periodo='2026-10'` o `'2027-01'` cuando la serie no
  tiene versión aplicable en ese mes.
- **T-i-8 (propiedad).** Para cualquier serie con vigencias contiguas y cualquier mes: la cardinalidad de
  `version(serie, mes)` es `0` o `1`; si es `1`, el importe del mes es el del recibo o el esperado, nunca la suma de
  dos versiones (**I24**).

---

## Ejemplo j — lote solo personal: sin señal en el canal del hogar

### 1. Situación

Ana y Beto están sincronizados. Estado inicial: `hogar_seq = 40`, el cursor del hogar de Beto es
`siguiente_seq = 40` y el carril personal de Ana tiene `personal_seq(ana) = 6`. Ana registra, en este orden, dos
compras del hogar, un lote **exclusivamente personal** (una compra personal y su `NivelDespensa`, en la misma
transacción) y una compra del hogar más. Beto está suscrito al canal del hogar.

### 2. Qué asigna cada lote

| # | lote de Ana | filas | `hogar_seq` | `personal_seq(ana)` | ¿aviso al canal del hogar? |
| --- | --- | --- | --- | --- | --- |
| 1 | `compra-hogar-1` | 1 del hogar | 41 | 6 | sí: `41` |
| 2 | `compra-hogar-2` | 1 del hogar | 42 | 6 | sí: `42` |
| 3 | `compra-personal-ana` + `NivelDespensa` | 2 personales | **42 (no cambia)** | 8 | **no** |
| 4 | `compra-hogar-3` | 1 del hogar | 43 | 8 | sí: `43` |

La numeración del hogar queda `41, 42, 43`: contigua y sin saltos por el lote 3. El lote 3 solo movió el carril
privado de Ana (`6 → 8`) y, al no tocar filas del hogar, **nunca** bloqueó `hogar_seq` (el pre-lock de
[architecture.md](architecture.md) §5.2 solo toma los carriles tocados).

### 3. Pull de Beto con `limite = 1` (truncado)

| paso | `desde_seq` | agua `H` | filas devueltas | `siguiente_seq` |
| --- | --- | --- | --- | --- |
| 1 | 40 | 43 | `41` | 41 |
| 2 | 41 | 43 | `42` | 42 |
| 3 | 42 | 43 | `43` | 43 |
| 4 | 43 | 43 | — (vacío) | 43 |

Beto recibe `41`, `42` y `43` exactamente una vez y **nunca** la personal de Ana. No hay salto observable: el agua
`H = 43` no es el cursor, así que el paso truncado devuelve `siguiente_seq = 41`, no `43`. Si el cursor saltara al
agua en el paso 1, Beto perdería `42` y `43`.

### 3 bis. Pull de Ana por su carril personal, `limite = 1`

| paso | `desde_seq` | agua `H` | filas devueltas | `siguiente_seq` |
| --- | --- | --- | --- | --- |
| 1 | 6 | 8 | `7` | 7 |
| 2 | 7 | 8 | `8` | 8 |
| 3 | 8 | 8 | — (vacío) | 8 |

El carril agotado devuelve cero filas con `siguiente_seq = H = 8`: no se atasca y no adelanta de más. Un segundo
pull vacío repite `0` filas y `8`.

### 4. Lo que NO pasa

- El lote 3 **no** mueve `hogar_seq` (de `42` a `43` no hay `44` por medio) ni deja hueco en la numeración.
- El lote 3 **no** emite aviso en el canal del hogar: Beto no puede inferir que existió.
- Un pull truncado **no** guarda el agua como cursor; un pull vacío **no** atasca el carril.
- La fila personal de Ana **no** aparece en el pull del hogar de Beto.
- La numeración personal **no** se mezcla con la del hogar: `seq` solo se compara dentro de su carril.

### 5. Invariante que lo protege

- **I25** — Un lote exclusivamente personal no mueve `hogar_seq`, no emite aviso compartido y no deja saltos; hay un
  cursor por carril, `ultimo_seq` es el agua del snapshot y `siguiente_seq` es el cursor de reanudación.

### 6. Test de fase 2 (descripción)

- **T-j-1 (lote solo personal).** *Given* Ana y Beto con `hogar_seq = 40`, `personal_seq(ana) = 6` y el cursor del
  hogar de Beto en `40`. *When* Ana escribe los lotes 1–4. *Then* `hogar_seq` termina en `43` y no cambió por el
  lote 3; Beto recibe **3** avisos del hogar (`41`, `42`, `43`) y **0** por el lote 3; su pull devuelve las filas
  `41–43` y ninguna personal; el estado del hogar de Beto es idéntico al de un escenario sin el lote 3;
  `personal_seq(ana)` termina en `8` y solo Ana ve esas dos filas.
- **T-j-2 (paginación truncada, incluido vacío).** *Given* el mismo estado con agua `H = 43`. *When* Beto hace pull
  con `limite = 1` desde `40`. *Then* las páginas devuelven `41`, `42` y `43` exactamente una vez, con
  `siguiente_seq` `41`, `42` y `43`; la cuarta página devuelve `0` filas con `siguiente_seq = 43`; la unión es
  `[41, 42, 43]` sin huecos ni repetidos y ninguna página guarda el agua con filas pendientes. *And* el mismo test
  con el carril vacío (`desde_seq = 43`) devuelve `siguiente_seq = 43` y no atasca.
- **T-j-3 (reintento sin señal).** *Given* el lote 3, solo personal de Ana, ya aplicado. *When* Beto, miembro activo
  del mismo hogar, reenvía ese lote con su `lote_id` o con un ID desconocido, sin cambiar el resto del lote. *Then*
  ambas respuestas tienen el mismo estado y cuerpo de `no_autorizado`: sin resultado guardado, datos ni indicio
  de que ese ID existe. Ningún intento cambia filas, contadores o cursores ni emite avisos. *And* Ana, mientras es
  miembro activo, obtiene su resultado sin reescrituras; si deja de serlo, su reintento y el de un ID desconocido
  devuelven el mismo rechazo sin resultado.

---

## Resumen

| ejemplo | qué demuestra | invariantes | test de fase 2 |
| --- | --- | --- | --- |
| a1 | compra financiada sin tasa: consumo una vez, cuotas son pagos | I1, I2, I3, I6, I7, I10, I13 | T-a1-1, T-a1-2, T-a1-3 (propiedad) |
| a2 | tasa E.A. → M.V., interés como costo financiero aparte | I2, I3, I4, I5, I6, I10 | T-a2-1, T-a2-2, T-a2-3 (conservación) |
| b | deuda del hogar pagada por ambos, sin deuda entre miembros | I2, I3, I6, I7, I8, I10, I14 | T-b-1, T-b-2, T-b-3 |
| c | un miembro paga la tarjeta del otro: cambia el aporte, no el gasto | I2, I4, I6, I7, I9, I10 | T-c-1, T-c-2 (propiedad) |
| d | ingresos fijos vs variables, balance de pareja sin "debe" | I1, I2, I6, I7, I11, I17 | T-d-1, T-d-2, T-d-3 (identidad de aportes) |
| e | despensa recurrente, nivel observado y derivado, variante con tarjeta | I2, I3, I6, I10, I15, I21, I26 | T-e-1, T-e-2, T-e-3, T-e-4, T-e-5, T-e-6 (propiedad, reset y alcance) |
| f | compra personal vs del hogar: el gasto se separa por ámbito y el aporte no cambia | I1, I2, I6, I7, I14, I16, I18 | T-f-1, T-f-2, T-f-3 (propiedad) |
| g | préstamo en efectivo: desembolso una vez en el giro, compras vinculadas sin capital y aporte al pagar | I1, I2, I3, I6, I8, I10, I16, I19, I20 | T-g-1, T-g-2, T-g-3, T-g-4 (conservación) |
| h | pago duplicado rechazado: único de cuota, saldo no negativo y reintento idempotente | I6, I10, I13, I16, I20 | T-h-1, T-h-2, T-h-3, T-h-4 (propiedad) |
| i | ingreso fijo recibido por un monto distinto: cambia el denominador, no los aportes | I1, I6, I7, I12, I22 | T-i-1, T-i-2, T-i-3, T-i-4 (propiedad) |
| i bis | cambio de monto y de día a mitad de mes: un solo importe por serie y mes calendario | I1, I12, I22, I24 | T-i-5, T-i-6, T-i-7, T-i-8 (propiedad y unicidad) |
| j | lote solo personal: carriles, cursores y avisos aislados; pull truncado sin saltos; reintento sin señal | I13, I25 | T-j-1, T-j-2, T-j-3 |

Los property-based tests de a1, a2, c, d, e, f, g, h e i cubren la identidad de conservación **I16** desde ángulos
distintos: sin tasa, con tasa, con pagos parciales, con salidas del fondo común, con compras personales, con un
préstamo gastado solo en parte y con un saldo a favor no aplicado; h agrega la propiedad de que ningún saldo
histórico es negativo. Todos se prueban a través de la interfaz pública del dominio (casos de uso + funciones de
totales), nunca leyendo la base de datos.

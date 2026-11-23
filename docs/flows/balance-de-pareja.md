# Flujo: Balance de pareja

> **Contrato de datos:** las entidades, campos e invariantes de este flujo siguen `docs/data-model.md`, que llega en el PR #2.

Mostrar de forma transparente cuánto aportó cada `Miembro` al hogar durante el **mes calendario** (`1` al último día del mes, fecha civil `America/Bogota`) junto con sus `Ingreso` fijos y variables, bajo el principio estricto de **aporte libre**: la app informa con totales **DERIVADOS**, nunca guarda resúmenes y nunca calcula ni insinúa que un miembro le debe dinero a otro.

## Objetivo

- Dar visibilidad clara del aporte real de cada persona al hogar (`$` enteros COP y `%` del total del hogar con **un decimal**, ej. `58,0 %`), incluyendo las **transferencias al fondo común (`Aporte`)**.
- Mantener la vista **`% de su ingreso` APAGADA por defecto** (`Hogar.mostrar_pct_ingreso = false`) con un interruptor para activarla cuando el hogar lo desee.
- Excluir las compras personales (`Compra.ambito = 'personal'`) del balance del hogar por defecto, con interruptor local `incluir_personales` apagado.
- Permitir confirmar ingresos fijos con **`Marcar recibido`** (`RecepcionIngreso`), aceptando un `monto_recibido` distinto al monto base cuando corresponda, y manteniendo visibles los ingresos de ambos miembros.
- Eliminar fricción emocional: **nunca** mostrar textos como *"X le debe a Y"*, *"diferencia para empatar 50/50"* ni saldos entre miembros.

## Pantallas

| Pantalla | Propósito | Mockup |
| --- | --- | --- |
| **Balance de pareja** | Resumen por **mes calendario** de aporte libre (pesos y `%` con 1 decimal), interruptores `Mostrar % de su ingreso` (apagado por defecto) e `Incluir personales` (apagado por defecto), acción `Transferir al fondo común`, desglose de ingresos fijos (con `Marcar recibido`) vs variables y acceso a Ajustes/exportación. | [balance-de-pareja.html](../../design/mockups/balance-de-pareja.html) |
| **Transferir al fondo común** | Registrar una entidad `Aporte` desde un `MedioDePago` de un `Miembro` hacia un `MedioDePago` del `Hogar` (cuenta común o caja común), sin contarla como consumo. | [transferir-fondo-comun.html](../../design/mockups/transferir-fondo-comun.html) |
| **Registrar ingreso** | Alta de `Ingreso` fijo (`serie_id`, `dia_esperado`, `vigente_desde`) o variable (`fecha`) para un miembro del hogar. | [registrar-ingreso.html](../../design/mockups/registrar-ingreso.html) |
| **Ajustes y exportación** | Estado de la exportación automática semanal (`1 + N` archivos ZIP en Storage: uno del hogar y uno personal por miembro activo), exactamente dos descargas ZIP por miembro («Hogar (compartido)» y «Mis personales», cada ZIP con JSON + CSV de su alcance), botón `Exportar ahora` y estado de la copia local en IndexedDB. | [ajustes-exportar.html](../../design/mockups/ajustes-exportar.html) |

## Flujo paso a paso

### 1. Consultar el balance del mes calendario

1. El usuario toca **Balance** en la barra de navegación inferior.
2. En la cabecera selecciona o confirma el **mes calendario** activo (`Noviembre 2026 · 1–30 nov`, navegación `< Mes anterior` / `Mes siguiente >`).
3. El bloque **Aportes del mes al hogar** (todo **DERIVADO** en el dispositivo, nunca guardado) suma exactamente las 4 fuentes de aporte por miembro `M` (alineado con §8 de `docs/data-model.md`):
   - `Compra` de contado con `ambito = 'hogar'` desde cualquier `MedioDePago` de `M` (excluye compras personales y compras con `financiada_por_pasivo_id`).
   - **`PagoDeDeuda` desde cualquier `MedioDePago` de `M` según el ámbito único del `Pasivo` (`Pasivo.ambito`):**
     - Cada `Pasivo` tiene un único ámbito (`'hogar'` o `'personal'`, inmutable con hechos vinculados): todo `PagoDeDeuda(tipo = 'abono')` a un `Pasivo` con `ambito = 'hogar'` aporta **completo** a `M` (sin importar quién sea el titular del pasivo ni la cuenta personal de `M` usada); todo abono a un `Pasivo` con `ambito = 'personal'` aporta **`$0`**. El reparto FIFO solo asigna el abono a cuotas y cargos de ese libro, **nunca** decide el aporte.
     - `PagoDeDeuda(tipo = 'saldo_a_favor')` en un `Pasivo` con `ambito = 'hogar'` no aporta mientras no cubra un cargo; cuando se aplica a un cargo posterior del hogar, el monto aplicado suma como aporte de `M` en el mes de ese cargo (en un pasivo personal nunca aporta).
   - `CostoFinanciero` con `ambito = 'hogar'` pagado directo desde un `MedioDePago` de `M`.
   - **`Aporte`** (transferencias desde un `MedioDePago` de `M` hacia un `MedioDePago` del `Hogar`, ej. cuenta común).
   - *(Nota: lo que sale luego desde un `MedioDePago` del hogar son "salidas del fondo común", informativas, y no vuelven a sumarse como aporte de nadie).*
4. Muestra el resumen con **porcentajes a un decimal**:
   - **Total aportado en el mes:** `$3.600.000`.
   - **Santiago:** `$2.088.000` · **`58,0 %`** del total (incluye arriendo `$1.800.000`, cuota Mastercard ••8834 [ámbito Hogar · titular Camila] `$234.500` y transferencia al fondo común `$53.500`).
   - **Camila:** `$1.512.000` · **`42,0 %`** del total (incluye transferencia al fondo común `$500.000`, servicios EPM `$285.000`, compras de mascotas `$245.000` y compras diarias del hogar `$482.000`).
   - Nota permanente de **Aporte libre**: *"Cada quien aporta lo que quiere o puede. Nunca se generan saldos ni deudas entre ustedes."*
5. **Controles de vista (ambos APAGADOS por defecto):**
   - **Interruptor `Mostrar % de su ingreso` (`Hogar.mostrar_pct_ingreso`, default `false`):** apagado por defecto para evitar comparaciones innecesarias. Al encenderlo muestra `40,9 %` de sus ingresos para Santiago (`$2.088.000 / $5.100.000`) y `35,6 %` para Camila (`$1.512.000 / $4.250.000`).
   - **Interruptor `Incluir mis gastos personales` (`incluir_personales`, preferencia local, default `false`):** apagado por defecto; los gastos con `Compra.ambito = 'personal'` quedan excluidos del balance del hogar y nunca cuentan como aporte.
6. **Bloque `Ingresos del mes` (visible para ambos miembros):**
   - Muestra todas las series de `Ingreso` fijo activas en el mes y los `Ingreso` variables de ambos miembros del hogar (`$9.350.000`: fijos `$8.300.000 · 88,8 %`, variables `$1.050.000 · 11,2 %`).
   - **Selección por serie y mes calendario (`version(serie, mes)`, I24):** cada serie de ingreso fijo (`serie_id` estable) aporta **exactamente un importe por mes calendario activo** (`$0` en meses anteriores al inicio de la serie o posteriores a su cierre). El mes lo decide **el día 1**, nunca `dia_esperado` (si la serie ya existía el día 1, aplica la versión vigente el día 1; un cambio de monto o día a mitad de mes rige desde el mes siguiente). Si la serie **arranca a mitad de mes**, no hay versión para el día 1 y aplica la versión vigente el **último día del mes**. Un cierre a mitad de mes en un mes posterior al del arranque no borra el mes en curso porque el día 1 ya estaba cubierto. Si la serie **arranca y se cierra en el mismo mes** —cierre terminal, sin versión siguiente (ej. `20–25/11` por `$3.000.000`)—, el **extremo efectivo** de la última versión reemplaza su `vigente_hasta` real por el **último día civil de ese mes** solo para seleccionar (`30/11`): así noviembre tiene exactamente una versión aplicable (un solo importe: `$3.000.000` esperado, o el recibo de noviembre si existe, ej. `$3.200.000`) y diciembre aporta **`$0`** (sin versión aplicable y sin admitir recibo).
   - Para cada serie activa en el periodo `'YYYY-MM'` (`version(serie, periodo) != null`), busca y registra el recibo `RecepcionIngreso` por **`(serie_id, periodo)`** —**no** por fila de versión (`ingreso_id`)—:
     - Si existe recibo con `recibido = true`: muestra `✓ Recibido` y el recibo gana **primero** sobre el esperado (`COALESCE(recibo.monto_recibido, esperado(serie, mes))`), solo sobre el importe (nunca cambia la versión aplicable, el mes ni `Ingreso.monto`; si `monto_recibido` difiere del esperado, muestra ambos con claridad: ej. *esperado `$3.750.000`, recibido `$3.800.000`*).
     - Si no existe `RecepcionIngreso` o `recibido = false` (ej. `Salario Santiago · día 30` estando a 22 nov): usa `esperado(serie, mes)`, muestra `◷ Esperado día 30` y la acción inline **`Marcar recibido`**, donde el usuario confirma `fecha_recepcion` y puede editar `monto_recibido` si llegó un valor distinto ese mes (registrando el recibo único por `(serie_id, periodo)`).

### 2. Transferir al fondo común (`Aporte`)

1. Desde **Balance de pareja**, el usuario toca **`Transferir al fondo común`**.
2. Se abre [transferir-fondo-comun.html](../../design/mockups/transferir-fondo-comun.html):
   - Selecciona **`MedioDePago` de origen** (solo medios con `owner_tipo = 'miembro'`, ej. `Nequi · Camila`).
   - Selecciona **`MedioDePago` de destino** (solo medios con `owner_tipo = 'hogar'`, ej. `Cuenta común del hogar`).
   - Ingresa `monto` en COP enteros (ej. `$500.000`), `fecha` civil (`2026-11-22`) y `nota` opcional.
3. Toca **`Registrar transferencia ($500.000)`**.
4. La app crea un registro **`Aporte`** (el aportante se deriva del dueño de `medio_origen_id`, nunca de quién digitó): suma al aporte de ese miembro en *Balance de pareja* y **no** suma al consumo ni a pagos de deuda.

### 3. Registrar un ingreso (`Ingreso`)

1. Desde **Balance de pareja**, el usuario toca **`+ Ingreso`** / **`+ Registrar ingreso`**.
2. Selecciona `miembro_id` (`Santiago` o `Camila`) y `tipo`:
   - **`fijo`:** habilita `dia_esperado` (`1..31`), `vigente_desde` (crea una serie con `serie_id` estable) y opción de crear inmediatamente `RecepcionIngreso` por `(serie_id, periodo)` para el mes activo si ya llegó (incluso con `monto_recibido` distinto).
   - **`variable`:** habilita `fecha` (`Hoy` por defecto) y no exige recurrencia.
3. Ingresa `descripcion` y `monto` entero en COP y toca **`Guardar ingreso`**.

### 4. Exportación automática y respaldo (Ajustes)

1. Desde **Ajustes y exportación** ([ajustes-exportar.html](../../design/mockups/ajustes-exportar.html)), el usuario ve la **última exportación automática semanal** (la función programada genera **`1 + N` archivos ZIP en Storage**: uno del hogar compartido y uno personal por cada miembro activo), sus **exactamente dos descargas ZIP separadas** —**«Hogar (compartido)»** y **«Mis personales»**—, el botón **`Exportar ahora`** y el estado de la **copia local en IndexedDB** del dispositivo.
2. **Dos descargas ZIP separadas por miembro (nunca mezcladas):** aunque Storage almacena `1 + N` archivos por ciclo semanal (para 2 miembros activos: 1 del hogar + 2 personales = 3 archivos), cada miembro solo puede descargar exactamente dos ZIP (cada uno con JSON + CSV de su alcance): **«Hogar (compartido)»** contiene únicamente hechos compartidos del hogar (sin ninguna fila personal de ningún miembro); **«Mis personales»** contiene únicamente las filas personales del miembro activo y sus dependientes, y **nunca** las del otro miembro.

## Casos borde y manejo de errores

| Caso borde / error | Comportamiento esperado |
| --- | --- |
| **Ingreso fijo recibido por un monto distinto al esperado** | `RecepcionIngreso` se registra y busca por `(serie_id, periodo)` (único por serie y mes activo) guardando el `monto_recibido` real del periodo `'YYYY-MM'` sin alterar `Ingreso.monto`, la versión aplicable ni el mes. El recibo gana primero sobre el esperado (`COALESCE(monto_recibido, esperado(serie, mes))`). |
| **Ingreso fijo aún no recibido en el mes** | Si no existe `RecepcionIngreso` para `(serie_id, periodo)` o `recibido = false`, el estado es `esperado` (`◷ Esperado día N`), el balance usa `esperado(serie, mes)` y ofrece `Marcar recibido`. |
| **Un miembro aún no tiene ingresos registrados en el mes** | Sus aportes en `$` y `%` del hogar se muestran normal (`58,0 %`). Si `Hogar.mostrar_pct_ingreso` está activo, muestra `"Sin ingresos registrados este mes"` en lugar de dividir por cero. |
| **Un miembro aportó `$0` en el mes** | Muestra `$0 (0,0 % del total)` en tono neutro, sin alertas rojas ni sugerencia de compensación. |
| **Intento de crear `Aporte` entre dos medios de miembros** | Rechazado por la invariante I17: `medio_origen_id` debe tener `owner_tipo = 'miembro'` y `medio_destino_id` debe tener `owner_tipo = 'hogar'` (las transferencias entre miembros no crean deuda ni aporte). |
| **Compra financiada con préstamo en efectivo (`financiada_por_pasivo_id`)** | No aparece como aporte al comprarse; el préstamo tiene un único `Pasivo.ambito` (si financia compras del hogar y personales, se modela como dos pasivos). El aporte aparece completo en el mes en que el miembro registre `PagoDeDeuda(tipo = 'abono')` sobre el pasivo con `ambito = 'hogar'` (si el pasivo es `'personal'`, aporta `$0`). |
| **Pago de deuda según `Pasivo.ambito` y `saldo_a_favor`** | Cada `Pasivo` tiene un único `ambito` (`'hogar'` o `'personal'`): un `PagoDeDeuda(tipo = 'abono')` desde cualquier medio de `M` a un pasivo `'hogar'` aporta completo a `M`; a un pasivo `'personal'` aporta `$0`. FIFO solo asigna cuotas/cargos, no decide el aporte. Si una transferencia cubre dos libros (ej. tarjeta hogar y tarjeta personal), se registran dos `PagoDeDeuda` separados. Un `saldo_a_favor` en un pasivo `'hogar'` solo aporta al aplicarse a un cargo posterior (en el mes de ese cargo). |
| **Compra personal (`ambito = 'personal'`)** | Nunca suma al aporte del hogar; excluida de la vista por defecto salvo el interruptor local `incluir_personales` (solo muestra las del propio miembro). En exportaciones, **«Hogar (compartido)»** y **«Mis personales»** se descargan como **dos ZIP separados** (cada uno con JSON + CSV de su alcance, nunca mezclados ni con personales del otro miembro). |
| **Alta, cambio o cierre de una serie de ingreso fijo (I24)** | Un ingreso fijo es una **serie de versiones** con `serie_id` estable (vigencias inclusivas y contiguas, `vigente_hasta + 1 día = siguiente.vigente_desde`, sin solapes ni huecos, a lo sumo una versión abierta). Cambiar monto o día cierra `vigente_hasta` de la versión en curso y crea otra con el mismo `serie_id`. Cada serie aporta **exactamente un importe por mes calendario activo** (`$0` antes del inicio o tras el cierre), según `version(serie, mes)`: el mes lo decide el **día 1** (nunca `dia_esperado`), así un cambio a mitad de mes rige desde el mes siguiente y un cierre en un mes posterior al del arranque no borra el mes en curso; si la serie **arranca a mitad de mes**, aplica la versión vigente el **último día del mes**; si la serie **arranca y se cierra en el mismo mes** —cierre terminal, sin versión siguiente (ej. `20–25/11` por `$3.000.000`)—, el **extremo efectivo** de la última versión reemplaza su `vigente_hasta` real por el último día civil solo para seleccionar (`30/11`), dando en noviembre un solo importe (`$3.000.000`, o `$3.200.000` si hay recibo de noviembre) y en diciembre **`$0`** (sin admitir recibo). El recibo `RecepcionIngreso` se registra, busca y es único por **`(serie_id, periodo)`** —no por fila de versión—, solo en meses activos (`version(serie, periodo) != null`), y gana primero sobre el esperado solo en el importe sin cambiar versión ni mes. |
| **Día esperado 31 en mes de 28/30 días** | Se ajusta automáticamente al último día del mes calendario (`30` en noviembre, `28/29` en febrero). |

## Diagrama de flujo

```mermaid
flowchart TD
    A["Abrir Balance de pareja (mes calendario)"] --> B["Derivar aportes (4 fuentes; abono a Pasivo hogar aporta completo, personal $0) e Ingresos + RecepcionIngreso"]
    B --> C["Mostrar aportes en $ y % (1 decimal), sin deudas entre miembros; % ingreso e incluir_personales apagados"]
    C --> D{"Accion del usuario"}
    D -- "Activar % de su ingreso" --> E["Actualizar Hogar.mostrar_pct_ingreso y mostrar 40,9 % / 35,6 %"]
    D -- "Activar incluir personales" --> F["Cambiar preferencia local de vista (solo muestra personales propias, sin sumar aporte)"]
    D -- "Transferir al fondo comun" --> G["Abrir formulario Aporte: MedioDePago miembro -> MedioDePago hogar"]
    G --> H{"monto > 0 y origen miembro / destino hogar?"}
    H -- No --> G
    H -- Si --> I["Guardar Aporte y recalcular aportes derivados"]
    D -- "Marcar recibido en ingreso fijo" --> J["Confirmar fecha_recepcion y monto_recibido (puede diferir del esperado)"]
    J --> K["Guardar RecepcionIngreso(serie_id, periodo='YYYY-MM') y recalcular"]
    D -- "Registrar ingreso" --> L["Guardar Ingreso fijo o variable"]
```

## Datos del dominio que toca

Nombres canónicos alineados con `docs/data-model.md` y [docs/decisiones-2026-11-22.md](../decisiones-2026-11-22.md).

| Entidad / Concepto | Tipo | Operación | Campos principales | Regla aplicada |
| --- | --- | --- | --- | --- |
| **`Hogar`** | Hecho (tabla replicada) | Lectura / Escritura | `id`, `nombre`, `moneda` (`'COP'`), `zona_horaria` (`'America/Bogota'`), `mostrar_pct_ingreso` (`boolean`, default `false`) | Controla si el hogar muestra la vista `% de su ingreso` (apagada por defecto). |
| **`Miembro`** | Hecho (tabla replicada) | Lectura | `id`, `hogar_id`, `nombre`, `rol`, `activo` | Cada miembro ve los ingresos del otro. Nunca se modela deuda entre miembros. |
| **`Ingreso`** | Hecho (tabla replicada) | Lectura / Escritura | `id`, `serie_id`, `miembro_id`, `tipo` (`'fijo' \| 'variable'`), `descripcion`, `monto`, `dia_esperado`, `vigente_desde`, `vigente_hasta`, `fecha` | Fijos forman una **serie de versiones** con `serie_id` estable (obligatorio en `fijo`, `null` en `variable`; `UNIQUE (id, serie_id)`), vigencias inclusivas y contiguas y a lo sumo una abierta; variables llevan `fecha`. Todo en COP enteros. Cada serie aporta **exactamente un importe por mes calendario activo** (`0` antes del inicio o tras el cierre, I24): decide el **día 1** (nunca `dia_esperado`); si arranca a mitad de mes, decide el **último día**; si arranca y se cierra en el mismo mes (cierre terminal, ej. `20–25/11`), el extremo efectivo de la última versión se extiende al último día civil solo para seleccionar (noviembre un importe, diciembre `0`). |
| **`RecepcionIngreso`** | Hecho (tabla replicada) | Lectura / Escritura | `id`, `ingreso_id`, `serie_id`, `periodo` (`'YYYY-MM'`), `recibido` (`boolean`), `monto_recibido` (`bigint` nullable), `fecha_recepcion` (`date` nullable), `registrado_por` | Recibo mensual de una serie fija. FK compuesta `(ingreso_id, serie_id)` → `Ingreso(id, serie_id)`; `serie_id` lo asigna el servidor y es inmutable. Se registra, busca y tiene único parcial por **`(serie_id, periodo)`** (no por fila de versión `ingreso_id`), solo para meses activos (`version(serie, periodo) != null`). Cuando `recibido = true`, gana primero sobre el esperado (`COALESCE(monto_recibido, esperado(serie, mes))`) solo en el importe, sin cambiar versión, mes ni `Ingreso.monto` (I22, I24). |
| **`Aporte`** | Hecho (tabla replicada) | Lectura / Escritura | `id`, `medio_origen_id` (`owner_tipo = 'miembro'`), `medio_destino_id` (`owner_tipo = 'hogar'`), `monto`, `fecha`, `nota`, `registrado_por` | Transferencia de un miembro al fondo común del hogar. Una de las 4 fuentes del aporte derivado; no es consumo. |
| **`Compra` / `Pasivo` / `PagoDeDeuda` / `CostoFinanciero` / `MedioDePago`** | Hecho (tablas replicadas) | Lectura | `Compra` (`ambito`, `monto_total`, `pago_tipo`, `medio_de_pago_id`, `financiada_por_pasivo_id`, `fecha`); `Pasivo` (`ambito`: `'hogar' \| 'personal'`); `PagoDeDeuda` (`pasivo_id`, `tipo`: `'abono' \| 'saldo_a_favor'`, `monto`, `medio_de_pago_id`, `fecha`); `CostoFinanciero` (`monto`, `medio_de_pago_id`, `fecha_causacion`) | Fuentes auditables del cálculo derivado de aportes por mes calendario. Cada `Pasivo` tiene un único `ambito`: un `PagoDeDeuda(tipo = 'abono')` desde cualquier medio de `M` a un pasivo `'hogar'` aporta completo a `M`, y a uno `'personal'` aporta `$0` (FIFO solo asigna cuotas/cargos, no decide el aporte). `saldo_a_favor` en pasivo `'hogar'` no aporta hasta aplicarse a un cargo posterior; lo personal y las salidas desde medios del hogar nunca suman como aporte. |
| **Resumen de aportes, porcentajes (`58,0 %`, `40,9 %`), totales de ingresos** | **DERIVADO (nunca guardado)** | Solo lectura calculada | `aportes(M, mes)`, `pct_hogar(M)`, `pct_ingreso(M)`, `ingreso(M, mes)` | Siempre calculados en el dispositivo. **Prohibido** persistir resúmenes o calcular saldos/deudas entre miembros. `incluir_personales` es preferencia LOCAL de vista (apagada por defecto). |

# Dominio

> Fuente: documento de premisa de Santiago (pendiente de pegar textual en `docs/premisa-original.md`) más las decisiones del 22 nov 2026.
> Las entidades, campos, fórmulas e invariantes están en [data-model.md](data-model.md); acá no se repiten.
> Si algo de este archivo contradice el código o los tests, ganan el código y los tests (ver AGENTS.md).

## Miembros e ingresos

- Un **hogar** tiene uno o más **miembros**.
- Cada miembro declara sus **ingresos**: **fijos** (salario, arriendo recibido) o **variables** (comisiones, freelance). Los variables se registran cuando llegan; los fijos tienen monto y día esperado.
- Un ingreso fijo puede **recibirse** cada mes. El recibo es un hecho aparte (`RecepcionIngreso`): puede estar pendiente, llegar completo o llegar por un monto distinto. El balance usa el monto recibido si existe; si no, muestra el esperado. Marcar recibido no crea un ingreso nuevo ni cambia el monto declarado.
- Un ingreso fijo es una **serie de versiones** con vigencias contiguas: cambiar monto o día cierra la versión en curso y abre otra. En cada **mes calendario** la serie aporta exactamente un importe: el del recibo del periodo si existe y, si no, el esperado de la versión vigente el día 1; si la serie arranca a mitad de mes, el de la versión vigente el último día, y si arranca y se cierra en el mismo mes, ese cierre terminal se toma al último día civil de ese mes. Un cambio de monto o de día a mitad de mes en una serie ya activa el día 1 rige desde el mes siguiente. Un recibo solo existe para un mes activo de la serie: gana sobre el importe, nunca cambia la versión ni el mes. Nunca dos sueldos ni ninguno en el mes del cambio ([data-model.md](data-model.md) §8, I24).
- Todos los miembros ven los ingresos del otro. La vista **"% de su ingreso"** viene apagada por defecto (`Hogar.mostrar_pct_ingreso = false`): el balance muestra pesos y porcentaje del total aportado, y solo si el hogar la prende agrega el porcentaje sobre el ingreso individual. El ingreso es denominador informativo; nunca cambia los aportes.

## Gastos del hogar y personales

- Toda **compra** declara su ámbito: **del hogar** (`hogar`, por defecto) o **personal** (`personal`). El consumo del hogar es el que sostiene la casa; el personal es de un miembro y no se reparte.
- Una compra personal pertenece a un miembro (`Compra.miembro_id`) y por defecto solo la ve su dueño. Los reportes y el balance del hogar excluyen lo personal; el interruptor de vista `incluir_personales` (apagado, preferencia local) puede mostrarlo, pero **nunca** cambia los aportes.
- Una compra personal pagada con un medio de un miembro **no es aporte al hogar**, ni siquiera con el interruptor prendido.
- Un pago de una deuda puramente personal tampoco es aporte del hogar. Cada pasivo es un libro de un solo ámbito y cada pago pertenece a un solo libro: un pago a un libro del hogar es aporte completo de quien paga; uno a un libro personal no aporta. Cuando una transferencia cubre dos libros (por ejemplo el libro del hogar y el personal de la misma tarjeta), se registran dos pagos con las porciones que el usuario identifique; la app nunca reparte sola ([data-model.md](data-model.md)).
- **Mascotas.** La tarjeta "Mascotas" del hogar es una vista de categoría: suma las compras de ámbito hogar de la categoría Mascotas, cada una una sola vez. `mascota_id` es una etiqueta opcional que solo sirve para el desglose por mascota y no agrega compras de otras categorías al total; las compras personales nunca entran en la vista compartida, su dueño las ve en su vista personal ([data-model.md](data-model.md) §8, I26).

## Aporte libre

- Cada miembro aporta lo que quiere o puede al hogar. **La app nunca crea una deuda automática entre miembros** por haber aportado distinto.
- El balance de pareja **muestra** cuánto aportó cada uno (en pesos y en % del total, y opcionalmente en % de su ingreso), pero no dice "X le debe a Y".
- **Fondo común.** Aportar también es transferir plata de un medio del miembro a un medio del hogar (`Aporte`); los flujos tienen la acción "Transferir al fondo común". El balance de pareja incluye esas transferencias. Lo que después sale del fondo común es una salida del hogar: no es aporte de ningún miembro y no crea deuda entre ellos.

## Tarjetas y créditos (decisión 22 nov 2026)

- Por ahora **cada tarjeta y cada crédito pertenece a un solo miembro**.
- Un pasivo tiene un solo **ámbito** (`hogar` o `personal`), independiente de su dueño. Que la tarjeta sea de Ana no la vuelve personal: su libro del hogar es compartido y pagable por ambos. Si la misma tarjeta tiene gastos personales de Ana, se modela como un segundo pasivo personal, solo visible para ella.
- El modelo debe permitir más adelante un **dueño compartido** (el hogar) sin migraciones dolorosas: la propiedad se modela como `owner = miembro | hogar`, aunque la UI de fase 1 solo ofrezca "miembro".

## Deudas (decisión 22 nov 2026)

- Una deuda puede ser **de un miembro** o **del hogar** (deuda general de la casa). Un "préstamo de la cocina" del hogar es una deuda con dueño hogar, no un crédito de un miembro.
- Que una deuda sea de un miembro no impide que otro miembro haga un pago a esa deuda **del hogar**; ese pago cuenta como aporte de quien pagó, no genera deuda entre miembros. Un libro personal solo lo gestiona su dueño y sus pagos no producen aporte del hogar.
- Un pago de deuda **nunca deja el saldo del pasivo negativo**. El abono se acepta hasta el saldo causado a la fecha del pago, sin interés futuro. Si excede ese tope, la app lo rechaza con un aviso de posible pago duplicado o sobrepago. El exceso solo se registra como **saldo a favor** con confirmación explícita. Ese saldo no reduce capital ni es costo financiero; se aplica a cargos futuros y no es aporte hasta que cubra un cargo del hogar. En un pasivo personal nunca es aporte del hogar.

## Préstamo en efectivo

- Un **préstamo en efectivo** es un pasivo (`Credito` o `Deuda`) cuyo capital se desembolsa. El desembolso se registra **una sola vez**, en la fecha del giro, como plan de cuotas con origen `desembolso`. No es una compra, no es ingreso y no es gasto.
- Lo que se compra con esa plata se registra como una compra normal vinculada al préstamo (`financiada_por_pasivo_id`): cuenta una vez al gasto y **no crea otro capital**, porque el capital ya está en el plan de desembolso. Tampoco cuenta como aporte: la plata no salió de un medio del miembro, salió del préstamo.
- El préstamo se paga como cualquier pasivo. El aporte aparece cuando un miembro paga desde su medio un libro del hogar; un préstamo personal no genera aporte del hogar.
- No se puede gastar más que lo desembolsado ni registrar compras anteriores al giro. Lo que no se gasta sigue siendo saldo del pasivo y se separa explícitamente en la identidad de conservación.
- El **saldo inicial** de un pasivo (`origen='saldo_inicial'`) es deuda previa, no plata nueva: no se mezcla con `desembolso` ni se usa para financiar compras.
- Un mismo préstamo que financie compras del hogar y personales se separa en dos pasivos: un plan tiene un solo ámbito y el pago no se atribuye a medias.

## Consumo vs pago de deuda vs costo financiero (sin doble conteo)

Tres conceptos que nunca se suman entre sí:

| Concepto | Qué es | Cuándo se registra |
| --- | --- | --- |
| **Consumo** | El gasto real (ej. mercado de $300.000) | Una sola vez, en la fecha de la compra, por el valor total, en su categoría |
| **Pago de deuda** | Plata que sale para abonar a una tarjeta o crédito (cuota, capital) | Cada vez que se paga. **No** es consumo nuevo |
| **Costo financiero** | Intereses, cuota de manejo, seguros, mora | Cuando se causa. Es gasto, pero en el balde "Costo financiero", no en una categoría de consumo, separado del consumo |

Ejemplo: mercado de $300.000 a 3 cuotas con tarjeta.
- Consumo: $300.000 en "Mercado", una vez, el día de la compra.
- Obligaciones: 3 cuotas de capital de $100.000 (pagos de deuda, no consumo).
- Costo financiero: los intereses de cada cuota, aparte.
- Total gastado en el mes de la compra en "Mercado" = $300.000, nunca $300.000 + $100.000.

## Mes calendario

- El balance, el gasto, los aportes y los ingresos se leen por **mes calendario**, según la fecha civil (`America/Bogota`). No hay ciclos por día de pago ni por corte de tarjeta.
- La **agenda de obligaciones** se lee por el periodo de la obligación; el **gasto** se lee por la fecha de la compra. Un recibo de noviembre pagado el 2 de diciembre aparece pagado en la agenda de noviembre y suma al gasto de diciembre. Son dos vistas distintas y no se reconcilian por mes.

## Despensa con nivel

- Cada artículo de despensa tiene un **tipo** (comida, higiene, salud, otro) y un **umbral de alerta**. El nivel no es un campo del artículo: se registra como hechos (`NivelDespensa`) con fecha, porcentaje y origen (compra o ajuste).
- Una compra del artículo registra nivel 100 en el mismo momento de la compra. Un ajuste manual registra el nivel observado.
- El **nivel actual**, los **días restantes**, la **próxima compra estimada** y la **alerta** se derivan del último hecho y de la frecuencia; nunca se guardan. Si no hay nivel observado, el estado es "desconocido" y no hay alerta; si falta la frecuencia, el nivel y la alerta siguen existiendo pero días y próxima compra quedan sin estimar.

## Tasas colombianas (opcional)

- Una tarjeta o crédito puede tener tasa en **E.A.** (efectiva anual) o **M.V.** (mes vencido). Son opcionales; sin tasa, la app no calcula intereses y el usuario los registra a mano como costo financiero.
- Conversión: `MV = (1 + EA)^(1/12) - 1` y `EA = (1 + MV)^12 - 1`.

## Moneda

- Todo en **COP**, montos enteros en pesos (sin centavos). Formato `$300.000`.

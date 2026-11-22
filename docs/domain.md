# Dominio

> Fuente: documento de premisa de Santiago (pendiente de pegar textual en `docs/premisa-original.md`) más las decisiones del 22 nov 2026.
> Si algo de este archivo contradice el código o los tests, ganan el código y los tests (ver AGENTS.md).

## Miembros e ingresos

- Un **hogar** tiene uno o más **miembros**.
- Cada miembro declara sus **ingresos**: **fijos** (salario, arriendo recibido) o **variables** (comisiones, freelance). Los variables se registran cuando llegan; los fijos tienen monto y día esperado.

## Aporte libre

- Cada miembro aporta lo que quiere o puede al hogar. **La app nunca crea una deuda automática entre miembros** por haber aportado distinto.
- El balance de pareja **muestra** cuánto aportó cada uno (en pesos y en % del total, y opcionalmente en % de su ingreso), pero no dice "X le debe a Y".

## Tarjetas y créditos (decisión 22 nov 2026)

- Por ahora **cada tarjeta y cada crédito pertenece a un solo miembro**.
- El modelo debe permitir más adelante un **dueño compartido** (el hogar) sin migraciones dolorosas: la propiedad se modela como `owner = miembro | hogar`, aunque la UI de fase 1 solo ofrezca "miembro".

## Deudas (decisión 22 nov 2026)

- Una deuda puede ser **de un miembro** o **del hogar** (deuda general de la casa).
- Que una deuda sea de un miembro no impide que otro miembro haga un pago a esa deuda; ese pago cuenta como aporte de quien pagó, no genera deuda entre miembros.

## Consumo vs pago de deuda vs costo financiero (sin doble conteo)

Tres conceptos que nunca se suman entre sí:

| Concepto | Qué es | Cuándo se registra |
| --- | --- | --- |
| **Consumo** | El gasto real (ej. mercado de $300.000) | Una sola vez, en la fecha de la compra, por el valor total, en su categoría |
| **Pago de deuda** | Plata que sale para abonar a una tarjeta o crédito (cuota, capital) | Cada vez que se paga. **No** es consumo nuevo |
| **Costo financiero** | Intereses, cuota de manejo, seguros, mora | Cuando se causa. Es gasto, pero en categoría "costo financiero", separado del consumo |

Ejemplo: mercado de $300.000 a 3 cuotas con tarjeta.
- Consumo: $300.000 en "Mercado", una vez, el día de la compra.
- Obligaciones: 3 cuotas de capital de $100.000 (pagos de deuda, no consumo).
- Costo financiero: los intereses de cada cuota, aparte.
- Total gastado en el mes de la compra en "Mercado" = $300.000, nunca $300.000 + $100.000.

## Tasas colombianas (opcional)

- Una tarjeta o crédito puede tener tasa en **E.A.** (efectiva anual) o **M.V.** (mes vencido). Son opcionales; sin tasa, la app no calcula intereses y el usuario los registra a mano como costo financiero.
- Conversión: `MV = (1 + EA)^(1/12) - 1` y `EA = (1 + MV)^12 - 1`.

## Moneda

- Todo en **COP**, montos enteros en pesos (sin centavos). Formato `$300.000`.

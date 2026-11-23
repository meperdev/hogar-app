# Flujos de usuario — hogar-app (Fase 1)

> **Contrato de datos:** las entidades, campos, fórmulas derivadas e invariantes referenciadas en estos flujos tienen como contrato canónico `docs/data-model.md`, que llega en el **PR #2** (junto con `docs/architecture.md` y `docs/examples.md`). En este PR #1 se incluyen el dominio base ([docs/domain.md](../domain.md)), el formato QR DIAN ([docs/dian-qr.md](../dian-qr.md)) y el acta de decisiones ([docs/decisiones-2026-11-22.md](../decisiones-2026-11-22.md)).

## Índice de flujos

| Núcleo | Flujo | Pantallas clave |
| --- | --- | --- |
| 1. Compra rápida | [compra-rapida.md](compra-rapida.md) | Registro manual, cuotas con tarjeta, préstamos en efectivo y escaneo QR DIAN local. |
| 2. Obligaciones del mes | [obligaciones-del-mes.md](obligaciones-del-mes.md) | Agenda mensual sin doble conteo, registro de pago de obligación y alta de pasivos (ámbito y titular). |
| 3. Balance de pareja | [balance-de-pareja.md](balance-de-pareja.md) | Aporte libre por mes calendario, transferencias al fondo común, ingresos fijos/variables y exportación semanal (`1 + N` en Storage, 2 ZIP descargables por miembro). |
| 4. Despensa de mascotas | [despensa-mascotas.md](despensa-mascotas.md) | Total mensual reconciliable, nivel observado, `vida_util_dias`, `fecha_reposicion` fija, `dias_restantes` decrecientes y recompra en 1 toque. |

Los mockups estáticos HTML/CSS correspondientes viven en [design/mockups/README.md](../../design/mockups/README.md).

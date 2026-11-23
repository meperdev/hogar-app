# App de gastos del hogar: reparto, tarjetas y modelo de dominio

Nov 22, 2026 · @Santiago Villabona

## Reparto entre pareja: aporte libre, no regla fija

Como los gastos se pagan "a como vaya llegando" y los ingresos de la pareja son semanales o extra, la app no impone mitad y mitad: muestra con claridad quién ha aportado qué y deja que ustedes decidan.

- **Aporte libre como base.** Cada gasto registra quién lo pagó y a quién beneficia (la casa, uno de los dos o los gatos). No se genera una deuda automática. La app muestra, por ejemplo: "Este mes: Santiago aportó 62%, pareja 38%".
- **Responsabilidades fijas como excepción.** Una obligación puede tener un responsable asignado: el arriendo es de Santiago. Al pagarla cuenta como su aporte, pero no hay nada que compensar.
- **Meta de reparto opcional.** Si algún día quieren cuadrar, definen una meta (50/50 o 60/40) y la app dice cuánto falta. Sin meta, solo informa.
- **Ingresos por miembro.** El sueldo de Santiago es un ingreso recurrente fijo; el de la pareja es variable y se registra cuando llega. Con eso la app responde "¿cuánto nos queda disponible esta semana?", más útil que un presupuesto mensual rígido.

## Tarjetas y créditos: no contar dos veces

El punto más delicado es el doble conteo: un mercado de $300.000 a 3 cuotas es un solo gasto, no tres. La solución es separar el consumo del movimiento de deuda.

| Concepto | Qué es | Afecta reportes de gasto |
| --- | --- | --- |
| Gasto (consumo) | Qué se compró y cuánto costó, el día de la compra | Sí |
| Abono a deuda | Pagar la tarjeta o una cuota: reduce la deuda | No |
| Costo financiero | Intereses y cuota de manejo | Sí, en su propia categoría |

Con esa separación la app puede mostrar:

- **Deuda viva por tarjeta:** cuánto se debe, qué compras siguen en cuotas y cuántas cuotas faltan.
- **Compromiso futuro:** "el próximo mes ya hay $420.000 comprometidos en cuotas", clave con ingresos variables.
- **Fechas de corte y de pago** como obligaciones recurrentes, con recordatorio.
- **Créditos** (libre inversión, celular a cuotas) con la misma lógica: monto, tasa, número de cuotas y plan de pagos.

Detalle colombiano: las tasas vienen en E.A. o M.V. y muchas compras a 1 cuota no generan interés, así que la tasa es opcional y se guarda con su tipo.

## Modelo de dominio

Un gasto responde "¿en qué se nos fue la plata?"; un movimiento de dinero (pago en efectivo o Nequi, abono a la tarjeta) responde "¿de dónde salió y cuándo?". Mantenerlos separados permite tener a la vez reportes de consumo (gatos, mercado) y la vista de deudas.

&#91;embedded content: modelo de dominio · 4 grupos bajo el hogar\]

Todo cuelga del hogar; los abonos a deuda quedan fuera de los reportes de consumo, y solo los intereses cuentan como gasto.

## Pendientes

- [ ] ¿Las tarjetas y créditos son de cada uno por separado o hay alguno compartido? Define si una deuda pertenece a un miembro o al hogar.
- [ ] Definir los flujos de pantalla de los cuatro núcleos: compra rápida, obligaciones del mes, balance de pareja y despensa de mascotas.
- [ ] Verificar qué tan accesible es el QR/CUFE de la factura electrónica DIAN antes de apoyarse en él.

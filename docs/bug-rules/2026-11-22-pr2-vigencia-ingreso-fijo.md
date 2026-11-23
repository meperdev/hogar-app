# La vigencia de un ingreso fijo se resolvía por fila y su propia fecha esperada

- Síntoma: en un cambio de monto o de día a mitad de mes el balance podía contar **dos sueldos** o **ninguno**.
  Con vigencias 1–15 y 16–30 de noviembre y días 10→20 sumaba `$9.200.000`; con días 20→10 sumaba `$0`.
- Causa: el ingreso fijo se modelaba como filas sueltas y el mes se resolvía con la fecha esperada **propia** de
  cada fila. Dos filas podían caer en el mismo mes, o ninguna.
- Prevención: `Ingreso.serie_id` con vigencias inclusivas y contiguas (trigger diferido), `RecepcionIngreso.serie_id`
  **física e inmutable** con FK compuesta `(ingreso_id, serie_id)` y único parcial real `(serie_id, periodo)`, y la
  regla de selección por serie y mes calendario del día 1 —o del último día si la serie arranca a mitad de mes, con
  cierre terminal en el mismo mes tomado al último día civil— con `0` antes del inicio y después del cierre. Un
  recibo solo existe para un mes activo y gana primero sobre el importe, sin cambiar versión ni mes. Invariante
  **I24** y oráculos T-i-5 a T-i-8 en [examples.md](../examples.md) (ejemplo i bis).
- PR: #2.

# Factura electrónica DIAN: QR y CUFE (investigación 22 nov 2026)

- El QR impreso de una factura electrónica (Anexo Técnico FEV 1.9, num. 11.7) puede traer dos formatos:
  1. Campos: NumFac, FecFac, HorFac, NitFac, DocAdq, ValFac, ValIva, ValOtroIm, ValTolFac, CUFE (o CUDE) más la URL de catalogo-vpfe.
  2. Solo la URL de catalogo-vpfe (con el CUFE dentro).
- El QR **nunca** trae los ítems de la factura.
- El catálogo de la DIAN bloquea automatización (captcha y, desde jul 2026, exige NIT). **La app NO debe depender de consultarlo.**

## Diseño

- Compra rápida: botón "Escanear factura" que soporta ambos formatos de QR y precarga NIT del comercio, fecha, total, IVA y CUFE/CUDE. El usuario confirma (categoría, medio de pago) y guarda.
- Si el QR solo trae URL: extraer el CUFE de la URL; el resto lo completa OCR del tiquete o el usuario.
- Fallback: OCR del tiquete impreso y entrada manual.
- Botón opcional "Verificar en la DIAN" que abre la URL oficial en el navegador para verificación manual. Nunca scraping.
- Fase 2: ingesta de correos de factura reenviados (ZIP con XML y PDF) para obtener los ítems cuando la factura sale a nombre del miembro.

## Deduplicación por CUFE/CUDE

Al escanear, solo se buscan coincidencias entre compras no eliminadas del hogar y compras personales del mismo miembro que escanea. Nunca se consultan compras personales ajenas: ni el aviso, ni la respuesta al guardar o sincronizar pueden revelar que existe una.

| Ámbito de la compra | Índice único parcial entre compras no eliminadas con `cufe` |
| --- | --- |
| `hogar` (compartida) | `(hogar_id, cufe)` |
| `personal` (solo la ve su dueño) | `(hogar_id, miembro_id, cufe)` |

La unicidad rechaza duplicados solo dentro del índice que corresponde a la compra que se guarda. Una coincidencia visible en el otro ámbito puede avisar, pero no bloquea. Si otra persona guardó ese CUFE solo como personal, escanearlo o guardarlo produce el mismo resultado que si esa compra ajena no existiera.

Si una factura se reparte en varias compras por categoría, solo la de mayor `monto_total` lleva el `cufe` y el `iva`; las demás los dejan en `null`.

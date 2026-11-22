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
- Guardar CUFE/CUDE con restricción única por hogar para deduplicar (escanear dos veces la misma factura no crea dos consumos).
- Fase 2: ingesta de correos de factura reenviados (ZIP con XML y PDF) para obtener los ítems cuando la factura sale a nombre del miembro.

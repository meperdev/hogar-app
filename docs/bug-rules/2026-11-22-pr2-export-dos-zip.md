# El contrato de exportación decía dos ZIP y la interfaz del generador no lo fijaba

- Síntoma: una parte del documento decía que el generador siempre corre con un actor explícito y que lo personal se
  genera solo para ese actor; otra decía que el job semanal genera un archivo personal por miembro activo y que el
  compartido no depende del actor. No quedaba claro qué descarga cada miembro ni cuántos ZIP recibe.
- Causa: faltaba la interfaz explícita de las dos funciones y el contrato de descarga estaba repartido en prosa.
- Prevención: contrato fijo de **dos ZIP por miembro** —compartido del hogar y personal propio, cada uno con JSON y
  CSV por tabla de su alcance— con dos funciones (`exportar_hogar(hogar_id, fecha)` y
  `exportar_personal(hogar_id, miembro_id, fecha)`), `miembro_id` tomado del actor autenticado y el job semanal
  generando `1 + N` archivos en Storage mientras cada miembro ve dos
  ([architecture.md](../architecture.md) §9.1–§9.2).
- PR: #2.

import { describe, expect, it, vi } from 'vitest';
import { parsearQrDian, urlVerificacionDian } from './qrDian';

const CUFE = 'a'.repeat(48) + 'B'.repeat(48);
const CUFE_MIN = 'a'.repeat(48) + 'b'.repeat(48);

function textoCampos(cufe: string = CUFE): string {
  return [
    'NumFac: SETP990000001',
    'FecFac: 2026-11-22',
    'HorFac: 10:15:00-05:00',
    'NitFac: 890900608',
    'DocAdq: 1020304050',
    'ValFac: 71428.57',
    'ValIva: 13571.43',
    'ValOtroIm: 0.00',
    'ValTolFac: 85000.00',
    `CUFE: ${cufe}`,
    `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
  ].join('\n');
}

describe('urlVerificacionDian', () => {
  it('arma la URL oficial por defecto y con otro host DIAN', () => {
    expect(urlVerificacionDian(CUFE_MIN)).toBe(
      `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE_MIN}`,
    );
    expect(urlVerificacionDian(CUFE_MIN, 'catalogo-vpfe-hab.dian.gov.co')).toBe(
      `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${CUFE_MIN}`,
    );
  });
});

describe('parsearQrDian con campos', () => {
  it('lee los campos y normaliza el CUFE en minúsculas', () => {
    const r = parsearQrDian(textoCampos());
    expect(r.formato).toBe('campos');
    if (r.formato !== 'campos') throw new Error('se esperaba formato campos');
    expect(r.numFac).toBe('SETP990000001');
    expect(r.fecha).toBe('2026-11-22');
    expect(r.nitComercio).toBe('890900608');
    expect(r.montoTotal).toBe(85000);
    expect(r.iva).toBe(13571);
    expect(r.cufe).toBe(CUFE_MIN);
    expect(r.urlVerificacion).toBe(urlVerificacionDian(CUFE_MIN));
  });

  it('nunca expone el documento del adquiriente', () => {
    const r = parsearQrDian(textoCampos());
    expect(JSON.stringify(r)).not.toContain('1020304050');
  });

  it('redondea los montos DIAN desde su texto', () => {
    const r = parsearQrDian(textoCampos().replace('ValTolFac: 85000.00', 'ValTolFac: 85000.40'));
    expect(r.formato).toBe('campos');
    if (r.formato !== 'campos') throw new Error('se esperaba formato campos');
    expect(r.montoTotal).toBe(85000);
  });

  it('ignora una fecha de factura inválida', () => {
    const r = parsearQrDian(textoCampos().replace('FecFac: 2026-11-22', 'FecFac: 2026-02-30'));
    expect(r.formato).toBe('campos');
    if (r.formato !== 'campos') throw new Error('se esperaba formato campos');
    expect(r.fecha).toBeNull();
  });
});

describe('parsearQrDian con URL', () => {
  it('extrae el CUFE de una URL DIAN sin campos', () => {
    const r = parsearQrDian(
      `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE}`,
    );
    expect(r.formato).toBe('url');
    if (r.formato !== 'url') throw new Error('se esperaba formato url');
    expect(r.cufe).toBe(CUFE_MIN);
    expect(r.urlVerificacion).toBe(urlVerificacionDian(CUFE_MIN));
  });

  it('acepta el host de habilitación y nombres de parámetro en mayúsculas', () => {
    const r = parsearQrDian(
      `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?DOCUMENTKEY=${CUFE}`,
    );
    expect(r.formato).toBe('url');
    if (r.formato !== 'url') throw new Error('se esperaba formato url');
    expect(r.cufe).toBe(CUFE_MIN);
    expect(r.urlVerificacion).toBe(
      urlVerificacionDian(CUFE_MIN, 'catalogo-vpfe-hab.dian.gov.co'),
    );
  });

  it('rechaza un host que no es de la DIAN', () => {
    const r = parsearQrDian(
      `https://evil.example/document/searchqr?documentkey=${CUFE}`,
    );
    expect(r).toEqual({ formato: 'invalido', motivo: 'No es un QR de factura electrónica DIAN' });
  });

  it('rechaza un CUFE distinto entre campos y enlace', () => {
    const otro = 'c'.repeat(96);
    const texto = [
      'NumFac: SETP990000001',
      `CUFE: ${CUFE}`,
      `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${otro}`,
    ].join('\n');
    expect(parsearQrDian(texto)).toEqual({
      formato: 'invalido',
      motivo: 'El CUFE del QR no coincide con su enlace',
    });
  });

  it('rechaza textos que no son QR DIAN', () => {
    expect(parsearQrDian('hola')).toEqual({
      formato: 'invalido',
      motivo: 'No es un QR de factura electrónica DIAN',
    });
  });

  it('nunca consulta la red al parsear', () => {
    const espia = vi.fn();
    vi.stubGlobal('fetch', espia);
    parsearQrDian(textoCampos());
    parsearQrDian(`https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE}`);
    expect(espia).not.toHaveBeenCalled();
  });
});

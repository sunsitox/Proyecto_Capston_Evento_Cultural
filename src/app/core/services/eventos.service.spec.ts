import { describe, expect, it } from 'vitest';
import { esCoordenadaChile, gratuidadDesdeApi } from './eventos.service';

describe('gratuidadDesdeApi (CP-DAT-010)', () => {
  it('respeta el booleano declarado por la fuente', () => {
    expect(gratuidadDesdeApi(true)).toBe(true);
    expect(gratuidadDesdeApi(false)).toBe(false);
  });

  it('deja NULL como desconocido: no lo convierte en "con costo"', () => {
    expect(gratuidadDesdeApi(null, '')).toBeNull();
    expect(gratuidadDesdeApi(undefined, null)).toBeNull();
    expect(gratuidadDesdeApi(null, '$5.000')).toBeNull();
  });

  it('resuelve gratis solo con un texto explícito de gratuidad', () => {
    expect(gratuidadDesdeApi(null, 'Gratis')).toBe(true);
    expect(gratuidadDesdeApi(null, 'entrada liberada')).toBe(true);
  });
});

describe('esCoordenadaChile (CP-MAP-008)', () => {
  it('acepta Santiago (-33,4 / -70,7)', () => {
    expect(esCoordenadaChile(-33.4, -70.7)).toBe(true);
  });

  it('acepta el extremo sur (Aysén -45,5) y Magallanes (-53,6)', () => {
    expect(esCoordenadaChile(-45.5, -73.0)).toBe(true);
    expect(esCoordenadaChile(-53.6, -70.9)).toBe(true);
  });

  it('acepta Rapa Nui (-27,1 / -109,4) y Juan Fernández (-33,6 / -78,8)', () => {
    expect(esCoordenadaChile(-27.1, -109.4)).toBe(true);
    expect(esCoordenadaChile(-33.6, -78.8)).toBe(true);
  });

  it('rechaza coordenadas fuera de Chile (Buenos Aires, Ciudad de México, océano)', () => {
    expect(esCoordenadaChile(-34.6, -58.4)).toBe(false); // Buenos Aires
    expect(esCoordenadaChile(19.4, -99.1)).toBe(false); // Ciudad de México
    expect(esCoordenadaChile(-20.0, -120.0)).toBe(false); // océano
  });

  it('rechaza 0,0, no finitos y ausentes (null/undefined como NaN)', () => {
    expect(esCoordenadaChile(0, 0)).toBe(false);
    expect(esCoordenadaChile(NaN, -70)).toBe(false);
    expect(esCoordenadaChile(-33, NaN)).toBe(false);
    expect(esCoordenadaChile(Infinity, -70)).toBe(false);
  });

  it('respeta los bordes del rectángulo', () => {
    expect(esCoordenadaChile(-17, -69)).toBe(true);
    expect(esCoordenadaChile(-56, -68)).toBe(true);
    expect(esCoordenadaChile(-16.9, -69)).toBe(false);
    expect(esCoordenadaChile(-57, -68)).toBe(false);
    expect(esCoordenadaChile(-30, -65.9)).toBe(false);
    expect(esCoordenadaChile(-30, -110.1)).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicarEventoPage } from './publicar-evento.page';
import { ApiService } from '../../core/services/api.service';
import { EventosService } from '../../core/services/eventos.service';
import type { MiEventoOrganizador } from '../../core/services/supabase.service';

describe('Mis eventos · conservación al editar', () => {
  const actualizarEvento = vi.fn();
  const publicarSupabase = vi.fn();
  const evento = {
    id: 'ev-1', title: 'Evento de prueba', description: 'Descripción suficientemente extensa del evento.',
    status: 'draft', start_at: '2026-11-22T18:00:12+00:00', end_at: '2026-11-22T21:30:45+00:00',
    communes: { name: 'Santiago' }, address: 'Plaza de Armas', is_free: true,
    event_categories: [
      { categories: { name: 'Música' } }, { categories: [{ name: 'Teatro' }, { name: 'Categoría histórica' }] }
    ]
  } as MiEventoOrganizador;
  let page: PublicarEventoPage;
  beforeEach(() => {
    vi.useFakeTimers();
    actualizarEvento.mockReset().mockResolvedValue(undefined);
    publicarSupabase.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [
      { provide: ApiService, useValue: {
        sesionLista: signal(false), esOrganizador: signal(true), actualizarEvento,
        listarMisEventos: vi.fn().mockResolvedValue([])
      } },
      { provide: EventosService, useValue: { cargarEventos: vi.fn().mockResolvedValue(undefined), publicarSupabase } },
      { provide: Router, useValue: { navigateByUrl: vi.fn() } }
    ] });
    page = TestBed.runInInjectionContext(() => new PublicarEventoPage());
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('precarga todas las categorías, incluidas las ausentes del catálogo UI, y la hora final', () => {
    page.editarEvento(evento);
    expect(page.formulario.value.categoria).toEqual(['Música', 'Teatro', 'Categoría histórica']);
    expect(page.categorias()).toContain('Categoría histórica');
    expect(page.formulario.value.horaTermino).toBe('21:30');
  });
  it('cambiar solo el título conserva categorías e instantes completos', async () => {
    page.editarEvento(evento);
    page.formulario.patchValue({ titulo: 'Título modificado' });
    await page.publicar();
    expect(actualizarEvento).toHaveBeenCalledWith('ev-1', expect.objectContaining({
      title: 'Título modificado', categories: ['Música', 'Teatro', 'Categoría histórica'],
      start_at: evento.start_at, end_at: evento.end_at
    }));
  });
  it('permite modificar la hora final sin usar la inicial y retirar categorías explícitamente', async () => {
    page.editarEvento(evento);
    page.formulario.patchValue({ horaTermino: '22:45', categoria: ['Teatro'] });
    await page.publicar();
    expect(actualizarEvento).toHaveBeenCalledWith('ev-1', expect.objectContaining({
      end_at: '2026-11-22T22:45:00', categories: ['Teatro']
    }));
  });
  it('conserva término nulo', async () => {
    page.editarEvento({ ...evento, end_at: null });
    await page.publicar();
    expect(actualizarEvento).toHaveBeenCalledWith('ev-1', expect.objectContaining({ end_at: null }));
  });
  it('creación envía más de tres categorías sin recortar y con hora final independiente', async () => {
    page.formulario.patchValue({
      titulo: 'Evento nuevo', descripcion: 'Descripción suficientemente extensa para crear.',
      fecha: '2026-11-22', hora: '18:00', fechaTermino: '2026-11-22', horaTermino: '21:30',
      comuna: 'Santiago', direccion: 'Plaza', categoria: ['Música', 'Teatro', 'Danza', 'Patrimonio']
    });
    await page.publicar();
    expect(publicarSupabase).toHaveBeenCalledWith(expect.objectContaining({
      categories: ['Música', 'Teatro', 'Danza', 'Patrimonio'], end_at: '2026-11-22T21:30:00'
    }));
    expect(actualizarEvento).not.toHaveBeenCalled();
  });
  it('un error no anuncia éxito ni abandona la edición', async () => {
    actualizarEvento.mockRejectedValue(new Error('No se aplicaron cambios.'));
    page.editarEvento(evento);
    await page.publicar();
    expect(page.enviado()).toBe(false);
    expect(page.editandoId()).toBe('ev-1');
    expect(page.errorServidor()).toBe('No se aplicaron cambios.');
    expect(page.cargando()).toBe(false);
  });
});

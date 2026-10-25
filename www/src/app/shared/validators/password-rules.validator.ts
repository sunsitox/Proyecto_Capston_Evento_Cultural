import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validador estructural del nombre: letras (incluye acentos y ñ),
 * espacios, guiones y puntos. Rechaza números y símbolos raros.
 */
export function sinNumerosNiRaros(control: AbstractControl): ValidationErrors | null {
  const valor = String(control.value ?? '').trim();
  if (!valor) return null; // 'required' se encarga del vacío
  const ok = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{2,80}(?:\s[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+)*$/.test(valor);
  return ok ? null : { formatoNombre: true };
}

/**
 * Reglas de contraseña: 8–72 caracteres (límite real de bcrypt en Supabase),
 * al menos una mayúscula, una minúscula, un número y un símbolo.
 */
export class PasswordRulesValidator {
  /** Aplica todas las reglas de contraseña y devuelve los errores合一. */
  static conReglasFuertes(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const valor = String(control.value ?? '');
      if (!valor) return null; // 'required' se encarga del vacío
      const errores: ValidationErrors = {};
      if (!/[A-Z]/.test(valor)) errores['sinMayuscula'] = true;
      if (!/[a-z]/.test(valor)) errores['sinMinuscula'] = true;
      if (!/\d/.test(valor)) errores['sinNumero'] = true;
      if (!/[^A-Za-z0-9]/.test(valor)) errores['sinSimbolo'] = true;
      return Object.keys(errores).length ? errores : null;
    };
  }

  /** Validador de grupo: password y confirmar deben ser idénticos. */
  static coincide(passwordPath: string, confirmarPath: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const password = group.get(passwordPath);
      const confirmar = group.get(confirmarPath);
      if (!password || !confirmar) return null;
      // En modo ingresar `confirmar` está deshabilitado: la comparación no aplica.
      if (confirmar.disabled) return null;
      const iguales = password.value === confirmar.value;
      // Limpia residual cuando ya coincide.
      if (iguales && confirmar.hasError('coiniden')) {
        const copia = { ...confirmar.errors };
        delete copia['coiniden'];
        confirmar.setErrors(Object.keys(copia).length ? copia : null);
      }
      if (!iguales) return { coiniden: true };
      return null;
    };
  }
}

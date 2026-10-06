-- Panel de administrador: nuevo rol ADMIN y poder desactivar cuentas.
-- Aditiva: no borra ni modifica datos existentes.

-- ALTER TYPE ... ADD VALUE no puede ir dentro de un bloque con otras
-- sentencias que usen el valor nuevo en la misma transacción, así que va sola.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ADMIN';

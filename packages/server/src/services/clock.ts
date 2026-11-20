/** Reloj inyectable: permite probar reglas dependientes del tiempo (ventana de 30 días). */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

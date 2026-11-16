import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;
export const sql = () => (_sql ??= neon(process.env.DATABASE_URL!));
// Dinamik so'rov ($1, $2 ...)
export const q = (text: string, params: unknown[] = []) => sql().query(text, params) as Promise<any[]>;

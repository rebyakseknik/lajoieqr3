/**
 * Ayarlar projenin kokundeki TEK .env dosyasindan okunur.
 * Bu modul diger her seyden once import edilmelidir.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const buKlasor = path.dirname(fileURLToPath(import.meta.url));

// server/src -> proje koku
dotenv.config({ path: path.join(buKlasor, '..', '..', '.env') });

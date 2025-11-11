import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

dotenv.config();

const _path = path.join(process.cwd(), './services/environment.ts');
let environments = '';

for (const prop in process.env) {
  if (prop.indexOf('ANALYTICS_BUILDER_') >= 0) {
    environments += `        ${prop}: "${process.env[prop]}", \n`;
  }
}

environments = `
export const environments: any = {
${environments}
}
`;

fs.writeFileSync(_path, environments);
console.log('Arquivo environments.ts gerado com sucesso!');

import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('database/account_deletion_release_manifest.json',root),'utf8'));
if(manifest.version!==1||new Set(manifest.files).size!==manifest.files.length)throw Error('Invalid deletion release manifest');
let sql="begin;\nset local lock_timeout='3s';\nset local statement_timeout='60s';\nselect pg_advisory_xact_lock(812437,20261105);\n";
for(const file of manifest.files){
 if(!/^account_deletion_[a-z_]+\.sql$/.test(file))throw Error('Invalid migration path');
 const source=await readFile(new URL('database/'+file,root),'utf8');
 sql+=`\n-- ${file} sha256:${createHash('sha256').update(source).digest('hex')}\n`;
 sql+=source.replace(/^(begin|commit);\s*$/gmi,'')+'\n';
}
sql+='\ncommit;\n';
if(!process.argv[2])throw Error('Output path required');
await writeFile(process.argv[2],sql);
console.log(JSON.stringify({files:manifest.files.length,bytes:Buffer.byteLength(sql),sha256:createHash('sha256').update(sql).digest('hex')}));

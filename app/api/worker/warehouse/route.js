import { privateAuth } from '../../../../lib/workerPrivate';
import { warehouseGet } from '../../../../lib/workerWarehouse.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) { return warehouseGet(request, privateAuth); }

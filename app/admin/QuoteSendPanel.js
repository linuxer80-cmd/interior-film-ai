22:32:50.101 Running build in Washington, D.C., USA (East) – iad1
22:32:50.103 Build machine configuration: 2 cores, 8 GB
22:32:50.322 Cloning github.com/linuxer80-cmd/interior-film-ai (Branch: main, Commit: 08549b8)
22:32:50.900 Cloning completed: 577.000ms
22:32:51.553 Restored build cache from previous deployment (DUWKmEcyNpfPQpFVfs51ncdJehKu)
22:32:51.985 Running "vercel build"
22:32:52.010 Vercel CLI 59.25.4
22:32:52.866 Installing dependencies...
22:32:56.546 
22:32:56.547 up to date in 3s
22:32:56.547 
22:32:56.548 8 packages are looking for funding
22:32:56.548   run `npm fund` for details
22:32:56.593 Detected Next.js version: 16.3.6
22:32:56.601 Running "npm run build"
22:32:56.979 
22:32:56.980 > interior-film-ai@1.0.0 build
22:32:56.980 > next build
22:32:56.980 
22:32:57.471 ▲ Next.js 16.3.6 (Turbopack)
22:32:57.542   Applying modifyConfig from Vercel
22:32:57.545 ✓ Running next.config took 73ms
22:32:57.661 
22:32:57.693   Creating an optimized production build ...
22:32:59.931 
22:32:59.933 > Build error occurred
22:32:59.936 Error: Turbopack build failed with 16 errors:
22:32:59.936 ./app/admin/quoteUtils.js:5:1
22:32:59.936 Error: Export copyQuoteImage doesn't exist in target module
22:32:59.936    3 | import { useEffect, useState } from "react";
22:32:59.937    4 |
22:32:59.937 >  5 | import {
22:32:59.937      | ^^^^^^^
22:32:59.937 >  6 |   createQuotePreview,
22:32:59.937      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.937 >  7 |   downloadQuoteImage,
22:32:59.937      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.938 >  8 |   copyQuoteImage,
22:32:59.938      | ^^^^^^^^^^^^^^^^^
22:32:59.938 >  9 |   openCustomerSms,
22:32:59.938      | ^^^^^^^^^^^^^^^^^^
22:32:59.938 > 10 | } from "./quoteUtils";
22:32:59.938      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.939   11 |
22:32:59.939   12 | export default function QuoteSendPanel({
22:32:59.939   13 |   lead,
22:32:59.943 
22:32:59.943 The export copyQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.943 Did you mean to import default?
22:32:59.944 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.944 
22:32:59.944 Import traces:
22:32:59.944   Client Component Browser:
22:32:59.944     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.944     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.944     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.944     ./app/admin/page.js [Client Component Browser]
22:32:59.944     ./app/admin/page.js [Server Component]
22:32:59.944 
22:32:59.944   Client Component SSR:
22:32:59.944     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.944     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.944     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.945     ./app/admin/page.js [Client Component SSR]
22:32:59.945     ./app/admin/page.js [Server Component]
22:32:59.945 
22:32:59.945 
22:32:59.945 ./app/admin/quoteUtils.js:5:1
22:32:59.945 Error: Export copyQuoteImage doesn't exist in target module
22:32:59.945    3 | import { useEffect, useState } from "react";
22:32:59.945    4 |
22:32:59.945 >  5 | import {
22:32:59.945      | ^^^^^^^
22:32:59.945 >  6 |   createQuotePreview,
22:32:59.945      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.945 >  7 |   downloadQuoteImage,
22:32:59.945      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.946 >  8 |   copyQuoteImage,
22:32:59.946      | ^^^^^^^^^^^^^^^^^
22:32:59.946 >  9 |   openCustomerSms,
22:32:59.946      | ^^^^^^^^^^^^^^^^^^
22:32:59.946 > 10 | } from "./quoteUtils";
22:32:59.946      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.946   11 |
22:32:59.946   12 | export default function QuoteSendPanel({
22:32:59.946   13 |   lead,
22:32:59.946 
22:32:59.946 The export copyQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.946 Did you mean to import default?
22:32:59.946 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.947 
22:32:59.947 Import traces:
22:32:59.947   Client Component Browser:
22:32:59.947     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.947     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.947     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.948     ./app/admin/page.js [Client Component Browser]
22:32:59.948     ./app/admin/page.js [Server Component]
22:32:59.948 
22:32:59.948   Client Component SSR:
22:32:59.948     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.948     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.949     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.949     ./app/admin/page.js [Client Component SSR]
22:32:59.949     ./app/admin/page.js [Server Component]
22:32:59.949 
22:32:59.949 
22:32:59.949 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.950 Error: Export createQuotePreview doesn't exist in target module
22:32:59.950    6 | } from "react";
22:32:59.950    7 |
22:32:59.950 >  8 | import {
22:32:59.950      | ^^^^^^^
22:32:59.950 >  9 |   createQuotePreview,
22:32:59.951      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.951 > 10 |   downloadQuoteImage,
22:32:59.951      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.951 > 11 |   shareQuoteImage,
22:32:59.951      | ^^^^^^^^^^^^^^^^^^
22:32:59.952 > 12 |   openCustomerSms,
22:32:59.952      | ^^^^^^^^^^^^^^^^^^
22:32:59.952 > 13 | } from "./quoteUtils";
22:32:59.952      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.952   14 |
22:32:59.953   15 | export default function QuoteSendPanel({
22:32:59.953   16 |   lead,
22:32:59.953 
22:32:59.953 The export createQuotePreview was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.954 Did you mean to import default?
22:32:59.954 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.954 
22:32:59.954 Import traces:
22:32:59.954   Client Component Browser:
22:32:59.955     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.955     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.955     ./app/admin/page.js [Client Component Browser]
22:32:59.955     ./app/admin/page.js [Server Component]
22:32:59.955 
22:32:59.955   Client Component SSR:
22:32:59.955     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.956     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.956     ./app/admin/page.js [Client Component SSR]
22:32:59.956     ./app/admin/page.js [Server Component]
22:32:59.956 
22:32:59.956 
22:32:59.956 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.956 Error: Export createQuotePreview doesn't exist in target module
22:32:59.956    6 | } from "react";
22:32:59.956    7 |
22:32:59.957 >  8 | import {
22:32:59.957      | ^^^^^^^
22:32:59.957 >  9 |   createQuotePreview,
22:32:59.957      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.957 > 10 |   downloadQuoteImage,
22:32:59.957      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.957 > 11 |   shareQuoteImage,
22:32:59.957      | ^^^^^^^^^^^^^^^^^^
22:32:59.957 > 12 |   openCustomerSms,
22:32:59.957      | ^^^^^^^^^^^^^^^^^^
22:32:59.958 > 13 | } from "./quoteUtils";
22:32:59.958      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.958   14 |
22:32:59.958   15 | export default function QuoteSendPanel({
22:32:59.958   16 |   lead,
22:32:59.958 
22:32:59.958 The export createQuotePreview was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.958 Did you mean to import default?
22:32:59.958 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.958 
22:32:59.958 Import traces:
22:32:59.958   Client Component Browser:
22:32:59.958     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.958     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.959     ./app/admin/page.js [Client Component Browser]
22:32:59.959     ./app/admin/page.js [Server Component]
22:32:59.959 
22:32:59.959   Client Component SSR:
22:32:59.959     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.959     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.959     ./app/admin/page.js [Client Component SSR]
22:32:59.959     ./app/admin/page.js [Server Component]
22:32:59.959 
22:32:59.960 
22:32:59.960 ./app/admin/quoteUtils.js:5:1
22:32:59.960 Error: Export createQuotePreview doesn't exist in target module
22:32:59.960    3 | import { useEffect, useState } from "react";
22:32:59.960    4 |
22:32:59.960 >  5 | import {
22:32:59.960      | ^^^^^^^
22:32:59.960 >  6 |   createQuotePreview,
22:32:59.960      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.960 >  7 |   downloadQuoteImage,
22:32:59.961      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.961 >  8 |   copyQuoteImage,
22:32:59.961      | ^^^^^^^^^^^^^^^^^
22:32:59.961 >  9 |   openCustomerSms,
22:32:59.961      | ^^^^^^^^^^^^^^^^^^
22:32:59.961 > 10 | } from "./quoteUtils";
22:32:59.961      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.961   11 |
22:32:59.961   12 | export default function QuoteSendPanel({
22:32:59.961   13 |   lead,
22:32:59.961 
22:32:59.961 The export createQuotePreview was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.961 Did you mean to import default?
22:32:59.961 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.961 
22:32:59.961 Import traces:
22:32:59.961   Client Component Browser:
22:32:59.962     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.962     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.962     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.962     ./app/admin/page.js [Client Component Browser]
22:32:59.962     ./app/admin/page.js [Server Component]
22:32:59.962 
22:32:59.962   Client Component SSR:
22:32:59.962     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.962     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.962     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.962     ./app/admin/page.js [Client Component SSR]
22:32:59.962     ./app/admin/page.js [Server Component]
22:32:59.962 
22:32:59.962 
22:32:59.962 ./app/admin/quoteUtils.js:5:1
22:32:59.962 Error: Export createQuotePreview doesn't exist in target module
22:32:59.962    3 | import { useEffect, useState } from "react";
22:32:59.962    4 |
22:32:59.962 >  5 | import {
22:32:59.962      | ^^^^^^^
22:32:59.962 >  6 |   createQuotePreview,
22:32:59.962      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.962 >  7 |   downloadQuoteImage,
22:32:59.962      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.962 >  8 |   copyQuoteImage,
22:32:59.962      | ^^^^^^^^^^^^^^^^^
22:32:59.963 >  9 |   openCustomerSms,
22:32:59.963      | ^^^^^^^^^^^^^^^^^^
22:32:59.963 > 10 | } from "./quoteUtils";
22:32:59.963      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.963   11 |
22:32:59.963   12 | export default function QuoteSendPanel({
22:32:59.963   13 |   lead,
22:32:59.963 
22:32:59.963 The export createQuotePreview was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.963 Did you mean to import default?
22:32:59.964 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.964 
22:32:59.964 Import traces:
22:32:59.964   Client Component Browser:
22:32:59.964     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.964     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.964     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.964     ./app/admin/page.js [Client Component Browser]
22:32:59.965     ./app/admin/page.js [Server Component]
22:32:59.965 
22:32:59.965   Client Component SSR:
22:32:59.965     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.965     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.965     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.965     ./app/admin/page.js [Client Component SSR]
22:32:59.965     ./app/admin/page.js [Server Component]
22:32:59.966 
22:32:59.966 
22:32:59.966 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.966 Error: Export downloadQuoteImage doesn't exist in target module
22:32:59.966    6 | } from "react";
22:32:59.966    7 |
22:32:59.966 >  8 | import {
22:32:59.966      | ^^^^^^^
22:32:59.966 >  9 |   createQuotePreview,
22:32:59.966      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.966 > 10 |   downloadQuoteImage,
22:32:59.966      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.966 > 11 |   shareQuoteImage,
22:32:59.966      | ^^^^^^^^^^^^^^^^^^
22:32:59.966 > 12 |   openCustomerSms,
22:32:59.967      | ^^^^^^^^^^^^^^^^^^
22:32:59.967 > 13 | } from "./quoteUtils";
22:32:59.967      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.967   14 |
22:32:59.967   15 | export default function QuoteSendPanel({
22:32:59.967   16 |   lead,
22:32:59.967 
22:32:59.967 The export downloadQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.967 Did you mean to import default?
22:32:59.967 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.967 
22:32:59.967 Import traces:
22:32:59.967   Client Component Browser:
22:32:59.967     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.967     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.968     ./app/admin/page.js [Client Component Browser]
22:32:59.968     ./app/admin/page.js [Server Component]
22:32:59.968 
22:32:59.968   Client Component SSR:
22:32:59.968     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.968     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.968     ./app/admin/page.js [Client Component SSR]
22:32:59.968     ./app/admin/page.js [Server Component]
22:32:59.968 
22:32:59.968 
22:32:59.968 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.968 Error: Export downloadQuoteImage doesn't exist in target module
22:32:59.969    6 | } from "react";
22:32:59.969    7 |
22:32:59.969 >  8 | import {
22:32:59.969      | ^^^^^^^
22:32:59.969 >  9 |   createQuotePreview,
22:32:59.969      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.969 > 10 |   downloadQuoteImage,
22:32:59.969      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.969 > 11 |   shareQuoteImage,
22:32:59.969      | ^^^^^^^^^^^^^^^^^^
22:32:59.969 > 12 |   openCustomerSms,
22:32:59.969      | ^^^^^^^^^^^^^^^^^^
22:32:59.969 > 13 | } from "./quoteUtils";
22:32:59.970      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.970   14 |
22:32:59.970   15 | export default function QuoteSendPanel({
22:32:59.970   16 |   lead,
22:32:59.970 
22:32:59.970 The export downloadQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.970 Did you mean to import default?
22:32:59.970 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.970 
22:32:59.970 Import traces:
22:32:59.970   Client Component Browser:
22:32:59.970     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.970     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.970     ./app/admin/page.js [Client Component Browser]
22:32:59.970     ./app/admin/page.js [Server Component]
22:32:59.970 
22:32:59.970   Client Component SSR:
22:32:59.970     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.970     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.970     ./app/admin/page.js [Client Component SSR]
22:32:59.970     ./app/admin/page.js [Server Component]
22:32:59.970 
22:32:59.970 
22:32:59.970 ./app/admin/quoteUtils.js:5:1
22:32:59.970 Error: Export downloadQuoteImage doesn't exist in target module
22:32:59.970    3 | import { useEffect, useState } from "react";
22:32:59.970    4 |
22:32:59.971 >  5 | import {
22:32:59.971      | ^^^^^^^
22:32:59.971 >  6 |   createQuotePreview,
22:32:59.971      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.971 >  7 |   downloadQuoteImage,
22:32:59.971      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.971 >  8 |   copyQuoteImage,
22:32:59.971      | ^^^^^^^^^^^^^^^^^
22:32:59.972 >  9 |   openCustomerSms,
22:32:59.972      | ^^^^^^^^^^^^^^^^^^
22:32:59.972 > 10 | } from "./quoteUtils";
22:32:59.972      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.972   11 |
22:32:59.972   12 | export default function QuoteSendPanel({
22:32:59.972   13 |   lead,
22:32:59.973 
22:32:59.973 The export downloadQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.973 Did you mean to import default?
22:32:59.973 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.973 
22:32:59.973 Import traces:
22:32:59.973   Client Component Browser:
22:32:59.973     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.973     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.973     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.973     ./app/admin/page.js [Client Component Browser]
22:32:59.974     ./app/admin/page.js [Server Component]
22:32:59.974 
22:32:59.974   Client Component SSR:
22:32:59.974     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.974     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.974     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.974     ./app/admin/page.js [Client Component SSR]
22:32:59.974     ./app/admin/page.js [Server Component]
22:32:59.974 
22:32:59.974 
22:32:59.975 ./app/admin/quoteUtils.js:5:1
22:32:59.975 Error: Export downloadQuoteImage doesn't exist in target module
22:32:59.975    3 | import { useEffect, useState } from "react";
22:32:59.975    4 |
22:32:59.975 >  5 | import {
22:32:59.975      | ^^^^^^^
22:32:59.975 >  6 |   createQuotePreview,
22:32:59.975      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.975 >  7 |   downloadQuoteImage,
22:32:59.975      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.976 >  8 |   copyQuoteImage,
22:32:59.976      | ^^^^^^^^^^^^^^^^^
22:32:59.976 >  9 |   openCustomerSms,
22:32:59.976      | ^^^^^^^^^^^^^^^^^^
22:32:59.976 > 10 | } from "./quoteUtils";
22:32:59.976      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.976   11 |
22:32:59.976   12 | export default function QuoteSendPanel({
22:32:59.976   13 |   lead,
22:32:59.976 
22:32:59.976 The export downloadQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.976 Did you mean to import default?
22:32:59.976 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.976 
22:32:59.976 Import traces:
22:32:59.976   Client Component Browser:
22:32:59.976     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.976     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.976     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.976     ./app/admin/page.js [Client Component Browser]
22:32:59.976     ./app/admin/page.js [Server Component]
22:32:59.977 
22:32:59.977   Client Component SSR:
22:32:59.977     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.977     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.977     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.977     ./app/admin/page.js [Client Component SSR]
22:32:59.977     ./app/admin/page.js [Server Component]
22:32:59.977 
22:32:59.977 
22:32:59.977 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.977 Error: Export openCustomerSms doesn't exist in target module
22:32:59.977    6 | } from "react";
22:32:59.977    7 |
22:32:59.977 >  8 | import {
22:32:59.977      | ^^^^^^^
22:32:59.977 >  9 |   createQuotePreview,
22:32:59.977      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.977 > 10 |   downloadQuoteImage,
22:32:59.977      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.977 > 11 |   shareQuoteImage,
22:32:59.977      | ^^^^^^^^^^^^^^^^^^
22:32:59.977 > 12 |   openCustomerSms,
22:32:59.977      | ^^^^^^^^^^^^^^^^^^
22:32:59.977 > 13 | } from "./quoteUtils";
22:32:59.977      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.977   14 |
22:32:59.977   15 | export default function QuoteSendPanel({
22:32:59.977   16 |   lead,
22:32:59.977 
22:32:59.977 The export openCustomerSms was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.978 Did you mean to import default?
22:32:59.978 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.978 
22:32:59.978 Import traces:
22:32:59.978   Client Component Browser:
22:32:59.978     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.978     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.978     ./app/admin/page.js [Client Component Browser]
22:32:59.978     ./app/admin/page.js [Server Component]
22:32:59.978 
22:32:59.978   Client Component SSR:
22:32:59.978     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.978     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.978     ./app/admin/page.js [Client Component SSR]
22:32:59.978     ./app/admin/page.js [Server Component]
22:32:59.978 
22:32:59.978 
22:32:59.978 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.978 Error: Export openCustomerSms doesn't exist in target module
22:32:59.978    6 | } from "react";
22:32:59.978    7 |
22:32:59.978 >  8 | import {
22:32:59.978      | ^^^^^^^
22:32:59.978 >  9 |   createQuotePreview,
22:32:59.978      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.978 > 10 |   downloadQuoteImage,
22:32:59.978      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.978 > 11 |   shareQuoteImage,
22:32:59.978      | ^^^^^^^^^^^^^^^^^^
22:32:59.979 > 12 |   openCustomerSms,
22:32:59.979      | ^^^^^^^^^^^^^^^^^^
22:32:59.979 > 13 | } from "./quoteUtils";
22:32:59.979      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.979   14 |
22:32:59.979   15 | export default function QuoteSendPanel({
22:32:59.979   16 |   lead,
22:32:59.979 
22:32:59.979 The export openCustomerSms was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.979 Did you mean to import default?
22:32:59.979 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.979 
22:32:59.979 Import traces:
22:32:59.979   Client Component Browser:
22:32:59.979     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.980     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.980     ./app/admin/page.js [Client Component Browser]
22:32:59.980     ./app/admin/page.js [Server Component]
22:32:59.980 
22:32:59.980   Client Component SSR:
22:32:59.980     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.980     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.980     ./app/admin/page.js [Client Component SSR]
22:32:59.980     ./app/admin/page.js [Server Component]
22:32:59.980 
22:32:59.980 
22:32:59.980 ./app/admin/quoteUtils.js:5:1
22:32:59.980 Error: Export openCustomerSms doesn't exist in target module
22:32:59.980    3 | import { useEffect, useState } from "react";
22:32:59.980    4 |
22:32:59.980 >  5 | import {
22:32:59.980      | ^^^^^^^
22:32:59.980 >  6 |   createQuotePreview,
22:32:59.981      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.981 >  7 |   downloadQuoteImage,
22:32:59.981      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.981 >  8 |   copyQuoteImage,
22:32:59.981      | ^^^^^^^^^^^^^^^^^
22:32:59.981 >  9 |   openCustomerSms,
22:32:59.981      | ^^^^^^^^^^^^^^^^^^
22:32:59.981 > 10 | } from "./quoteUtils";
22:32:59.982      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.982   11 |
22:32:59.982   12 | export default function QuoteSendPanel({
22:32:59.982   13 |   lead,
22:32:59.982 
22:32:59.983 The export openCustomerSms was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.983 Did you mean to import default?
22:32:59.983 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.983 
22:32:59.983 Import traces:
22:32:59.983   Client Component Browser:
22:32:59.984     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.984     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.984     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.984     ./app/admin/page.js [Client Component Browser]
22:32:59.984     ./app/admin/page.js [Server Component]
22:32:59.984 
22:32:59.984   Client Component SSR:
22:32:59.984     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.985     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.985     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.985     ./app/admin/page.js [Client Component SSR]
22:32:59.985     ./app/admin/page.js [Server Component]
22:32:59.985 
22:32:59.985 
22:32:59.985 ./app/admin/quoteUtils.js:5:1
22:32:59.985 Error: Export openCustomerSms doesn't exist in target module
22:32:59.985    3 | import { useEffect, useState } from "react";
22:32:59.985    4 |
22:32:59.985 >  5 | import {
22:32:59.985      | ^^^^^^^
22:32:59.985 >  6 |   createQuotePreview,
22:32:59.985      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.985 >  7 |   downloadQuoteImage,
22:32:59.985      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.985 >  8 |   copyQuoteImage,
22:32:59.985      | ^^^^^^^^^^^^^^^^^
22:32:59.985 >  9 |   openCustomerSms,
22:32:59.985      | ^^^^^^^^^^^^^^^^^^
22:32:59.985 > 10 | } from "./quoteUtils";
22:32:59.985      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.986   11 |
22:32:59.986   12 | export default function QuoteSendPanel({
22:32:59.986   13 |   lead,
22:32:59.986 
22:32:59.986 The export openCustomerSms was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.986 Did you mean to import default?
22:32:59.986 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.986 
22:32:59.986 Import traces:
22:32:59.986   Client Component Browser:
22:32:59.986     ./app/admin/quoteUtils.js [Client Component Browser]
22:32:59.986     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.986     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.986     ./app/admin/page.js [Client Component Browser]
22:32:59.986     ./app/admin/page.js [Server Component]
22:32:59.986 
22:32:59.986   Client Component SSR:
22:32:59.986     ./app/admin/quoteUtils.js [Client Component SSR]
22:32:59.986     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.986     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.986     ./app/admin/page.js [Client Component SSR]
22:32:59.986     ./app/admin/page.js [Server Component]
22:32:59.986 
22:32:59.986 
22:32:59.986 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.986 Error: Export shareQuoteImage doesn't exist in target module
22:32:59.986    6 | } from "react";
22:32:59.986    7 |
22:32:59.987 >  8 | import {
22:32:59.987      | ^^^^^^^
22:32:59.987 >  9 |   createQuotePreview,
22:32:59.987      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.987 > 10 |   downloadQuoteImage,
22:32:59.987      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.987 > 11 |   shareQuoteImage,
22:32:59.987      | ^^^^^^^^^^^^^^^^^^
22:32:59.987 > 12 |   openCustomerSms,
22:32:59.988      | ^^^^^^^^^^^^^^^^^^
22:32:59.988 > 13 | } from "./quoteUtils";
22:32:59.988      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.988   14 |
22:32:59.988   15 | export default function QuoteSendPanel({
22:32:59.988   16 |   lead,
22:32:59.988 
22:32:59.988 The export shareQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-client] (ecmascript).
22:32:59.988 Did you mean to import default?
22:32:59.989 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.989 
22:32:59.989 Import traces:
22:32:59.989   Client Component Browser:
22:32:59.989     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.989     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.989     ./app/admin/page.js [Client Component Browser]
22:32:59.989     ./app/admin/page.js [Server Component]
22:32:59.989 
22:32:59.989   Client Component SSR:
22:32:59.989     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.989     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.989     ./app/admin/page.js [Client Component SSR]
22:32:59.989     ./app/admin/page.js [Server Component]
22:32:59.989 
22:32:59.989 
22:32:59.989 ./app/admin/QuoteSendPanel.js:8:1
22:32:59.989 Error: Export shareQuoteImage doesn't exist in target module
22:32:59.989    6 | } from "react";
22:32:59.990    7 |
22:32:59.990 >  8 | import {
22:32:59.990      | ^^^^^^^
22:32:59.990 >  9 |   createQuotePreview,
22:32:59.990      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.990 > 10 |   downloadQuoteImage,
22:32:59.990      | ^^^^^^^^^^^^^^^^^^^^^
22:32:59.990 > 11 |   shareQuoteImage,
22:32:59.990      | ^^^^^^^^^^^^^^^^^^
22:32:59.990 > 12 |   openCustomerSms,
22:32:59.990      | ^^^^^^^^^^^^^^^^^^
22:32:59.990 > 13 | } from "./quoteUtils";
22:32:59.991      | ^^^^^^^^^^^^^^^^^^^^^^
22:32:59.991   14 |
22:32:59.991   15 | export default function QuoteSendPanel({
22:32:59.991   16 |   lead,
22:32:59.991 
22:32:59.991 The export shareQuoteImage was not found in module [project]/app/admin/quoteUtils.js [app-ssr] (ecmascript).
22:32:59.991 Did you mean to import default?
22:32:59.991 All exports of the module are statically known (It doesn't have dynamic exports). So it's known statically that the requested export doesn't exist.
22:32:59.991 
22:32:59.991 Import traces:
22:32:59.991   Client Component Browser:
22:32:59.992     ./app/admin/QuoteSendPanel.js [Client Component Browser]
22:32:59.992     ./app/admin/LeadsTab.js [Client Component Browser]
22:32:59.992     ./app/admin/page.js [Client Component Browser]
22:32:59.992     ./app/admin/page.js [Server Component]
22:32:59.992 
22:32:59.992   Client Component SSR:
22:32:59.992     ./app/admin/QuoteSendPanel.js [Client Component SSR]
22:32:59.992     ./app/admin/LeadsTab.js [Client Component SSR]
22:32:59.992     ./app/admin/page.js [Client Component SSR]
22:32:59.992     ./app/admin/page.js [Server Component]
22:32:59.992 
22:32:59.992 
22:32:59.993     at <unknown> (./app/admin/quoteUtils.js:5:1)
22:32:59.993     at <unknown> (./app/admin/quoteUtils.js:5:1)
22:32:59.993     at <unknown> (./app/admin/QuoteSendPanel.js:8:1)
22:32:59.993     at <unknown> (./app/admin/QuoteSendPanel.js:8:1)
22:32:59.993     at <unknown> (./app/admin/quoteUtils.js:5:1)
22:32:59.993     ... collapsed 8 duplicate lines matching above 4 lines 2 times...
22:32:59.993     at <unknown> (./app/admin/quoteUtils.js:5:1)
22:32:59.993     at <unknown> (./app/admin/QuoteSendPanel.js:8:1)
22:32:59.993     at <unknown> (./app/admin/QuoteSendPanel.js:8:1)
22:33:00.022 Error: Command "npm run build" exited with 1

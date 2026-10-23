import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {transform,loadBindings} from 'next/dist/build/swc/index.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('priced hierarchy and legacy results render the best match and all case badges',async()=>{
 await loadBindings();
 const source=fs.readFileSync(new URL('../app/components/EstimateResult.js',import.meta.url),'utf8');
 const result=await transform(source,{filename:'EstimateResult.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}});
 const module={exports:{}};new Function('require','module','exports',result.code)(require,module,module.exports);
 const Component=module.exports.default;
 for(const hierarchy of [true,false]){
 const match={work_item_id:'work',actual_cost:250000,visual_rank:1,classification_similarity:80,hierarchy_level:5,...(hierarchy?{hierarchy_matched:true}:{visual_verified:true})};
 const html=renderToStaticMarkup(React.createElement(Component,{imageCount:1,groups:[{key:'shoe',category:'신발장',subCategory:'일반 신발장',photos:[],similarItems:[match],estimate:{min:250000,max:250000,average:250000,count:1}}]}));
 assert.match(html,/250,000/);assert.match(html,hierarchy?/분류 일치도 80%/ : /구조·범위 비교 완료/);
 }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const d=path.dirname(fileURLToPath(import.meta.url));
const text=fs.readFileSync(process.env.TMDB_WORKER_TEST_SOURCE ?? path.join(d,"..","cloudflare-worker","tmdb-proxy.js"),"utf8");
const module=await import("data:text/javascript;base64,"+Buffer.from(text+"\nexport { isAllowedTmdbRequest };").toString("base64"));
const validate=(media,fields)=>module.isAllowedTmdbRequest(new URL("https://worker.example/builder/discover/"+media+"?"+new URLSearchParams(fields)));
const base={include_adult:"false",sort_by:"popularity.desc"};
const good=[
["topic-free baseline", "movie", {}],
["filters only", "movie", {"primary_release_date.gte":"1990-01-01","primary_release_date.lte":"1999-12-31",with_original_language:"fr","vote_average.gte":"7"}],
["keyword AND","movie",{with_keywords:"15097,9951"}],
["keyword OR","movie",{with_keywords:"15097|9951"}],
["OR plus genre","movie",{with_keywords:"15097|9951",with_genres:"27"}],
["single exclusion","movie",{with_keywords:"15097|9951",without_keywords:"15097"}],
["opaque comma exclusions","movie",{without_keywords:"15097,9951"}],
["opaque pipe exclusions","movie",{without_keywords:"15097|9951"}],
["all Movie fields","movie",{with_genres:"27|878",without_genres:"35,99","primary_release_date.gte":"1975-01-01","primary_release_date.lte":"1979-12-31","vote_average.gte":"0","vote_average.lte":"10","vote_count.gte":"0",with_original_language:"en",with_origin_country:"US",with_keywords:"15097|9951",without_keywords:"9826",with_companies:"20|33",without_companies:"3",year:"1979",watch_region:"AU",with_watch_providers:"8|337",without_watch_providers:"2",with_watch_monetization_types:"flatrate|free|ads|rent|buy"}],
["Series year, dates, network","tv",{first_air_date_year:"2000","first_air_date.gte":"2000-01-01","first_air_date.lte":"2000-12-31",with_networks:"213"}],
["Series network OR","tv",{with_networks:"213|2"}],
["Series network AND","tv",{with_networks:"213,2"}],
["exclusion-only provider","tv",{without_watch_providers:"8",watch_region:"US"}],
["Movie recent","movie",{sort_by:"primary_release_date.desc"}],
["Series recent","tv",{sort_by:"first_air_date.desc"}],
["rating sort","movie",{sort_by:"vote_average.desc"}],
["votes sort","tv",{sort_by:"vote_count.desc"}],
];
for(const [label,media,fields]of good)test("accept "+label,()=>assert.equal(validate(media,{...base,...fields}),true));
const bad=[
["unknown", {surprise:"1"}],["cast", {with_cast:"31"}],["runtime",{"with_runtime.gte":"60"}],
["max votes",{"vote_count.lte":"1000"}],["subscription choice",{with_watch_providers:"8",watch_region:"AU",with_watch_monetization_types:"flatrate"}],
["missing provider union",{with_watch_providers:"8",watch_region:"AU"}],["missing region",{without_watch_providers:"8"}],["unused region",{watch_region:"AU"}],["unused monetization",{with_watch_monetization_types:"flatrate|free|ads|rent|buy"}],
["mixed",{with_keywords:"15097|9951,4379"}],["grouped",{with_keywords:"(15097|9951),4379"}],["fuzzy string",{without_keywords:"shark"}],["mixed exclusion",{without_keywords:"15097,9951|4379"}],
["duplicate IDs",{with_keywords:"15097,15097"}],["leading zero",{with_keywords:"015097"}],["empty token",{with_keywords:"15097|"}],["whitespace",{with_keywords:"15097, 9951"}],["overflow ID",{with_keywords:"2147483648"}],["network on Movies",{with_networks:"213"}],
["wrong media date",{"first_air_date.gte":"2000-01-01"}],["bad date",{"primary_release_date.gte":"2025-02-29"}],["reverse dates",{"primary_release_date.gte":"2026-01-01","primary_release_date.lte":"2025-01-01"}],
["wrong media sort",{sort_by:"first_air_date.desc"}],["unsupported sort",{sort_by:"revenue.desc"}],["rating precision form",{"vote_average.gte":"7.00"}],["rating over 10",{"vote_average.lte":"11"}],["reverse rating",{"vote_average.gte":"8","vote_average.lte":"6"}],
["negative votes",{"vote_count.gte":"-1"}],["overflow votes",{"vote_count.gte":"2147483648"}],["year zero",{year:"0000"}],["float year",{year:"2000.5"}],["bad language",{with_original_language:"eng"}],["bad country",{with_origin_country:"au"}],
["paging",{page:"2"}],["API key",{api_key:"not-a-secret"}],["append",{append_to_response:"keywords"}],["adult true",{include_adult:"true"}],
];
for(const [label,fields]of bad)test("reject "+label,()=>assert.equal(validate("movie",{...base,...fields}),false));
test("Network expressions reject malformed values, exclusions and wrong routes",()=>{
 for(const expression of ["", "0", "02", "213|", "|2", "213,,2", "213|2,49", "(213|2)", "213|213", "213,213", "213| 2", "213|2147483648", "2e2", "213.0"]){
  assert.equal(validate("tv",{...base,with_networks:expression}),false,expression);
 }
 for(const expression of ["213|2", "213,2"]){
  assert.equal(validate("movie",{...base,with_networks:expression}),false);
  assert.equal(module.isAllowedTmdbRequest(new URL("https://worker.example/3/discover/tv?"+new URLSearchParams({with_networks:expression,sort_by:"popularity.desc"}))),false);
 }
 assert.equal(validate("tv",{...base,without_networks:"2"}),false);
 assert.equal(module.isAllowedTmdbRequest(new URL("https://worker.example/builder/discover/tv?"+new URLSearchParams(base)+"&with_networks=213&with_networks=2")),false);
});
test("Series Network operators reach only the fixed upstream TV route unchanged; local transport",async()=>{
 const saved=globalThis.fetch,savedError=console.error;let called;console.error=()=>{};
 globalThis.fetch=async(url)=>{called=new URL(url);throw new Error("intentional local transport stop");};
 try{for(const expression of ["213|2","213,2"]){
  const response=await module.default.fetch(new Request("https://worker.example/builder/discover/tv?"+new URLSearchParams({...base,with_networks:expression}),{headers:{Origin:"https://davecollections.github.io"}}),{TMDB_BEARER_TOKEN:"unit-placeholder"});
  assert.equal(response.status,502);assert.equal(called.origin,"https://api.themoviedb.org");assert.equal(called.pathname,"/3/discover/tv");assert.equal(called.searchParams.get("with_networks"),expression);
 }}finally{globalThis.fetch=saved;console.error=savedError;}
});
test("reject duplicate query keys and missing required policy/sort",()=>{
 for(const query of ["include_adult=false&include_adult=false&sort_by=popularity.desc","include_adult=false&sort_by=popularity.desc&with_keywords=15097&with_keywords=9951","sort_by=popularity.desc","include_adult=false"]){
 assert.equal(module.isAllowedTmdbRequest(new URL("https://worker.example/builder/discover/movie?"+query)),false);}
});
test("alias mapping preserves query values and fixed upstream host; pure transport test",async()=>{
 const saved=globalThis.fetch;let called;
 globalThis.fetch=async(url)=>{called=new URL(url);throw new Error("intentional unit transport stop");};
 const savedError=console.error;console.error=()=>{};
 try{
 const response=await module.default.fetch(new Request("https://worker.example/builder/discover/movie?"+new URLSearchParams({...base,with_keywords:"15097|9951",with_genres:"27"}),{headers:{Origin:"https://davecollections.github.io"}}),{TMDB_BEARER_TOKEN:"unit-placeholder"});
 assert.equal(response.status,502);assert.equal(response.headers.get("Cache-Control"),"no-store");
 assert.equal(called.origin,"https://api.themoviedb.org");assert.equal(called.pathname,"/3/discover/movie");
 assert.deepEqual([...called.searchParams],[...new URLSearchParams({...base,with_keywords:"15097|9951",with_genres:"27"})]);
 }finally{globalThis.fetch=saved;console.error=savedError;}
});
test("new aliases grant no origin-free service access",async()=>{
 const response=await module.default.fetch(new Request("https://worker.example/builder/discover/tv?"+new URLSearchParams(base),{headers:{"X-Nuvio-Service-Token":"unit-service-placeholder-long-enough"}}),{TMDB_BEARER_TOKEN:"unit-placeholder",NUVIO_PEOPLE_SERVICE_TOKEN:"unit-service-placeholder-long-enough"});
 assert.equal(response.status,403);assert.equal(await response.text(),"Origin not allowed");
});
